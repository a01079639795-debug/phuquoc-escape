/**
 * Точка входа service layer.
 *
 * Транспорт (Next.js route handlers или server actions, а позже — контроллеры
 * NestJS) импортирует только отсюда. Ни один вызывающий код не обращается к
 * Prisma напрямую: это и есть та граница, которая позволит вынести слой в
 * отдельный сервис без переписывания бизнес-логики.
 */

export * as auth from './modules/auth.service';
export * as users from './modules/users.service';
export * as catalog from './modules/catalog.service';
export * as listings from './modules/listings.service';
export * as requests from './modules/requests.service';
export * as favorites from './modules/favorites.service';
export * as media from './modules/media.service';
export * as dictionaries from './modules/dictionaries.service';
export * as admin from './modules/admin.service';

export type { Actor } from './authz';
export {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} from './errors';
export type { Paginated, PageMeta } from './pagination';
export { DEFAULT_LOCALE, SUPPORTED_LOCALES, resolveLocale } from './lib/locale';
export type { MoneyDto } from './lib/money';
export { flushNotifications, getNotifier, setNotifier } from './notifications';
export { getStorage, setStorage } from './storage';
