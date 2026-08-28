// Сгенерировано scripts/generate-routes.mjs — правки вносить там.
//
// Route handler'ы тонкие по договорённости: разобрать вход, вызвать сервис,
// вернуть результат. Разбор сессии, проверка CSRF, конверт ответа и перевод
// доменных ошибок в коды состояния живут в @/server/http/handler.

import { handle } from '@/server/http/handler';
import { favorites } from '@/server';

export const PUT = handle<{ listingId: string }>(async (ctx) => {
  await favorites.addFavorite(ctx.actor, ctx.params.listingId);
  return { favorite: true };
});

export const DELETE = handle<{ listingId: string }>(async (ctx) => {
  await favorites.removeFavorite(ctx.actor, ctx.params.listingId);
  return { favorite: false };
});
