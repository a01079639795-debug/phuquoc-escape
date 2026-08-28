// Сгенерировано scripts/generate-routes.mjs — правки вносить там.
//
// Route handler'ы тонкие по договорённости: разобрать вход, вызвать сервис,
// вернуть результат. Разбор сессии, проверка CSRF, конверт ответа и перевод
// доменных ошибок в коды состояния живут в @/server/http/handler.

import { handle } from '@/server/http/handler';
import { dictionaries } from '@/server';
import type { AmenityScope } from '@prisma/client';

export const GET = handle(async (ctx) =>
  dictionaries.adminListAmenities(ctx.actor, ctx.query.scope as AmenityScope | undefined, ctx.locale),
);

export const POST = handle(async (ctx) => {
  const id = await dictionaries.createAmenity(ctx.actor, await ctx.body(), ctx.locale);
  ctx.setStatus(201);
  return { id };
});
