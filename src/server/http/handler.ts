/**
 * Обёртка route handler'ов.
 *
 * Здесь собрано всё, что должно происходить на каждом запросе: разбор cookie
 * сессии, проверка CSRF, разбор параметров, единый конверт ответа и перевод
 * доменных ошибок в коды состояния.
 *
 * Благодаря этому сами route handler'ы остаются в две-три строки и не
 * содержат бизнес-логики: они вызывают сервис и возвращают результат.
 */

import { ForbiddenError, ValidationError } from '../errors';
import { resolveLocale } from '../lib/locale';
import { getSession } from '../modules/auth.service';
import type { Actor } from '../authz';
import type { UserDto } from '../modules/auth.service';
import { CSRF_COOKIE, CSRF_HEADER, SESSION_COOKIE, readCookie } from './cookies';
import { fail, ok } from './respond';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export type RouteContext<P extends Record<string, string> = Record<string, string>> = {
  req: Request;
  params: P;
  /** null для гостя. Проверку прав делает сервис, а не обёртка. */
  actor: Actor | null;
  user: UserDto | null;
  query: Record<string, unknown>;
  locale: ReturnType<typeof resolveLocale>;
  ip: string | null;
  userAgent: string | null;
  idempotencyKey: string | null;
  /** Разбор тела. Бросает ValidationError при некорректном JSON. */
  body: <T = unknown>() => Promise<T>;
  /** Cookie, которые нужно установить в ответе. */
  setCookie: (cookie: string) => void;
  /** Код ответа, если он отличается от 200. */
  setStatus: (status: number) => void;
};

type Handler<P extends Record<string, string>> = (ctx: RouteContext<P>) => Promise<unknown>;

/**
 * Второй аргумент route handler''а в Next: параметры пути приходят промисом.
 * Тип обязателен — Next сверяет сигнатуру и не принимает undefined.
 */
type NextSegment<P> = { params: Promise<P> };

/**
 * Разбор строки запроса.
 *
 * Повторяющиеся ключи собираются в массив (?amenities=wifi&amenities=pool),
 * 'true'/'false' приводятся к булеву типу. Числа не трогаются: их приводят
 * схемы сервисов через z.coerce — так одно и то же поле одинаково работает
 * и в строке запроса, и в JSON-теле.
 */
export function parseQuery(url: string): Record<string, unknown> {
  const params = new URL(url).searchParams;
  const result: Record<string, unknown> = {};

  for (const key of new Set(params.keys())) {
    const values = params.getAll(key).filter((v) => v !== '');
    if (values.length === 0) continue;

    const converted = values.map((v) => (v === 'true' ? true : v === 'false' ? false : v));
    result[key] = converted.length > 1 ? converted : converted[0];
  }

  return result;
}

/** Клиентский адрес за обратным прокси. */
function clientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return req.headers.get('x-real-ip');
}

/**
 * Проверка CSRF по схеме double submit.
 *
 * Применяется только к изменяющим запросам от аутентифицированного
 * пользователя: CSRF эксплуатирует «попутные полномочия» — cookie, которую
 * браузер отправляет автоматически. Без сессии подделывать нечего, поэтому
 * гостевые POST (форма заявки, вход, регистрация) проверку не проходят —
 * у клиента ещё нет токена, который можно было бы вернуть.
 *
 * Основная линия защиты при этом SameSite=Lax на сессионной cookie;
 * double submit — второй рубеж.
 */
function assertCsrf(req: Request, hasSession: boolean): void {
  if (!hasSession) return;
  if (!MUTATING_METHODS.has(req.method)) return;

  const cookieToken = readCookie(req.headers.get('cookie'), CSRF_COOKIE);
  const headerToken = req.headers.get(CSRF_HEADER);

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    throw new ForbiddenError('Проверка CSRF не пройдена. Обновите страницу и повторите действие.');
  }
}

export function handle<P extends Record<string, string> = Record<string, string>>(
  fn: Handler<P>,
): (req: Request, segment: NextSegment<P>) => Promise<Response> {
  return async (req, segment) => {
    const cookies: string[] = [];
    let status = 200;

    try {
      // В тестах обработчик вызывается напрямую и сегмент может отсутствовать.
      const params = segment?.params ? await segment.params : ({} as P);
      const sessionToken = readCookie(req.headers.get('cookie'), SESSION_COOKIE);
      const session = await getSession(sessionToken);

      assertCsrf(req, session !== null);

      const ctx: RouteContext<P> = {
        req,
        params,
        actor: session?.actor ?? null,
        user: session?.user ?? null,
        query: parseQuery(req.url),
        locale: resolveLocale(
          req.headers.get('x-locale') ?? session?.user.locale ?? undefined,
        ),
        ip: clientIp(req),
        userAgent: req.headers.get('user-agent'),
        idempotencyKey: req.headers.get('idempotency-key'),
        body: async <T,>() => {
          try {
            return (await req.json()) as T;
          } catch {
            throw new ValidationError('Тело запроса не является корректным JSON');
          }
        },
        setCookie: (cookie) => cookies.push(cookie),
        setStatus: (value) => { status = value; },
      };

      const result = await fn(ctx);
      return ok(result, status, cookies);
    } catch (error) {
      return fail(error, cookies);
    }
  };
}
