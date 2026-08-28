// Сгенерировано scripts/generate-routes.mjs — правки вносить там.
//
// Route handler'ы тонкие по договорённости: разобрать вход, вызвать сервис,
// вернуть результат. Разбор сессии, проверка CSRF, конверт ответа и перевод
// доменных ошибок в коды состояния живут в @/server/http/handler.

import { handle } from '@/server/http/handler';
import { requests } from '@/server';

export const POST = handle<{ id: string }>(async (ctx) => {
  const { body } = await ctx.body<{ body: string }>();
  const id = await requests.addRequestNote(ctx.actor, ctx.params.id, body);
  ctx.setStatus(201);
  return { id };
});
