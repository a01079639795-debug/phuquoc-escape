/**
 * Сводки админки: дашборд и журнал действий.
 */

import { ListingStatus, ListingType, Prisma, RequestStatus, UserRole } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../db';
import type { Actor } from '../authz';
import { assertAdmin, assertStaff } from '../authz';
import { parseInput } from '../lib/validate';
import { paginate, parsePaging, type Paginated } from '../pagination';

export type DashboardStats = {
  requests: { total: number; new: number; inProgress: number; last7Days: number };
  listings: { published: number; draft: number; archived: number; hotels: number; bikes: number };
  users: { total: number; last7Days: number };
};

export async function getDashboardStats(actor: Actor | null): Promise<DashboardStats> {
  assertStaff(actor);

  const weekAgo = new Date(Date.now() - 7 * 86_400_000);

  const [
    requestsTotal, requestsNew, requestsInProgress, requestsWeek,
    published, draft, archived, hotels, bikes,
    usersTotal, usersWeek,
  ] = await Promise.all([
    prisma.request.count(),
    prisma.request.count({ where: { status: RequestStatus.NEW } }),
    prisma.request.count({ where: { status: RequestStatus.IN_PROGRESS } }),
    prisma.request.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.listing.count({ where: { status: ListingStatus.PUBLISHED } }),
    prisma.listing.count({ where: { status: ListingStatus.DRAFT } }),
    prisma.listing.count({ where: { status: ListingStatus.ARCHIVED } }),
    prisma.listing.count({ where: { type: ListingType.HOTEL, status: ListingStatus.PUBLISHED } }),
    prisma.listing.count({ where: { type: ListingType.BIKE, status: ListingStatus.PUBLISHED } }),
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
  ]);

  return {
    requests: { total: requestsTotal, new: requestsNew, inProgress: requestsInProgress, last7Days: requestsWeek },
    listings: { published, draft, archived, hotels, bikes },
    users: { total: usersTotal, last7Days: usersWeek },
  };
}

export const auditQuerySchema = z.object({
  entity: z.string().trim().max(60).optional(),
  entityId: z.string().trim().max(80).optional(),
  actorId: z.string().uuid().optional(),
  action: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().optional(),
});

export type AuditRow = {
  id: string;
  entity: string;
  entityId: string;
  action: string;
  actorName: string | null;
  actorRole: UserRole | null;
  before: unknown;
  after: unknown;
  createdAt: Date;
};

/** Журнал читает только администратор: он содержит следы действий сотрудников. */
export async function listAuditLog(actor: Actor | null, input: unknown = {}): Promise<Paginated<AuditRow>> {
  assertAdmin(actor);
  const filters = parseInput(auditQuerySchema, input);
  const { page, perPage, skip, take } = parsePaging(filters);

  const where: Prisma.AuditLogWhereInput = {
    ...(filters.entity ? { entity: filters.entity } : {}),
    ...(filters.entityId ? { entityId: filters.entityId } : {}),
    ...(filters.actorId ? { actorId: filters.actorId } : {}),
    ...(filters.action ? { action: filters.action } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { actor: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.auditLog.count({ where }),
  ]);

  const data: AuditRow[] = rows.map((row) => ({
    id: row.id,
    entity: row.entity,
    entityId: row.entityId,
    action: row.action,
    actorName: row.actor?.name ?? null,
    actorRole: row.actorRole,
    before: row.before,
    after: row.after,
    createdAt: row.createdAt,
  }));

  return paginate(data, total, page, perPage);
}
