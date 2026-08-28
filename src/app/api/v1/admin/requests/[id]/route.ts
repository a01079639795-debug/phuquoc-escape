// Сгенерировано scripts/generate-routes.mjs — правки вносить там.
//
// Route handler'ы тонкие по договорённости: разобрать вход, вызвать сервис,
// вернуть результат. Разбор сессии, проверка CSRF, конверт ответа и перевод
// доменных ошибок в коды состояния живут в @/server/http/handler.

import { handle } from '@/server/http/handler';
import { requests } from '@/server';

export const PATCH = handle<{ id: string }>(async (ctx) => {
  const { status } = await ctx.body<{ status: unknown }>();
  await requests.updateRequestStatus(ctx.actor, ctx.params.id, status);
  return { status };
});
