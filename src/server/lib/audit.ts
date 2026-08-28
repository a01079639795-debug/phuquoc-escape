/**
 * Журнал изменений.
 *
 * entity/entityId — строки, а не связи: журнал переживает удаление объекта
 * и не потребует миграции, когда появятся Booking, Payment, Deal.
 *
 * Пишется тем же клиентом, что и само изменение: если вызвать внутри
 * транзакции, запись в журнал откатится вместе с ней. Журнал, содержащий
 * событие, которого не было, хуже отсутствующего журнала.
 */

import { Prisma } from '@prisma/client';
import type { UserRole } from '@prisma/client';
import type { Db } from '../db';

export type AuditEntry = {
  actorId?: string | null;
  actorRole?: UserRole | null;
  entity: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
};

function asJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (value === undefined || value === null) return Prisma.DbNull;
  return value as Prisma.InputJsonValue;
}

export async function writeAudit(db: Db, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      actorRole: entry.actorRole ?? null,
      entity: entry.entity,
      entityId: entry.entityId,
      action: entry.action,
      before: asJson(entry.before),
      after: asJson(entry.after),
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
    },
  });
}
