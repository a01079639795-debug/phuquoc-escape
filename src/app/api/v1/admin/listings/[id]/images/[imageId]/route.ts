// Сгенерировано scripts/generate-routes.mjs — правки вносить там.
//
// Route handler'ы тонкие по договорённости: разобрать вход, вызвать сервис,
// вернуть результат. Разбор сессии, проверка CSRF, конверт ответа и перевод
// доменных ошибок в коды состояния живут в @/server/http/handler.

import { handle } from '@/server/http/handler';
import { listings } from '@/server';

export const PUT = handle<{ id: string; imageId: string }>(async (ctx) => {
  await listings.setCoverImage(ctx.actor, ctx.params.id, ctx.params.imageId);
  return { isCover: true };
});

export const DELETE = handle<{ id: string; imageId: string }>(async (ctx) => {
  await listings.detachImage(ctx.actor, ctx.params.id, ctx.params.imageId);
  return { detached: true };
});
