/**
 * Cookie сессии и CSRF-токена.
 *
 * Сессионная cookie — httpOnly: JavaScript страницы к токену не обращается,
 * поэтому XSS не даёт его украсть. CSRF-токен, наоборот, читается скриптом
 * и отправляется заголовком — в этом весь смысл схемы double submit.
 */

export const SESSION_COOKIE = 'pq_session';
export const CSRF_COOKIE = 'pq_csrf';
export const CSRF_HEADER = 'x-csrf-token';

const isProduction = () => process.env.NODE_ENV === 'production';

type CookieOptions = {
  httpOnly?: boolean;
  maxAge?: number;
  expires?: Date;
  path?: string;
  sameSite?: 'Lax' | 'Strict' | 'None';
};

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  parts.push(`Path=${options.path ?? '/'}`);
  parts.push(`SameSite=${options.sameSite ?? 'Lax'}`);

  if (options.httpOnly) parts.push('HttpOnly');
  // Secure только в проде: на http://localhost браузер отбросил бы такую cookie.
  if (isProduction()) parts.push('Secure');
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);

  return parts.join('; ');
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return null;
}

export function sessionCookie(token: string, expiresAt: Date): string {
  return serializeCookie(SESSION_COOKIE, token, { httpOnly: true, expires: expiresAt });
}

export function csrfCookie(token: string, expiresAt: Date): string {
  // Намеренно без HttpOnly: клиент обязан прочитать значение и вернуть его
  // заголовком. Токен не является секретом сам по себе — он подтверждает,
  // что запрос отправлен со страницы нашего происхождения.
  return serializeCookie(CSRF_COOKIE, token, { httpOnly: false, expires: expiresAt });
}

export function clearedCookies(): string[] {
  const past = new Date(0);
  return [
    serializeCookie(SESSION_COOKIE, '', { httpOnly: true, expires: past, maxAge: 0 }),
    serializeCookie(CSRF_COOKIE, '', { httpOnly: false, expires: past, maxAge: 0 }),
  ];
}
