/**
 * Пароли и одноразовые токены.
 *
 * Два правила, вынесенные сюда, чтобы их нельзя было забыть:
 *  • пароль хэшируется argon2id — не bcrypt и не sha;
 *  • в базу кладётся ХЭШ токена, а не сам токен. Дамп базы не даёт войти
 *    под пользователем и не даёт сбросить чужой пароль.
 */

import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 2 = Argon2id. Значение вместо enum: @node-rs/argon2 экспортирует его
 *  как ambient const enum, недоступный при verbatimModuleSyntax. */
const ARGON2ID = 2;
const ARGON_OPTIONS = { algorithm: ARGON2ID } as const;

export function hashPassword(plain: string): Promise<string> {
  return argonHash(plain, ARGON_OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argonVerify(hash, plain, ARGON_OPTIONS);
  } catch {
    // Повреждённый или чужого формата хэш — это «не совпало», а не 500.
    return false;
  }
}

/** Секрет, который уходит наружу (в cookie или в письмо). */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** То, что кладётся в базу. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Сравнение хэшей за постоянное время. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Отпечаток тела запроса для проверки идемпотентности. */
export function hashPayload(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload ?? null)).digest('hex');
}
