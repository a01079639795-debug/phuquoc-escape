// Сгенерировано scripts/generate-routes.mjs — правки вносить там.
//
// Route handler'ы тонкие по договорённости: разобрать вход, вызвать сервис,
// вернуть результат. Разбор сессии, проверка CSRF, конверт ответа и перевод
// доменных ошибок в коды состояния живут в @/server/http/handler.

import { handle } from '@/server/http/handler';
import { catalog } from '@/server';
import type { AmenityScope } from '@prisma/client';

export const GET = handle(async (ctx) =>
  catalog.listAmenities(ctx.query.scope as AmenityScope | undefined, ctx.locale),
);
