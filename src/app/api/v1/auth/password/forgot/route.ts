// Сгенерировано scripts/generate-routes.mjs — правки вносить там.
//
// Route handler'ы тонкие по договорённости: разобрать вход, вызвать сервис,
// вернуть результат. Разбор сессии, проверка CSRF, конверт ответа и перевод
// доменных ошибок в коды состояния живут в @/server/http/handler.

import { handle } from '@/server/http/handler';
import { auth } from '@/server';

export const POST = handle(async (ctx) => {
  const { email } = await ctx.body<{ email?: string }>();
  // Токен получает слой уведомлений, наружу он не отдаётся: ответ одинаков
  // независимо от того, существует такой адрес или нет.
  await auth.requestPasswordReset(email, { ip: ctx.ip, userAgent: ctx.userAgent });
  return { sent: true };
});
