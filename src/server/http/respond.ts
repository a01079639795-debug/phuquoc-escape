/**
 * Формирование HTTP-ответов и отображение доменных ошибок в коды состояния.
 *
 * Сервисы не знают про HTTP — они бросают доменные ошибки. Здесь и только
 * здесь происходит перевод. При выносе API в отдельный сервис заменяется
 * этот файл, а бизнес-логика остаётся нетронутой.
 */

import { Prisma } from '@prisma/client';
import { AppError } from '../errors';

const JSON_TYPE = 'application/json; charset=utf-8';

/**
 * BigInt не сериализуется в JSON штатно. Денежные значения уже приведены к
 * числам в маппере lib/money.ts, но подстраховка нужна: молчаливое падение
 * сериализации отлаживается заметно дольше, чем явное преобразование.
 */
function replacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? Number(value) : value;
}

function json(body: unknown, status: number, cookies: string[] = []): Response {
  const headers = new Headers({ 'content-type': JSON_TYPE });
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  return new Response(JSON.stringify(body, replacer), { status, headers });
}

/**
 * Успешный ответ.
 *
 * Списки сервисов уже имеют форму { data, meta } — она отдаётся как есть.
 * Одиночные значения оборачиваются в { data }, чтобы у всех ответов был
 * одинаковый конверт.
 */
export function ok(result: unknown, status = 200, cookies: string[] = []): Response {
  if (result === undefined || result === null) return json({ data: null }, status, cookies);

  const isEnvelope =
    typeof result === 'object' && result !== null && 'data' in result && 'meta' in result;

  return json(isEnvelope ? result : { data: result }, status, cookies);
}

export type ErrorBody = { error: { code: string; message: string; details?: unknown } };

/** Ошибка в едином формате. */
export function fail(error: unknown, cookies: string[] = []): Response {
  const { status, body } = describe(error);
  return json(body, status, cookies);
}

function describe(error: unknown): { status: number; body: ErrorBody } {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: { error: { code: error.code, message: error.message, details: error.details } },
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // Нарушение уникальности — единственный случай, который имеет смысл
    // объяснить клиенту. Остальные коды Prisma это дефекты нашего кода.
    if (error.code === 'P2002') {
      return {
        status: 409,
        body: { error: { code: 'CONFLICT', message: 'Запись с такими данными уже существует' } },
      };
    }
    if (error.code === 'P2023') {
      // Некорректный UUID в пути: это ошибка клиента, а не наш сбой.
      return {
        status: 400,
        body: { error: { code: 'INVALID_IDENTIFIER', message: 'Некорректный идентификатор' } },
      };
    }
    if (error.code === 'P2025') {
      return { status: 404, body: { error: { code: 'NOT_FOUND', message: 'Запись не найдена' } } };
    }
  }

  if (error instanceof SyntaxError) {
    return {
      status: 400,
      body: { error: { code: 'MALFORMED_JSON', message: 'Тело запроса не является корректным JSON' } },
    };
  }

  // Всё остальное — наш дефект. Наружу уходит только код: текст ошибки может
  // содержать имена таблиц, пути и фрагменты запроса.
  console.error('[api] необработанная ошибка:', error);
  return {
    status: 500,
    body: { error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } },
  };
}
