// Сгенерировано scripts/generate-routes.mjs — правки вносить там.
//
// Route handler'ы тонкие по договорённости: разобрать вход, вызвать сервис,
// вернуть результат. Разбор сессии, проверка CSRF, конверт ответа и перевод
// доменных ошибок в коды состояния живут в @/server/http/handler.

import { handle } from '@/server/http/handler';
import { SESSION_COOKIE, readCookie } from '@/server/http/cookies';
import { auth } from '@/server';

export const POST = handle(async (ctx) => {
  const token = readCookie(ctx.req.headers.get('cookie'), SESSION_COOKIE);
  await auth.changePassword(ctx.actor, await ctx.body(), token ?? undefined);
  return { changed: true };
});
