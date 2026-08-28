/**
 * Управление объектами каталога — админская часть.
 *
 * Здесь живут два правила, которые нельзя доверить вызывающему коду:
 *  • priceFromAmount пересчитывается при любом изменении юнитов;
 *  • смена обложки выполняется под блокировкой родительской строки.
 * Оба зафиксированы проверками (npm run db:verify:race).
 */

import { Currency, ListingStatus, ListingType, PriceUnit, Prisma, Transmission } from '@prisma/client';
import type { Locale } from '@prisma/client';
import { z } from 'zod';

import { prisma, type Db } from '../db';
import type { Actor } from '../authz';
import { assertStaff } from '../authz';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { parseInput } from '../lib/validate';
import { DEFAULT_LOCALE, pickTranslation, resolveLocale } from '../lib/locale';
import { slugify, uniqueSlug } from '../lib/text';
import { writeAudit } from '../lib/audit';
import { paginate, parsePaging, type Paginated } from '../pagination';
import { toDetailDto, type ListingDetailDto } from './catalog.service';

// ── схемы ───────────────────────────────────────────────────────────────────

const contentSchema = z.object({
  title: z.string().trim().min(3).max(200),
  shortDescription: z.string().trim().max(400).optional().nullable(),
  description: z.string().trim().max(8000).optional().nullable(),
  metaTitle: z.string().trim().max(200).optional().nullable(),
  metaDescription: z.string().trim().max(400).optional().nullable(),
});

const hotelDetailsSchema = z.object({
  stars: z.number().int().min(1).max(5).optional().nullable(),
  checkInTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  checkOutTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  distanceToBeachM: z.number().int().nonnegative().optional().nullable(),
  distanceToCenterM: z.number().int().nonnegative().optional().nullable(),
  totalRooms: z.number().int().positive().optional().nullable(),
});

const bikeDetailsSchema = z.object({
  brand: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(60),
  engineCc: z.number().int().positive().max(2000).optional().nullable(),
  transmission: z.nativeEnum(Transmission).default(Transmission.AUTOMATIC),
  year: z.number().int().min(1990).max(2100).optional().nullable(),
  depositAmount: z.number().int().nonnegative().optional().nullable(),
  depositCurrency: z.nativeEnum(Currency).optional().nullable(),
  helmetsIncluded: z.number().int().min(0).max(4).default(2),
  deliveryIncluded: z.boolean().default(false),
  deliveryFeeAmount: z.number().int().nonnegative().optional().nullable(),
});

export const unitInputSchema = z.object({
  code: z.string().trim().max(60).optional().nullable(),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional().nullable(),
  capacity: z.number().int().min(1).max(30).optional().nullable(),
  quantity: z.number().int().min(1).max(1000).default(1),
  /** Минорные единицы. Для VND — донги, для USD — центы. */
  priceAmount: z.number().int().positive(),
  currency: z.nativeEnum(Currency).default(Currency.VND),
  priceUnit: z.nativeEnum(PriceUnit),
  minDuration: z.number().int().min(1).max(365).default(1),
  sortOrder: z.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});

export const createListingSchema = z.object({
  type: z.nativeEnum(ListingType),
  slug: z.string().trim().max(80).optional(),
  areaId: z.string().uuid().optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  isFeatured: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  currency: z.nativeEnum(Currency).default(Currency.VND),
  content: contentSchema,
  hotel: hotelDetailsSchema.optional(),
  bike: bikeDetailsSchema.optional(),
  amenityCodes: z.array(z.string().trim().max(60)).max(60).default([]),
  units: z.array(unitInputSchema).max(30).default([]),
});

export const updateListingSchema = createListingSchema
  .omit({ type: true, hotel: true, bike: true, units: true, amenityCodes: true })
  .partial()
  .extend({
    content: contentSchema.partial().optional(),
    hotel: hotelDetailsSchema.partial().optional(),
    bike: bikeDetailsSchema.partial().optional(),
    amenityCodes: z.array(z.string().trim().max(60)).max(60).optional(),
  });

export const adminListSchema = z.object({
  type: z.nativeEnum(ListingType).optional(),
  status: z.nativeEnum(ListingStatus).optional(),
  areaId: z.string().uuid().optional(),
  query: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().optional(),
});

// ── внутреннее ──────────────────────────────────────────────────────────────

/**
 * Пересчёт цены «от». Денормализация существует ради сортировки и списков
 * без JOIN, поэтому её актуальность — обязанность этого модуля, а не
 * вызывающего кода.
 */
export async function recomputePriceFrom(db: Db, listingId: string): Promise<void> {
  const agg = await db.listingUnit.aggregate({
    where: { listingId, isActive: true },
    _min: { priceAmount: true },
  });
  await db.listing.update({
    where: { id: listingId },
    data: { priceFromAmount: agg._min.priceAmount ?? null },
  });
}

/**
 * Блокирует строку объекта до конца транзакции.
 *
 * Нужна везде, где несколько строк-детей должны измениться согласованно:
 * смена обложки — первый такой случай, защита от двойного бронирования на
 * этапе 2 будет вторым. Без блокировки параллельные запросы дают две обложки,
 * что воспроизведено тестом prisma/verify-cover-concurrency.mjs.
 */
async function lockListing(tx: Prisma.TransactionClient, listingId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Listing" WHERE id = ${listingId}::uuid FOR UPDATE`;
  if (rows.length === 0) throw new NotFoundError('listing', listingId);
}

async function amenityIdsByCodes(db: Db, codes: string[]): Promise<string[]> {
  if (codes.length === 0) return [];
  const rows = await db.amenity.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } });
  if (rows.length !== new Set(codes).size) {
    const found = new Set(rows.map((r) => r.code));
    const missing = codes.filter((c) => !found.has(c));
    throw new ValidationError('Неизвестные коды удобств', { missing });
  }
  return rows.map((r) => r.id);
}

function unitCreateData(unit: z.infer<typeof unitInputSchema>, locale: Locale) {
  return {
    code: unit.code ?? null,
    capacity: unit.capacity ?? null,
    quantity: unit.quantity,
    priceAmount: BigInt(unit.priceAmount),
    currency: unit.currency,
    priceUnit: unit.priceUnit,
    minDuration: unit.minDuration,
    sortOrder: unit.sortOrder,
    isActive: unit.isActive,
    translations: { create: [{ locale, name: unit.name, description: unit.description ?? null }] },
  };
}

// ── операции ────────────────────────────────────────────────────────────────

export async function createListing(actor: Actor | null, input: unknown, locale?: unknown): Promise<ListingDetailDto> {
  assertStaff(actor);
  const data = parseInput(createListingSchema, input);
  const contentLocale = resolveLocale(locale ?? DEFAULT_LOCALE);

  if (data.type === ListingType.BIKE && !data.bike) {
    throw new ValidationError('Для байка обязателен блок характеристик (марка и модель)');
  }

  const slug = await uniqueSlug(data.slug || slugify(data.content.title), async (candidate) => {
    const found = await prisma.listing.findUnique({ where: { slug: candidate }, select: { id: true } });
    return found !== null;
  });

  const amenityIds = await amenityIdsByCodes(prisma, data.amenityCodes);

  const listing = await prisma.$transaction(async (tx) => {
    const created = await tx.listing.create({
      data: {
        type: data.type,
        slug,
        status: ListingStatus.DRAFT,
        areaId: data.areaId ?? null,
        address: data.address ?? null,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        isFeatured: data.isFeatured,
        sortOrder: data.sortOrder,
        currency: data.currency,
        translations: {
          create: [{
            locale: contentLocale,
            title: data.content.title,
            shortDescription: data.content.shortDescription ?? null,
            description: data.content.description ?? null,
            metaTitle: data.content.metaTitle ?? null,
            metaDescription: data.content.metaDescription ?? null,
          }],
        },
        ...(data.type === ListingType.HOTEL
          ? { hotelDetails: { create: data.hotel ?? {} } }
          : { bikeDetails: { create: {
              brand: data.bike!.brand,
              model: data.bike!.model,
              engineCc: data.bike!.engineCc ?? null,
              transmission: data.bike!.transmission,
              year: data.bike!.year ?? null,
              depositAmount: data.bike!.depositAmount != null ? BigInt(data.bike!.depositAmount) : null,
              depositCurrency: data.bike!.depositCurrency ?? null,
              helmetsIncluded: data.bike!.helmetsIncluded,
              deliveryIncluded: data.bike!.deliveryIncluded,
              deliveryFeeAmount: data.bike!.deliveryFeeAmount != null ? BigInt(data.bike!.deliveryFeeAmount) : null,
            } } }),
        units: { create: data.units.map((u) => unitCreateData(u, contentLocale)) },
        amenities: { create: amenityIds.map((amenityId) => ({ amenityId })) },
      },
    });

    await recomputePriceFrom(tx, created.id);
    await writeAudit(tx, {
      actorId: actor.id, actorRole: actor.role,
      entity: 'Listing', entityId: created.id, action: 'create',
      after: { slug, type: data.type, title: data.content.title },
    });

    return created;
  });

  return adminGetListing(actor, listing.id, contentLocale);
}

export async function updateListing(
  actor: Actor | null,
  listingId: string,
  input: unknown,
  locale?: unknown,
): Promise<ListingDetailDto> {
  assertStaff(actor);
  const data = parseInput(updateListingSchema, input);
  const contentLocale = resolveLocale(locale ?? DEFAULT_LOCALE);

  const before = await prisma.listing.findUnique({ where: { id: listingId }, include: { translations: true } });
  if (!before) throw new NotFoundError('listing', listingId);

  const amenityIds = data.amenityCodes ? await amenityIdsByCodes(prisma, data.amenityCodes) : null;

  await prisma.$transaction(async (tx) => {
    await tx.listing.update({
      where: { id: listingId },
      data: {
        ...(data.areaId !== undefined ? { areaId: data.areaId } : {}),
        ...(data.address !== undefined ? { address: data.address } : {}),
        ...(data.lat !== undefined ? { lat: data.lat } : {}),
        ...(data.lng !== undefined ? { lng: data.lng } : {}),
        ...(data.isFeatured !== undefined ? { isFeatured: data.isFeatured } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        ...(data.currency !== undefined ? { currency: data.currency } : {}),
      },
    });

    if (data.content) {
      const c = data.content;
      await tx.listingTranslation.upsert({
        where: { listingId_locale: { listingId, locale: contentLocale } },
        create: {
          listingId,
          locale: contentLocale,
          title: c.title ?? before.slug,
          shortDescription: c.shortDescription ?? null,
          description: c.description ?? null,
          metaTitle: c.metaTitle ?? null,
          metaDescription: c.metaDescription ?? null,
        },
        update: {
          ...(c.title !== undefined ? { title: c.title } : {}),
          ...(c.shortDescription !== undefined ? { shortDescription: c.shortDescription } : {}),
          ...(c.description !== undefined ? { description: c.description } : {}),
          ...(c.metaTitle !== undefined ? { metaTitle: c.metaTitle } : {}),
          ...(c.metaDescription !== undefined ? { metaDescription: c.metaDescription } : {}),
        },
      });
    }

    if (data.hotel && before.type === ListingType.HOTEL) {
      await tx.hotelDetails.update({ where: { listingId }, data: data.hotel });
    }

    if (data.bike && before.type === ListingType.BIKE) {
      const b = data.bike;
      await tx.bikeDetails.update({
        where: { listingId },
        data: {
          ...(b.brand !== undefined ? { brand: b.brand } : {}),
          ...(b.model !== undefined ? { model: b.model } : {}),
          ...(b.engineCc !== undefined ? { engineCc: b.engineCc } : {}),
          ...(b.transmission !== undefined ? { transmission: b.transmission } : {}),
          ...(b.year !== undefined ? { year: b.year } : {}),
          ...(b.depositAmount !== undefined
            ? { depositAmount: b.depositAmount === null ? null : BigInt(b.depositAmount) }
            : {}),
          ...(b.depositCurrency !== undefined ? { depositCurrency: b.depositCurrency } : {}),
          ...(b.helmetsIncluded !== undefined ? { helmetsIncluded: b.helmetsIncluded } : {}),
          ...(b.deliveryIncluded !== undefined ? { deliveryIncluded: b.deliveryIncluded } : {}),
          ...(b.deliveryFeeAmount !== undefined
            ? { deliveryFeeAmount: b.deliveryFeeAmount === null ? null : BigInt(b.deliveryFeeAmount) }
            : {}),
        },
      });
    }

    if (amenityIds) {
      await tx.listingAmenity.deleteMany({ where: { listingId } });
      if (amenityIds.length) {
        await tx.listingAmenity.createMany({ data: amenityIds.map((amenityId) => ({ listingId, amenityId })) });
      }
    }

    await writeAudit(tx, {
      actorId: actor.id, actorRole: actor.role,
      entity: 'Listing', entityId: listingId, action: 'update',
    });
  });

  return adminGetListing(actor, listingId, contentLocale);
}

/** Что должно быть готово, чтобы объект можно было показать публично. */
async function assertPublishable(listingId: string): Promise<void> {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: {
      translations: true,
      units: { where: { isActive: true }, select: { id: true } },
      images: { select: { id: true, isCover: true } },
      hotelDetails: { select: { listingId: true } },
      bikeDetails: { select: { listingId: true } },
    },
  });
  if (!listing) throw new NotFoundError('listing', listingId);

  const problems: string[] = [];
  if (!listing.translations.some((t) => t.locale === DEFAULT_LOCALE)) problems.push('нет описания на языке контента');
  if (listing.units.length === 0) problems.push('нет ни одного активного варианта размещения');
  if (listing.images.length === 0) problems.push('нет изображений');
  else if (!listing.images.some((i) => i.isCover)) problems.push('не выбрана обложка');
  if (!listing.areaId) problems.push('не указан район');
  if (listing.type === ListingType.HOTEL && !listing.hotelDetails) problems.push('нет характеристик отеля');
  if (listing.type === ListingType.BIKE && !listing.bikeDetails) problems.push('нет характеристик байка');

  if (problems.length) {
    throw new ConflictError('LISTING_NOT_PUBLISHABLE', `Объект нельзя опубликовать: ${problems.join(', ')}`, { problems });
  }
}

async function changeStatus(actor: Actor, listingId: string, status: ListingStatus): Promise<void> {
  const before = await prisma.listing.findUnique({ where: { id: listingId }, select: { status: true } });
  if (!before) throw new NotFoundError('listing', listingId);
  if (before.status === status) return;

  await prisma.$transaction(async (tx) => {
    await tx.listing.update({
      where: { id: listingId },
      data: {
        status,
        publishedAt: status === ListingStatus.PUBLISHED ? new Date() : undefined,
      },
    });
    await writeAudit(tx, {
      actorId: actor.id, actorRole: actor.role,
      entity: 'Listing', entityId: listingId, action: 'status_change',
      before: { status: before.status }, after: { status },
    });
  });
}

export async function publishListing(actor: Actor | null, listingId: string): Promise<void> {
  assertStaff(actor);
  await assertPublishable(listingId);
  await changeStatus(actor, listingId, ListingStatus.PUBLISHED);
}

export async function unpublishListing(actor: Actor | null, listingId: string): Promise<void> {
  assertStaff(actor);
  await changeStatus(actor, listingId, ListingStatus.DRAFT);
}

export async function archiveListing(actor: Actor | null, listingId: string): Promise<void> {
  assertStaff(actor);
  await changeStatus(actor, listingId, ListingStatus.ARCHIVED);
}

// ── юниты ───────────────────────────────────────────────────────────────────

export async function addUnit(actor: Actor | null, listingId: string, input: unknown, locale?: unknown): Promise<string> {
  assertStaff(actor);
  const unit = parseInput(unitInputSchema, input);
  const contentLocale = resolveLocale(locale ?? DEFAULT_LOCALE);

  const listing = await prisma.listing.findUnique({ where: { id: listingId }, select: { id: true } });
  if (!listing) throw new NotFoundError('listing', listingId);

  return prisma.$transaction(async (tx) => {
    const created = await tx.listingUnit.create({ data: { listingId, ...unitCreateData(unit, contentLocale) } });
    await recomputePriceFrom(tx, listingId);
    await writeAudit(tx, {
      actorId: actor.id, actorRole: actor.role,
      entity: 'ListingUnit', entityId: created.id, action: 'create', after: { listingId, name: unit.name },
    });
    return created.id;
  });
}

export async function updateUnit(actor: Actor | null, unitId: string, input: unknown, locale?: unknown): Promise<void> {
  assertStaff(actor);
  const patch = parseInput(unitInputSchema.partial(), input);
  const contentLocale = resolveLocale(locale ?? DEFAULT_LOCALE);

  const unit = await prisma.listingUnit.findUnique({ where: { id: unitId }, select: { id: true, listingId: true } });
  if (!unit) throw new NotFoundError('unit', unitId);

  await prisma.$transaction(async (tx) => {
    await tx.listingUnit.update({
      where: { id: unitId },
      data: {
        ...(patch.code !== undefined ? { code: patch.code } : {}),
        ...(patch.capacity !== undefined ? { capacity: patch.capacity } : {}),
        ...(patch.quantity !== undefined ? { quantity: patch.quantity } : {}),
        ...(patch.priceAmount !== undefined ? { priceAmount: BigInt(patch.priceAmount) } : {}),
        ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
        ...(patch.priceUnit !== undefined ? { priceUnit: patch.priceUnit } : {}),
        ...(patch.minDuration !== undefined ? { minDuration: patch.minDuration } : {}),
        ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
        ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      },
    });

    if (patch.name !== undefined || patch.description !== undefined) {
      await tx.listingUnitTranslation.upsert({
        where: { unitId_locale: { unitId, locale: contentLocale } },
        create: { unitId, locale: contentLocale, name: patch.name ?? 'Вариант размещения', description: patch.description ?? null },
        update: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
        },
      });
    }

    await recomputePriceFrom(tx, unit.listingId);
    await writeAudit(tx, {
      actorId: actor.id, actorRole: actor.role,
      entity: 'ListingUnit', entityId: unitId, action: 'update',
    });
  });
}

export async function removeUnit(actor: Actor | null, unitId: string): Promise<void> {
  assertStaff(actor);
  const unit = await prisma.listingUnit.findUnique({ where: { id: unitId }, select: { id: true, listingId: true } });
  if (!unit) throw new NotFoundError('unit', unitId);

  await prisma.$transaction(async (tx) => {
    await tx.listingUnit.delete({ where: { id: unitId } });
    await recomputePriceFrom(tx, unit.listingId);
    await writeAudit(tx, {
      actorId: actor.id, actorRole: actor.role,
      entity: 'ListingUnit', entityId: unitId, action: 'delete', before: { listingId: unit.listingId },
    });
  });
}

// ── изображения ─────────────────────────────────────────────────────────────

/**
 * Привязывает загруженный файл к объекту. Первое изображение автоматически
 * становится обложкой — иначе объект нельзя было бы опубликовать без
 * дополнительного действия.
 */
export async function attachImage(
  actor: Actor | null,
  listingId: string,
  mediaId: string,
  alt?: string | null,
): Promise<string> {
  assertStaff(actor);

  return prisma.$transaction(async (tx) => {
    await lockListing(tx, listingId);

    const media = await tx.mediaAsset.findUnique({ where: { id: mediaId }, select: { id: true } });
    if (!media) throw new NotFoundError('media', mediaId);

    const existing = await tx.listingImage.count({ where: { listingId } });
    const duplicate = await tx.listingImage.findUnique({
      where: { listingId_mediaId: { listingId, mediaId } },
      select: { id: true },
    });
    if (duplicate) throw new ConflictError('IMAGE_ALREADY_ATTACHED', 'Это изображение уже добавлено к объекту');

    const created = await tx.listingImage.create({
      data: { listingId, mediaId, alt: alt ?? null, sortOrder: existing, isCover: existing === 0 },
    });

    await writeAudit(tx, {
      actorId: actor.id, actorRole: actor.role,
      entity: 'ListingImage', entityId: created.id, action: 'attach', after: { listingId, mediaId },
    });

    return created.id;
  });
}

/**
 * Смена обложки.
 *
 * Транзакция ОБЯЗАНА начинаться с блокировки строки Listing. Без неё два
 * параллельных запроса оставляют две обложки: доказано сценарием 1 в
 * prisma/verify-cover-concurrency.mjs. Не убирать lockListing.
 */
export async function setCoverImage(actor: Actor | null, listingId: string, imageId: string): Promise<void> {
  assertStaff(actor);

  await prisma.$transaction(async (tx) => {
    await lockListing(tx, listingId);

    const image = await tx.listingImage.findFirst({
      where: { id: imageId, listingId },
      select: { id: true, isCover: true },
    });
    if (!image) throw new NotFoundError('image', imageId);
    if (image.isCover) return;

    await tx.listingImage.updateMany({ where: { listingId, isCover: true }, data: { isCover: false } });
    await tx.listingImage.update({ where: { id: imageId }, data: { isCover: true } });

    await writeAudit(tx, {
      actorId: actor.id, actorRole: actor.role,
      entity: 'ListingImage', entityId: imageId, action: 'set_cover', after: { listingId },
    });
  });
}

/**
 * Отвязывает изображение. Если снимается обложка, её роль переходит первому
 * оставшемуся снимку: объект не должен остаться опубликованным без обложки.
 */
export async function detachImage(actor: Actor | null, listingId: string, imageId: string): Promise<void> {
  assertStaff(actor);

  await prisma.$transaction(async (tx) => {
    await lockListing(tx, listingId);

    const image = await tx.listingImage.findFirst({ where: { id: imageId, listingId } });
    if (!image) throw new NotFoundError('image', imageId);

    await tx.listingImage.delete({ where: { id: imageId } });

    if (image.isCover) {
      const next = await tx.listingImage.findFirst({
        where: { listingId },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: { id: true },
      });
      if (next) await tx.listingImage.update({ where: { id: next.id }, data: { isCover: true } });
    }

    await writeAudit(tx, {
      actorId: actor.id, actorRole: actor.role,
      entity: 'ListingImage', entityId: imageId, action: 'detach', before: { listingId },
    });
  });
}

export async function reorderImages(actor: Actor | null, listingId: string, orderedIds: string[]): Promise<void> {
  assertStaff(actor);

  await prisma.$transaction(async (tx) => {
    await lockListing(tx, listingId);

    const existing = await tx.listingImage.findMany({ where: { listingId }, select: { id: true } });
    const known = new Set(existing.map((i) => i.id));
    if (orderedIds.length !== known.size || orderedIds.some((id) => !known.has(id))) {
      throw new ValidationError('Список изображений не совпадает с текущим набором объекта');
    }

    for (const [index, id] of orderedIds.entries()) {
      await tx.listingImage.update({ where: { id }, data: { sortOrder: index } });
    }
  });
}

// ── чтение для админки ──────────────────────────────────────────────────────

const adminDetailInclude = {
  translations: true,
  area: { include: { translations: true } },
  images: { include: { media: true }, orderBy: { sortOrder: 'asc' } },
  units: { include: { translations: true }, orderBy: { sortOrder: 'asc' } },
  amenities: { include: { amenity: { include: { translations: true } } } },
  hotelDetails: true,
  bikeDetails: true,
} satisfies Prisma.ListingInclude;

export async function adminGetListing(actor: Actor | null, listingId: string, locale?: unknown): Promise<ListingDetailDto> {
  assertStaff(actor);
  const listing = await prisma.listing.findUnique({ where: { id: listingId }, include: adminDetailInclude });
  if (!listing) throw new NotFoundError('listing', listingId);
  // Админка видит и неактивные юниты, поэтому используется свой include,
  // но формат ответа тот же, что и на публичной карточке.
  return toDetailDto(listing, resolveLocale(locale ?? DEFAULT_LOCALE));
}

export type AdminListingRow = {
  id: string;
  slug: string;
  type: ListingType;
  status: ListingStatus;
  title: string;
  areaName: string | null;
  priceFromAmount: number | null;
  currency: Currency;
  unitCount: number;
  imageCount: number;
  updatedAt: Date;
};

export async function adminListListings(actor: Actor | null, input: unknown = {}, locale?: unknown): Promise<Paginated<AdminListingRow>> {
  assertStaff(actor);
  const filters = parseInput(adminListSchema, input);
  const contentLocale = resolveLocale(locale ?? DEFAULT_LOCALE);
  const { page, perPage, skip, take } = parsePaging(filters);

  const where: Prisma.ListingWhereInput = {
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.areaId ? { areaId: filters.areaId } : {}),
    ...(filters.query
      ? {
          OR: [
            { slug: { contains: filters.query, mode: 'insensitive' } },
            { translations: { some: { title: { contains: filters.query, mode: 'insensitive' } } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.listing.findMany({
      where,
      include: {
        translations: true,
        area: { include: { translations: true } },
        _count: { select: { units: true, images: true } },
      },
      orderBy: [{ updatedAt: 'desc' }],
      skip,
      take,
    }),
    prisma.listing.count({ where }),
  ]);

  const data: AdminListingRow[] = rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    type: row.type,
    status: row.status,
    title: pickTranslation(row.translations, contentLocale)?.title ?? row.slug,
    areaName: row.area ? pickTranslation(row.area.translations, contentLocale)?.name ?? row.area.slug : null,
    priceFromAmount: row.priceFromAmount === null ? null : Number(row.priceFromAmount),
    currency: row.currency,
    unitCount: row._count.units,
    imageCount: row._count.images,
    updatedAt: row.updatedAt,
  }));

  return paginate(data, total, page, perPage);
}
