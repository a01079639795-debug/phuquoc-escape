/**
 * Генератор route handler'ов.
 *
 * Обработчики намеренно однотипные и очень короткие: разобрать вход, вызвать
 * сервис, вернуть результат. Держать их в одной таблице проще, чем сверять
 * четыре десятка почти одинаковых файлов глазами — и это же гарантирует, что
 * ни в один из них не просочится бизнес-логика.
 *
 * Запуск:  node scripts/generate-routes.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API = join(ROOT, 'src/app/api/v1');

/** @type {Record<string, { imports: string[], body: string }>} */
const routes = {
  // ── служебное ─────────────────────────────────────────────────────────────
  'health': {
    imports: [`import { handle } from '@/server/http/handler';`],
    body: `export const GET = handle(async () => ({ status: 'ok', time: new Date().toISOString() }));`,
  },

  // ── аутентификация ────────────────────────────────────────────────────────
  'auth/register': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { issueSession } from '@/server/http/session';`,
      `import { auth } from '@/server';`,
    ],
    body: `export const POST = handle(async (ctx) => {
  const result = await auth.register(await ctx.body(), { ip: ctx.ip, userAgent: ctx.userAgent });
  ctx.setStatus(201);
  return issueSession(ctx, result);
});`,
  },
  'auth/login': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { issueSession } from '@/server/http/session';`,
      `import { auth } from '@/server';`,
    ],
    body: `export const POST = handle(async (ctx) => {
  const result = await auth.login(await ctx.body(), { ip: ctx.ip, userAgent: ctx.userAgent });
  return issueSession(ctx, result);
});`,
  },
  'auth/logout': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { endSession } from '@/server/http/session';`,
      `import { SESSION_COOKIE, readCookie } from '@/server/http/cookies';`,
      `import { auth } from '@/server';`,
    ],
    body: `export const POST = handle(async (ctx) => {
  const token = readCookie(ctx.req.headers.get('cookie'), SESSION_COOKIE);
  if (token) await auth.logout(token);
  endSession(ctx);
  return { loggedOut: true };
});`,
  },
  'auth/me': {
    imports: [`import { handle } from '@/server/http/handler';`],
    body: `export const GET = handle(async (ctx) => ({ user: ctx.user }));`,
  },
  'auth/password/forgot': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { auth } from '@/server';`,
    ],
    body: `export const POST = handle(async (ctx) => {
  const { email } = await ctx.body<{ email?: string }>();
  // Токен получает слой уведомлений, наружу он не отдаётся: ответ одинаков
  // независимо от того, существует такой адрес или нет.
  await auth.requestPasswordReset(email, { ip: ctx.ip, userAgent: ctx.userAgent });
  return { sent: true };
});`,
  },
  'auth/password/reset': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { auth } from '@/server';`,
    ],
    body: `export const POST = handle(async (ctx) => {
  await auth.resetPassword(await ctx.body());
  return { reset: true };
});`,
  },

  // ── публичный каталог ─────────────────────────────────────────────────────
  'listings': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { catalog } from '@/server';`,
    ],
    body: `export const GET = handle(async (ctx) => catalog.searchListings(ctx.query, ctx.locale));`,
  },
  'listings/[slug]': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { catalog } from '@/server';`,
    ],
    body: `export const GET = handle<{ slug: string }>(async (ctx) =>
  catalog.getListingBySlug(ctx.params.slug, ctx.locale),
);`,
  },
  'areas': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { catalog } from '@/server';`,
    ],
    body: `export const GET = handle(async (ctx) => catalog.listAreas(ctx.locale));`,
  },
  'amenities': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { catalog } from '@/server';`,
      `import type { AmenityScope } from '@prisma/client';`,
    ],
    body: `export const GET = handle(async (ctx) =>
  catalog.listAmenities(ctx.query.scope as AmenityScope | undefined, ctx.locale),
);`,
  },

  // ── заявки ────────────────────────────────────────────────────────────────
  'requests': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { requests } from '@/server';`,
    ],
    body: `export const POST = handle(async (ctx) => {
  const result = await requests.createRequest(await ctx.body(), ctx.actor, {
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    idempotencyKey: ctx.idempotencyKey,
  });
  ctx.setStatus(201);
  return result;
});`,
  },

  // ── личный кабинет ────────────────────────────────────────────────────────
  'me': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { users } from '@/server';`,
    ],
    body: `export const GET = handle(async (ctx) => users.getProfile(ctx.actor));

export const PATCH = handle(async (ctx) => users.updateProfile(ctx.actor, await ctx.body()));`,
  },
  'me/password': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { SESSION_COOKIE, readCookie } from '@/server/http/cookies';`,
      `import { auth } from '@/server';`,
    ],
    body: `export const POST = handle(async (ctx) => {
  const token = readCookie(ctx.req.headers.get('cookie'), SESSION_COOKIE);
  await auth.changePassword(ctx.actor, await ctx.body(), token ?? undefined);
  return { changed: true };
});`,
  },
  'me/requests': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { requests } from '@/server';`,
    ],
    body: `export const GET = handle(async (ctx) => requests.listMyRequests(ctx.actor, ctx.query, ctx.locale));`,
  },
  'me/requests/[id]': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { requests } from '@/server';`,
    ],
    body: `export const GET = handle<{ id: string }>(async (ctx) =>
  requests.getMyRequest(ctx.actor, ctx.params.id, ctx.locale),
);`,
  },
  'me/favorites': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { favorites } from '@/server';`,
    ],
    body: `export const GET = handle(async (ctx) => favorites.listFavorites(ctx.actor, ctx.query, ctx.locale));`,
  },
  'me/favorites/[listingId]': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { favorites } from '@/server';`,
    ],
    body: `export const PUT = handle<{ listingId: string }>(async (ctx) => {
  await favorites.addFavorite(ctx.actor, ctx.params.listingId);
  return { favorite: true };
});

export const DELETE = handle<{ listingId: string }>(async (ctx) => {
  await favorites.removeFavorite(ctx.actor, ctx.params.listingId);
  return { favorite: false };
});`,
  },

  // ── админка: сводки ───────────────────────────────────────────────────────
  'admin/stats': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { admin } from '@/server';`,
    ],
    body: `export const GET = handle(async (ctx) => admin.getDashboardStats(ctx.actor));`,
  },
  'admin/audit': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { admin } from '@/server';`,
    ],
    body: `export const GET = handle(async (ctx) => admin.listAuditLog(ctx.actor, ctx.query));`,
  },

  // ── админка: объекты ──────────────────────────────────────────────────────
  'admin/listings': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { listings } from '@/server';`,
    ],
    body: `export const GET = handle(async (ctx) => listings.adminListListings(ctx.actor, ctx.query, ctx.locale));

export const POST = handle(async (ctx) => {
  const created = await listings.createListing(ctx.actor, await ctx.body(), ctx.locale);
  ctx.setStatus(201);
  return created;
});`,
  },
  'admin/listings/[id]': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { listings } from '@/server';`,
    ],
    body: `export const GET = handle<{ id: string }>(async (ctx) =>
  listings.adminGetListing(ctx.actor, ctx.params.id, ctx.locale),
);

export const PATCH = handle<{ id: string }>(async (ctx) =>
  listings.updateListing(ctx.actor, ctx.params.id, await ctx.body(), ctx.locale),
);`,
  },
  'admin/listings/[id]/publish': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { listings } from '@/server';`,
    ],
    body: `export const POST = handle<{ id: string }>(async (ctx) => {
  await listings.publishListing(ctx.actor, ctx.params.id);
  return { status: 'PUBLISHED' };
});`,
  },
  'admin/listings/[id]/archive': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { listings } from '@/server';`,
    ],
    body: `export const POST = handle<{ id: string }>(async (ctx) => {
  await listings.archiveListing(ctx.actor, ctx.params.id);
  return { status: 'ARCHIVED' };
});`,
  },
  'admin/listings/[id]/units': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { listings } from '@/server';`,
    ],
    body: `export const POST = handle<{ id: string }>(async (ctx) => {
  const unitId = await listings.addUnit(ctx.actor, ctx.params.id, await ctx.body(), ctx.locale);
  ctx.setStatus(201);
  return { id: unitId };
});`,
  },
  'admin/units/[unitId]': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { listings } from '@/server';`,
    ],
    body: `export const PATCH = handle<{ unitId: string }>(async (ctx) => {
  await listings.updateUnit(ctx.actor, ctx.params.unitId, await ctx.body(), ctx.locale);
  return { updated: true };
});

export const DELETE = handle<{ unitId: string }>(async (ctx) => {
  await listings.removeUnit(ctx.actor, ctx.params.unitId);
  return { deleted: true };
});`,
  },
  'admin/listings/[id]/images': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { listings } from '@/server';`,
    ],
    body: `export const POST = handle<{ id: string }>(async (ctx) => {
  const { mediaId, alt } = await ctx.body<{ mediaId: string; alt?: string | null }>();
  const imageId = await listings.attachImage(ctx.actor, ctx.params.id, mediaId, alt);
  ctx.setStatus(201);
  return { id: imageId };
});

export const PUT = handle<{ id: string }>(async (ctx) => {
  const { order } = await ctx.body<{ order: string[] }>();
  await listings.reorderImages(ctx.actor, ctx.params.id, order);
  return { reordered: true };
});`,
  },
  'admin/listings/[id]/images/[imageId]': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { listings } from '@/server';`,
    ],
    body: `export const PUT = handle<{ id: string; imageId: string }>(async (ctx) => {
  await listings.setCoverImage(ctx.actor, ctx.params.id, ctx.params.imageId);
  return { isCover: true };
});

export const DELETE = handle<{ id: string; imageId: string }>(async (ctx) => {
  await listings.detachImage(ctx.actor, ctx.params.id, ctx.params.imageId);
  return { detached: true };
});`,
  },

  // ── админка: заявки ───────────────────────────────────────────────────────
  'admin/requests': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { requests } from '@/server';`,
    ],
    body: `export const GET = handle(async (ctx) => requests.adminListRequests(ctx.actor, ctx.query, ctx.locale));`,
  },
  'admin/requests/[id]': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { requests } from '@/server';`,
    ],
    body: `export const PATCH = handle<{ id: string }>(async (ctx) => {
  const { status } = await ctx.body<{ status: unknown }>();
  await requests.updateRequestStatus(ctx.actor, ctx.params.id, status);
  return { status };
});`,
  },
  'admin/requests/[id]/assignee': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { requests } from '@/server';`,
    ],
    body: `export const PUT = handle<{ id: string }>(async (ctx) => {
  const { managerId } = await ctx.body<{ managerId: unknown }>();
  await requests.assignRequest(ctx.actor, ctx.params.id, managerId);
  return { assignedToId: managerId ?? null };
});`,
  },
  'admin/requests/[id]/notes': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { requests } from '@/server';`,
    ],
    body: `export const POST = handle<{ id: string }>(async (ctx) => {
  const { body } = await ctx.body<{ body: string }>();
  const id = await requests.addRequestNote(ctx.actor, ctx.params.id, body);
  ctx.setStatus(201);
  return { id };
});`,
  },

  // ── админка: пользователи ─────────────────────────────────────────────────
  'admin/users': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { users } from '@/server';`,
    ],
    body: `export const GET = handle(async (ctx) => users.adminListUsers(ctx.actor, ctx.query));`,
  },
  'admin/users/[id]/role': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { users } from '@/server';`,
    ],
    body: `export const PUT = handle<{ id: string }>(async (ctx) => {
  const { role } = await ctx.body<{ role: unknown }>();
  return users.setUserRole(ctx.actor, ctx.params.id, role);
});`,
  },
  'admin/users/[id]/status': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { users } from '@/server';`,
    ],
    body: `export const PUT = handle<{ id: string }>(async (ctx) => {
  const { status } = await ctx.body<{ status: unknown }>();
  return users.setUserStatus(ctx.actor, ctx.params.id, status);
});`,
  },
  'admin/staff': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { users } from '@/server';`,
    ],
    body: `export const GET = handle(async (ctx) => users.listStaff(ctx.actor));`,
  },

  // ── админка: справочники ──────────────────────────────────────────────────
  'admin/areas': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { dictionaries } from '@/server';`,
    ],
    body: `export const GET = handle(async (ctx) => dictionaries.adminListAreas(ctx.actor, ctx.locale));

export const POST = handle(async (ctx) => {
  const id = await dictionaries.createArea(ctx.actor, await ctx.body(), ctx.locale);
  ctx.setStatus(201);
  return { id };
});`,
  },
  'admin/areas/[id]': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { dictionaries } from '@/server';`,
    ],
    body: `export const PATCH = handle<{ id: string }>(async (ctx) => {
  await dictionaries.updateArea(ctx.actor, ctx.params.id, await ctx.body(), ctx.locale);
  return { updated: true };
});`,
  },
  'admin/amenities': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { dictionaries } from '@/server';`,
      `import type { AmenityScope } from '@prisma/client';`,
    ],
    body: `export const GET = handle(async (ctx) =>
  dictionaries.adminListAmenities(ctx.actor, ctx.query.scope as AmenityScope | undefined, ctx.locale),
);

export const POST = handle(async (ctx) => {
  const id = await dictionaries.createAmenity(ctx.actor, await ctx.body(), ctx.locale);
  ctx.setStatus(201);
  return { id };
});`,
  },
  'admin/amenities/[id]': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { dictionaries } from '@/server';`,
    ],
    body: `export const PATCH = handle<{ id: string }>(async (ctx) => {
  await dictionaries.updateAmenity(ctx.actor, ctx.params.id, await ctx.body(), ctx.locale);
  return { updated: true };
});`,
  },

  // ── админка: медиатека ────────────────────────────────────────────────────
  'admin/media/upload-url': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { media } from '@/server';`,
    ],
    body: `export const POST = handle(async (ctx) => media.createUpload(ctx.actor, await ctx.body()));`,
  },
  'admin/media/confirm': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { media } from '@/server';`,
    ],
    body: `export const POST = handle(async (ctx) => {
  const asset = await media.confirmUpload(ctx.actor, await ctx.body());
  ctx.setStatus(201);
  return asset;
});`,
  },
  'admin/media': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { media } from '@/server';`,
    ],
    body: `export const GET = handle(async (ctx) => media.listAssets(ctx.actor, ctx.query));`,
  },
  'admin/media/[id]': {
    imports: [
      `import { handle } from '@/server/http/handler';`,
      `import { media } from '@/server';`,
    ],
    body: `export const DELETE = handle<{ id: string }>(async (ctx) => {
  await media.deleteAsset(ctx.actor, ctx.params.id);
  return { deleted: true };
});`,
  },
};

const HEADER = `// Сгенерировано scripts/generate-routes.mjs — правки вносить там.
//
// Route handler'ы тонкие по договорённости: разобрать вход, вызвать сервис,
// вернуть результат. Разбор сессии, проверка CSRF, конверт ответа и перевод
// доменных ошибок в коды состояния живут в @/server/http/handler.
`;

let count = 0;
for (const [route, { imports, body }] of Object.entries(routes)) {
  const dir = join(API, route);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'route.ts'), `${HEADER}\n${imports.join('\n')}\n\n${body}\n`, 'utf8');
  count += 1;
}

console.log(`Создано route handler'ов: ${count}`);
