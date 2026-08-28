// Сгенерировано scripts/generate-routes.mjs — правки вносить там.
//
// Route handler'ы тонкие по договорённости: разобрать вход, вызвать сервис,
// вернуть результат. Разбор сессии, проверка CSRF, конверт ответа и перевод
// доменных ошибок в коды состояния живут в @/server/http/handler.

import { handle } from '@/server/http/handler';
import { users } from '@/server';

export const PUT = handle<{ id: string }>(async (ctx) => {
  const { role } = await ctx.body<{ role: unknown }>();
  return users.setUserRole(ctx.actor, ctx.params.id, role);
});
