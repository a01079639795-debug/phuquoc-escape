// Сгенерировано scripts/generate-routes.mjs — правки вносить там.
//
// Route handler'ы тонкие по договорённости: разобрать вход, вызвать сервис,
// вернуть результат. Разбор сессии, проверка CSRF, конверт ответа и перевод
// доменных ошибок в коды состояния живут в @/server/http/handler.

import { handle } from '@/server/http/handler';
import { issueSession } from '@/server/http/session';
import { auth } from '@/server';

export const POST = handle(async (ctx) => {
  const result = await auth.login(await ctx.body(), { ip: ctx.ip, userAgent: ctx.userAgent });
  return issueSession(ctx, result);
});
