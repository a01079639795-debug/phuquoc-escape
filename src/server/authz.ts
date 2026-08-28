/**
 * Авторизация.
 *
 * Правило из архитектуры: guard защищает маршрут, service защищает данные.
 * Проверки роли живут здесь, а проверка владения записью — всегда в самом
 * запросе к базе (`where: { id, userId }`), а не сравнением после выборки.
 */

import { UserRole, UserStatus } from '@prisma/client';
import { ForbiddenError, UnauthorizedError } from './errors';

/** Тот, от чьего имени выполняется операция. */
export type Actor = {
  id: string;
  role: UserRole;
  status: UserStatus;
};

/** Роли, имеющие доступ к админке. */
export const STAFF_ROLES: readonly UserRole[] = [UserRole.MANAGER, UserRole.ADMIN];

export function assertAuthenticated(actor: Actor | null | undefined): asserts actor is Actor {
  if (!actor) throw new UnauthorizedError();
  if (actor.status === UserStatus.BLOCKED) throw new ForbiddenError('Аккаунт заблокирован');
}

export function assertRole(actor: Actor | null | undefined, ...roles: UserRole[]): asserts actor is Actor {
  assertAuthenticated(actor);
  if (!roles.includes(actor.role)) throw new ForbiddenError();
}

/** Доступ к админке: менеджер или администратор. */
export function assertStaff(actor: Actor | null | undefined): asserts actor is Actor {
  assertRole(actor, UserRole.MANAGER, UserRole.ADMIN);
}

/** Действия, доступные только администратору: роли, блокировки. */
export function assertAdmin(actor: Actor | null | undefined): asserts actor is Actor {
  assertRole(actor, UserRole.ADMIN);
}
