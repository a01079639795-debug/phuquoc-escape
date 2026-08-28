/**
 * Справочники админки: районы и удобства.
 *
 * Удаление не предусмотрено намеренно. Район связан с объектами через
 * RESTRICT, а удобство — часть истории объекта; вместо удаления запись
 * скрывается флагом isActive.
 */

import { AmenityScope, Prisma } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../db';
import type { Actor } from '../authz';
import { assertStaff } from '../authz';
import { ConflictError, NotFoundError } from '../errors';
import { parseInput } from '../lib/validate';
import { DEFAULT_LOCALE, pickTranslation, resolveLocale } from '../lib/locale';
import { slugify } from '../lib/text';
import { writeAudit } from '../lib/audit';

export const areaInputSchema = z.object({
  slug: z.string().trim().max(80).optional(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  sortOrder: z.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});

export const amenityInputSchema = z.object({
  code: z.string().trim().regex(/^[a-z0-9-]+$/, 'Код — только латиница, цифры и дефис').max(60),
  name: z.string().trim().min(2).max(120),
  scope: z.nativeEnum(AmenityScope).default(AmenityScope.ANY),
  group: z.string().trim().max(60).optional().nullable(),
  icon: z.string().trim().max(60).optional().nullable(),
  sortOrder: z.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});

// ── районы ──────────────────────────────────────────────────────────────────

export async function createArea(actor: Actor | null, input: unknown, locale?: unknown): Promise<string> {
  assertStaff(actor);
  const data = parseInput(areaInputSchema, input);
  const contentLocale = resolveLocale(locale ?? DEFAULT_LOCALE);
  const slug = slugify(data.slug || data.name);

  const existing = await prisma.area.findUnique({ where: { slug }, select: { id: true } });
  if (existing) throw new ConflictError('AREA_SLUG_TAKEN', `Район с адресом «${slug}» уже существует`);

  const area = await prisma.area.create({
    data: {
      slug,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
      sortOrder: data.sortOrder,
      isActive: data.isActive,
      translations: { create: [{ locale: contentLocale, name: data.name, description: data.description ?? null }] },
    },
  });

  await writeAudit(prisma, {
    actorId: actor.id, actorRole: actor.role,
    entity: 'Area', entityId: area.id, action: 'create', after: { slug, name: data.name },
  });

  return area.id;
}

export async function updateArea(actor: Actor | null, areaId: string, input: unknown, locale?: unknown): Promise<void> {
  assertStaff(actor);
  const data = parseInput(areaInputSchema.partial(), input);
  const contentLocale = resolveLocale(locale ?? DEFAULT_LOCALE);

  const area = await prisma.area.findUnique({ where: { id: areaId }, select: { id: true } });
  if (!area) throw new NotFoundError('area', areaId);

  await prisma.$transaction(async (tx) => {
    await tx.area.update({
      where: { id: areaId },
      data: {
        ...(data.lat !== undefined ? { lat: data.lat } : {}),
        ...(data.lng !== undefined ? { lng: data.lng } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });

    if (data.name !== undefined || data.description !== undefined) {
      await tx.areaTranslation.upsert({
        where: { areaId_locale: { areaId, locale: contentLocale } },
        create: { areaId, locale: contentLocale, name: data.name ?? '', description: data.description ?? null },
        update: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
        },
      });
    }

    await writeAudit(tx, {
      actorId: actor.id, actorRole: actor.role,
      entity: 'Area', entityId: areaId, action: 'update',
    });
  });
}

// ── удобства ────────────────────────────────────────────────────────────────

export async function createAmenity(actor: Actor | null, input: unknown, locale?: unknown): Promise<string> {
  assertStaff(actor);
  const data = parseInput(amenityInputSchema, input);
  const contentLocale = resolveLocale(locale ?? DEFAULT_LOCALE);

  const existing = await prisma.amenity.findUnique({ where: { code: data.code }, select: { id: true } });
  if (existing) throw new ConflictError('AMENITY_CODE_TAKEN', `Удобство с кодом «${data.code}» уже существует`);

  const amenity = await prisma.amenity.create({
    data: {
      code: data.code,
      scope: data.scope,
      group: data.group ?? null,
      icon: data.icon ?? null,
      sortOrder: data.sortOrder,
      isActive: data.isActive,
      translations: { create: [{ locale: contentLocale, name: data.name }] },
    },
  });

  await writeAudit(prisma, {
    actorId: actor.id, actorRole: actor.role,
    entity: 'Amenity', entityId: amenity.id, action: 'create', after: { code: data.code, name: data.name },
  });

  return amenity.id;
}

export async function updateAmenity(actor: Actor | null, amenityId: string, input: unknown, locale?: unknown): Promise<void> {
  assertStaff(actor);
  const data = parseInput(amenityInputSchema.partial().omit({ code: true }), input);
  const contentLocale = resolveLocale(locale ?? DEFAULT_LOCALE);

  const amenity = await prisma.amenity.findUnique({ where: { id: amenityId }, select: { id: true } });
  if (!amenity) throw new NotFoundError('amenity', amenityId);

  await prisma.$transaction(async (tx) => {
    await tx.amenity.update({
      where: { id: amenityId },
      data: {
        ...(data.scope !== undefined ? { scope: data.scope } : {}),
        ...(data.group !== undefined ? { group: data.group } : {}),
        ...(data.icon !== undefined ? { icon: data.icon } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });

    if (data.name !== undefined) {
      await tx.amenityTranslation.upsert({
        where: { amenityId_locale: { amenityId, locale: contentLocale } },
        create: { amenityId, locale: contentLocale, name: data.name },
        update: { name: data.name },
      });
    }

    await writeAudit(tx, {
      actorId: actor.id, actorRole: actor.role,
      entity: 'Amenity', entityId: amenityId, action: 'update',
    });
  });
}

/** Полный список для админки, включая скрытые записи. */
export async function adminListAreas(actor: Actor | null, locale?: unknown) {
  assertStaff(actor);
  const contentLocale = resolveLocale(locale ?? DEFAULT_LOCALE);
  const rows = await prisma.area.findMany({
    include: { translations: true, _count: { select: { listings: true } } },
    orderBy: { sortOrder: 'asc' },
  });
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: pickTranslation(row.translations, contentLocale)?.name ?? row.slug,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    listingCount: row._count.listings,
  }));
}

export async function adminListAmenities(actor: Actor | null, scope?: AmenityScope, locale?: unknown) {
  assertStaff(actor);
  const contentLocale = resolveLocale(locale ?? DEFAULT_LOCALE);
  const where: Prisma.AmenityWhereInput = scope ? { scope } : {};
  const rows = await prisma.amenity.findMany({
    where,
    include: { translations: true, _count: { select: { listings: true } } },
    orderBy: { sortOrder: 'asc' },
  });
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: pickTranslation(row.translations, contentLocale)?.name ?? row.code,
    scope: row.scope,
    group: row.group,
    isActive: row.isActive,
    listingCount: row._count.listings,
  }));
}
