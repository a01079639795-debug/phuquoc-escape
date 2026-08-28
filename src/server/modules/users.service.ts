/**
 * Профиль пользователя и управление учётными записями из админки.
 */

import { Prisma, UserRole, UserStatus } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../db';
import type { Actor } from '../authz';
import { assertAdmin, assertAuthenticated, assertStaff } from '../authz';
import { ConflictError, NotFoundError } from '../errors';
import { parseInput } from '../lib/validate';
import { resolveLocale } from '../lib/locale';
import { normalizePhone } from '../lib/text';
import { writeAudit } from '../lib/audit';
import { paginate, parsePaging, type Paginated } from '../pagination';
import { toUserDto, type UserDto } from './auth.service';

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, 'Укажите имя').max(120).optional(),
  phone: z.string().trim().max(40).optional().nullable(),
  locale: z.string().optional(),
});

export const adminListUsersSchema = z.object({
  role: z.nativeEnum(UserRole).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  query: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().optional(),
});

export async function getProfile(actor: Actor | null): Promise<UserDto> {
  assertAuthenticated(actor);
  const user = await prisma.user.findUnique({ where: { id: actor.id } });
  if (!user) throw new NotFoundError('user', actor.id);
  return toUserDto(user);
}

export async function updateProfile(actor: Actor | null, input: unknown): Promise<UserDto> {
  assertAuthenticated(actor);
  const data = parseInput(updateProfileSchema, input);

  const user = await prisma.user.update({
    where: { id: actor.id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.phone !== undefined
        ? { phone: data.phone, phoneNormalized: normalizePhone(data.phone) }
        : {}),
      ...(data.locale !== undefined ? { locale: resolveLocale(data.locale) } : {}),
    },
  });

  return toUserDto(user);
}

export async function adminListUsers(actor: Actor | null, input: unknown = {}): Promise<Paginated<UserDto>> {
  assertStaff(actor);
  const filters = parseInput(adminListUsersSchema, input);
  const { page, perPage, skip, take } = parsePaging(filters);

  const where: Prisma.UserWhereInput = {
    ...(filters.role ? { role: filters.role } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.query
      ? {
          OR: [
            { email: { contains: filters.query, mode: 'insensitive' } },
            { name: { contains: filters.query, mode: 'insensitive' } },
            { phoneNormalized: { contains: filters.query.replace(/\D/g, '') } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.user.count({ where }),
  ]);

  return paginate(rows.map(toUserDto), total, page, perPage);
}

/**
 * Смена роли. Два предохранителя: нельзя менять роль самому себе и нельзя
 * снять последнего администратора — иначе админка становится недоступна
 * никому и восстановить доступ можно только руками в базе.
 */
export async function setUserRole(actor: Actor | null, userId: string, rawRole: unknown): Promise<UserDto> {
  assertAdmin(actor);
  const role = parseInput(z.nativeEnum(UserRole), rawRole, 'Неизвестная роль');

  if (userId === actor.id) {
    throw new ConflictError('CANNOT_CHANGE_OWN_ROLE', 'Нельзя изменить собственную роль');
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new NotFoundError('user', userId);
  if (target.role === role) return toUserDto(target);

  if (target.role === UserRole.ADMIN) await assertNotLastAdmin(userId);

  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({ where: { id: userId }, data: { role } });
    await writeAudit(tx, {
      actorId: actor.id, actorRole: actor.role,
      entity: 'User', entityId: userId, action: 'role_change',
      before: { role: target.role }, after: { role },
    });
    return user;
  });

  return toUserDto(updated);
}

/** Блокировка. Активные сессии обрываются сразу же. */
export async function setUserStatus(actor: Actor | null, userId: string, rawStatus: unknown): Promise<UserDto> {
  assertAdmin(actor);
  const status = parseInput(z.nativeEnum(UserStatus), rawStatus, 'Неизвестный статус');

  if (userId === actor.id) {
    throw new ConflictError('CANNOT_BLOCK_SELF', 'Нельзя заблокировать собственный аккаунт');
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new NotFoundError('user', userId);
  if (target.status === status) return toUserDto(target);

  if (status === UserStatus.BLOCKED && target.role === UserRole.ADMIN) await assertNotLastAdmin(userId);

  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({ where: { id: userId }, data: { status } });

    if (status === UserStatus.BLOCKED) {
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await writeAudit(tx, {
      actorId: actor.id, actorRole: actor.role,
      entity: 'User', entityId: userId, action: 'status_change',
      before: { status: target.status }, after: { status },
    });
    return user;
  });

  return toUserDto(updated);
}

async function assertNotLastAdmin(excludedUserId: string): Promise<void> {
  const remaining = await prisma.user.count({
    where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE, id: { not: excludedUserId } },
  });
  if (remaining === 0) {
    throw new ConflictError('LAST_ADMIN', 'Это последний активный администратор — сначала назначьте другого');
  }
}

/** Список сотрудников для выпадающего списка «ответственный» в заявках. */
export async function listStaff(actor: Actor | null): Promise<{ id: string; name: string; role: UserRole }[]> {
  assertStaff(actor);
  return prisma.user.findMany({
    where: { role: { in: [UserRole.MANAGER, UserRole.ADMIN] }, status: UserStatus.ACTIVE },
    select: { id: true, name: true, role: true },
    orderBy: { name: 'asc' },
  });
}
