/**
 * Установка и снятие сессии на транспортном уровне.
 *
 * Сервис auth выдаёт токен и срок его действия; превращение этого в cookie —
 * забота транспорта. Сам токен наружу в теле ответа не отдаётся: он живёт
 * только в httpOnly cookie.
 */

import { generateToken } from '../lib/crypto';
import type { SessionResult, UserDto } from '../modules/auth.service';
import { csrfCookie, sessionCookie, clearedCookies } from './cookies';
/** Минимум, который нужен этим функциям: куда сложить cookie. */
type CookieSink = { setCookie: (cookie: string) => void };

/**
 * Кладёт сессию в cookie и возвращает то, что можно показать клиенту.
 *
 * Вместе с сессией выдаётся CSRF-токен: клиент читает его из cookie и
 * возвращает заголовком при изменяющих запросах.
 */
export function issueSession(ctx: CookieSink, result: SessionResult): { user: UserDto } {
  ctx.setCookie(sessionCookie(result.token, result.expiresAt));
  ctx.setCookie(csrfCookie(generateToken(24), result.expiresAt));
  return { user: result.user };
}

export function endSession(ctx: CookieSink): void {
  for (const cookie of clearedCookies()) ctx.setCookie(cookie);
}
