// Сгенерировано scripts/generate-routes.mjs — правки вносить там.
//
// Route handler'ы тонкие по договорённости: разобрать вход, вызвать сервис,
// вернуть результат. Разбор сессии, проверка CSRF, конверт ответа и перевод
// доменных ошибок в коды состояния живут в @/server/http/handler.

import { handle } from '@/server/http/handler';
import { listings } from '@/server';

export const PATCH = handle<{ unitId: string }>(async (ctx) => {
  await listings.updateUnit(ctx.actor, ctx.params.unitId, await ctx.body(), ctx.locale);
  return { updated: true };
});

export const DELETE = handle<{ unitId: string }>(async (ctx) => {
  await listings.removeUnit(ctx.actor, ctx.params.unitId);
  return { deleted: true };
});
