// Сгенерировано scripts/generate-routes.mjs — правки вносить там.
//
// Route handler'ы тонкие по договорённости: разобрать вход, вызвать сервис,
// вернуть результат. Разбор сессии, проверка CSRF, конверт ответа и перевод
// доменных ошибок в коды состояния живут в @/server/http/handler.

import { handle } from '@/server/http/handler';
import { listings } from '@/server';

export const GET = handle(async (ctx) => listings.adminListListings(ctx.actor, ctx.query, ctx.locale));

export const POST = handle(async (ctx) => {
  const created = await listings.createListing(ctx.actor, await ctx.body(), ctx.locale);
  ctx.setStatus(201);
  return created;
});
