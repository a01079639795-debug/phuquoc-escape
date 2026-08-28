// Сгенерировано scripts/generate-routes.mjs — правки вносить там.
//
// Route handler'ы тонкие по договорённости: разобрать вход, вызвать сервис,
// вернуть результат. Разбор сессии, проверка CSRF, конверт ответа и перевод
// доменных ошибок в коды состояния живут в @/server/http/handler.

import { handle } from '@/server/http/handler';
import { listings } from '@/server';

export const POST = handle<{ id: string }>(async (ctx) => {
  const { mediaId, alt } = await ctx.body<{ mediaId: string; alt?: string | null }>();
  const imageId = await listings.attachImage(ctx.actor, ctx.params.id, mediaId, alt);
  ctx.setStatus(201);
  return { id: imageId };
});

export const PUT = handle<{ id: string }>(async (ctx) => {
  const { order } = await ctx.body<{ order: string[] }>();
  await listings.reorderImages(ctx.actor, ctx.params.id, order);
  return { reordered: true };
});
