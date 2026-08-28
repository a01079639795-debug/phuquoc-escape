// Сгенерировано scripts/generate-routes.mjs — правки вносить там.
//
// Route handler'ы тонкие по договорённости: разобрать вход, вызвать сервис,
// вернуть результат. Разбор сессии, проверка CSRF, конверт ответа и перевод
// доменных ошибок в коды состояния живут в @/server/http/handler.

import { handle } from '@/server/http/handler';
import { requests } from '@/server';

export const POST = handle(async (ctx) => {
  const result = await requests.createRequest(await ctx.body(), ctx.actor, {
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    idempotencyKey: ctx.idempotencyKey,
  });
  ctx.setStatus(201);
  return result;
});
