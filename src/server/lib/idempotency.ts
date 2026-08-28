/**
 * Идемпотентность POST-операций.
 *
 * В MVP закрывает единственный сценарий — двойную отправку формы заявки.
 * Механизм тот же, который на этапе 2 защитит создание броней, а на этапе 3 —
 * приём платёжных вебхуков, поэтому он универсален по scope.
 *
 * Три случая:
 *  • ключа нет            → выполняем операцию, сохраняем результат;
 *  • ключ есть, тело то же → возвращаем сохранённый результат, ничего не делая;
 *  • ключ есть, тело другое → ошибка: это не повтор, а другой запрос.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { hashPayload } from './crypto';
import { ConflictError } from '../errors';

/** Сколько храним результат. Дольше не нужно: повтор приходит в пределах минут. */
const TTL_HOURS = 24;

export type IdempotencyContext = {
  scope: string;
  key?: string | null;
  userId?: string | null;
  payload: unknown;
};

export async function withIdempotency<T>(ctx: IdempotencyContext, run: () => Promise<T>): Promise<T> {
  if (!ctx.key) return run();

  const requestHash = hashPayload(ctx.payload);
  const existing = await prisma.idempotencyKey.findUnique({
    where: { scope_key: { scope: ctx.scope, key: ctx.key } },
  });

  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw new ConflictError(
        'IDEMPOTENCY_KEY_REUSED',
        'Этот ключ идемпотентности уже использован с другими данными',
      );
    }
    return existing.responseBody as T;
  }

  const result = await run();

  try {
    await prisma.idempotencyKey.create({
      data: {
        scope: ctx.scope,
        key: ctx.key,
        userId: ctx.userId ?? null,
        requestHash,
        statusCode: 201,
        responseBody: result as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + TTL_HOURS * 3600_000),
      },
    });
  } catch (e) {
    // Гонка: два одинаковых запроса стартовали одновременно и оба прошли
    // проверку выше. Уникальный индекс (scope, key) пропустит только один.
    // Проигравший отдаёт результат победителя — наружу это выглядит как
    // корректный повтор.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const winner = await prisma.idempotencyKey.findUnique({
        where: { scope_key: { scope: ctx.scope, key: ctx.key } },
      });
      if (winner) return winner.responseBody as T;
    }
    throw e;
  }

  return result;
}

/** Уборка протухших ключей. Вызывается фоновой задачей, когда она появится. */
export async function purgeExpiredIdempotencyKeys(): Promise<number> {
  const { count } = await prisma.idempotencyKey.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
}
