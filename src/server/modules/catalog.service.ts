/**
 * Публичный каталог: поиск, карточка объекта, справочники.
 *
 * Только чтение и только опубликованные объекты. Всё, что отдаётся наружу,
 * проходит через локализующий маппер и через денежный маппер — сырые модели
 * Prisma за пределы этого модуля не выходят.
 */

import { Currency, ListingStatus, ListingType, Prisma } from '@prisma/client';
import type { AmenityScope, Locale, PriceUnit, Transmission } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../db';
import { NotFoundError } from '../errors';
import { parseInput } from '../lib/validate';
import { toMoney, type MoneyDto } from '../lib/money';
import { localesToFetch, pickTranslation, resolveLocale } from '../lib/locale';
import { paginate, parsePaging, type Paginated } from '../pagination';

// ── DTO ─────────────────────────────────────────────────────────────────────

export type AreaDto = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  lat: number | null;
  lng: number | null;
};

export type AmenityDto = {
  id: string;
  code: string;
  name: string;
  group: string | null;
  icon: string | null;
  scope: AmenityScope;
};

export type UnitDto = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  capacity: number | null;
  quantity: number;
  price: MoneyDto;
  priceUnit: PriceUnit;
  minDuration: number;
};

export type ImageDto = {
  id: string;
  url: string;
  alt: string | null;
  width: number;
  height: number;
  blurDataUrl: string | null;
  isCover: boolean;
};

export type ListingCardDto = {
  id: string;
  type: ListingType;
  slug: string;
  title: string;
  shortDescription: string | null;
  area: Pick<AreaDto, 'slug' | 'name'> | null;
  priceFrom: MoneyDto | null;
  cover: ImageDto | null;
  isFeatured: boolean;
  stars: number | null;
};

export type HotelDetailsDto = {
  stars: number | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  distanceToBeachM: number | null;
  distanceToCenterM: number | null;
  totalRooms: number | null;
};

export type BikeDetailsDto = {
  brand: string;
  model: string;
  engineCc: number | null;
  transmission: Transmission;
  year: number | null;
  deposit: MoneyDto | null;
  helmetsIncluded: number;
  deliveryIncluded: boolean;
  deliveryFee: MoneyDto | null;
};

export type ListingDetailDto = ListingCardDto & {
  description: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  amenities: AmenityDto[];
  units: UnitDto[];
  images: ImageDto[];
  hotel: HotelDetailsDto | null;
  bike: BikeDetailsDto | null;
  publishedAt: Date | null;
};

// ── схема поиска ────────────────────────────────────────────────────────────

export const searchSchema = z.object({
  type: z.nativeEnum(ListingType).optional(),
  area: z.string().trim().max(80).optional(),
  query: z.string().trim().max(120).optional(),
  priceMin: z.coerce.number().int().nonnegative().optional(),
  priceMax: z.coerce.number().int().nonnegative().optional(),
  amenities: z.union([z.string(), z.array(z.string())]).transform((v) => (Array.isArray(v) ? v : [v])).pipe(z.array(z.string().trim().max(60)).max(20)).optional(),
  guests: z.coerce.number().int().min(1).max(20).optional(),
  /**
   * Даты принимаются уже сейчас и прокидываются в форму заявки.
   * Фильтрация по доступности появится на этапе бронирования — контракт
   * поиска при этом не изменится.
   */
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  sort: z.enum(['recommended', 'price_asc', 'price_desc', 'newest']).default('recommended'),
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().optional(),
});

export type SearchInput = z.input<typeof searchSchema>;

// ── мапперы ─────────────────────────────────────────────────────────────────

const decimalToNumber = (value: Prisma.Decimal | null): number | null =>
  value === null ? null : value.toNumber();

type AreaRow = Prisma.AreaGetPayload<{ include: { translations: true } }>;

function toAreaDto(area: AreaRow, locale: Locale): AreaDto {
  const t = pickTranslation(area.translations, locale);
  return {
    id: area.id,
    slug: area.slug,
    name: t?.name ?? area.slug,
    description: t?.description ?? null,
    lat: decimalToNumber(area.lat),
    lng: decimalToNumber(area.lng),
  };
}

type AmenityRow = Prisma.AmenityGetPayload<{ include: { translations: true } }>;

function toAmenityDto(amenity: AmenityRow, locale: Locale): AmenityDto {
  const t = pickTranslation(amenity.translations, locale);
  return {
    id: amenity.id,
    code: amenity.code,
    name: t?.name ?? amenity.code,
    group: amenity.group,
    icon: amenity.icon,
    scope: amenity.scope,
  };
}

type UnitRow = Prisma.ListingUnitGetPayload<{ include: { translations: true } }>;

function toUnitDto(unit: UnitRow, locale: Locale): UnitDto {
  const t = pickTranslation(unit.translations, locale);
  return {
    id: unit.id,
    code: unit.code,
    name: t?.name ?? unit.code ?? 'Вариант размещения',
    description: t?.description ?? null,
    capacity: unit.capacity,
    quantity: unit.quantity,
    price: toMoney(unit.priceAmount, unit.currency)!,
    priceUnit: unit.priceUnit,
    minDuration: unit.minDuration,
  };
}

type ImageRow = Prisma.ListingImageGetPayload<{ include: { media: true } }>;

function toImageDto(image: ImageRow): ImageDto {
  return {
    id: image.id,
    url: image.media.url,
    alt: image.alt,
    width: image.media.width,
    height: image.media.height,
    blurDataUrl: image.media.blurDataUrl,
    isCover: image.isCover,
  };
}

const cardInclude = {
  translations: true,
  area: { include: { translations: true } },
  images: { where: { isCover: true }, include: { media: true }, take: 1 },
  hotelDetails: true,
} satisfies Prisma.ListingInclude;

type CardRow = Prisma.ListingGetPayload<{ include: typeof cardInclude }>;

function toCardDto(listing: CardRow, locale: Locale): ListingCardDto {
  const t = pickTranslation(listing.translations, locale);
  const cover = listing.images[0];
  return {
    id: listing.id,
    type: listing.type,
    slug: listing.slug,
    title: t?.title ?? listing.slug,
    shortDescription: t?.shortDescription ?? null,
    area: listing.area
      ? { slug: listing.area.slug, name: pickTranslation(listing.area.translations, locale)?.name ?? listing.area.slug }
      : null,
    priceFrom: toMoney(listing.priceFromAmount, listing.currency),
    cover: cover ? toImageDto(cover) : null,
    isFeatured: listing.isFeatured,
    stars: listing.hotelDetails?.stars ?? null,
  };
}

const detailInclude = {
  translations: true,
  area: { include: { translations: true } },
  images: { include: { media: true }, orderBy: { sortOrder: 'asc' } },
  units: { where: { isActive: true }, include: { translations: true }, orderBy: { sortOrder: 'asc' } },
  amenities: { include: { amenity: { include: { translations: true } } } },
  hotelDetails: true,
  bikeDetails: true,
} satisfies Prisma.ListingInclude;

type DetailRow = Prisma.ListingGetPayload<{ include: typeof detailInclude }>;

export function toDetailDto(listing: DetailRow, locale: Locale): ListingDetailDto {
  const t = pickTranslation(listing.translations, locale);
  const images = listing.images.map(toImageDto);
  const bike = listing.bikeDetails;

  return {
    id: listing.id,
    type: listing.type,
    slug: listing.slug,
    title: t?.title ?? listing.slug,
    shortDescription: t?.shortDescription ?? null,
    description: t?.description ?? null,
    metaTitle: t?.metaTitle ?? null,
    metaDescription: t?.metaDescription ?? null,
    area: listing.area
      ? { slug: listing.area.slug, name: pickTranslation(listing.area.translations, locale)?.name ?? listing.area.slug }
      : null,
    priceFrom: toMoney(listing.priceFromAmount, listing.currency),
    cover: images.find((i) => i.isCover) ?? images[0] ?? null,
    isFeatured: listing.isFeatured,
    stars: listing.hotelDetails?.stars ?? null,
    address: listing.address,
    lat: decimalToNumber(listing.lat),
    lng: decimalToNumber(listing.lng),
    amenities: listing.amenities.map((link) => toAmenityDto(link.amenity, locale)),
    units: listing.units.map((u) => toUnitDto(u, locale)),
    images,
    hotel: listing.hotelDetails
      ? {
          stars: listing.hotelDetails.stars,
          checkInTime: listing.hotelDetails.checkInTime,
          checkOutTime: listing.hotelDetails.checkOutTime,
          distanceToBeachM: listing.hotelDetails.distanceToBeachM,
          distanceToCenterM: listing.hotelDetails.distanceToCenterM,
          totalRooms: listing.hotelDetails.totalRooms,
        }
      : null,
    bike: bike
      ? {
          brand: bike.brand,
          model: bike.model,
          engineCc: bike.engineCc,
          transmission: bike.transmission,
          year: bike.year,
          deposit: toMoney(bike.depositAmount, bike.depositCurrency ?? Currency.VND),
          helmetsIncluded: bike.helmetsIncluded,
          deliveryIncluded: bike.deliveryIncluded,
          deliveryFee: toMoney(bike.deliveryFeeAmount, listing.currency),
        }
      : null,
    publishedAt: listing.publishedAt,
  };
}

// ── операции ────────────────────────────────────────────────────────────────

function buildOrderBy(sort: string): Prisma.ListingOrderByWithRelationInput[] {
  switch (sort) {
    case 'price_asc':
      return [{ priceFromAmount: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }];
    case 'price_desc':
      return [{ priceFromAmount: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }];
    case 'newest':
      return [{ publishedAt: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }];
    default:
      return [{ isFeatured: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }];
  }
}

export async function searchListings(input: SearchInput = {}, rawLocale?: unknown): Promise<Paginated<ListingCardDto>> {
  const filters = parseInput(searchSchema, input);
  const locale = resolveLocale(rawLocale);
  const { page, perPage, skip, take } = parsePaging(filters);

  const and: Prisma.ListingWhereInput[] = [];

  // Каждое выбранное удобство — отдельное условие: пользователь ожидает
  // «И бассейн, И завтрак», а не «или то, или другое».
  for (const code of filters.amenities ?? []) {
    and.push({ amenities: { some: { amenity: { code } } } });
  }

  if (filters.guests) {
    and.push({ units: { some: { isActive: true, capacity: { gte: filters.guests } } } });
  }

  if (filters.query) {
    and.push({
      translations: {
        some: {
          locale: { in: localesToFetch(locale) },
          title: { contains: filters.query, mode: 'insensitive' },
        },
      },
    });
  }

  const where: Prisma.ListingWhereInput = {
    status: ListingStatus.PUBLISHED,
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.area ? { area: { slug: filters.area } } : {}),
    ...(filters.priceMin !== undefined || filters.priceMax !== undefined
      ? {
          priceFromAmount: {
            ...(filters.priceMin !== undefined ? { gte: BigInt(filters.priceMin) } : {}),
            ...(filters.priceMax !== undefined ? { lte: BigInt(filters.priceMax) } : {}),
          },
        }
      : {}),
    ...(and.length ? { AND: and } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.listing.findMany({ where, include: cardInclude, orderBy: buildOrderBy(filters.sort), skip, take }),
    prisma.listing.count({ where }),
  ]);

  return paginate(rows.map((row) => toCardDto(row, locale)), total, page, perPage);
}

export async function getListingBySlug(slug: string, rawLocale?: unknown): Promise<ListingDetailDto> {
  const locale = resolveLocale(rawLocale);

  const listing = await prisma.listing.findFirst({
    where: { slug, status: ListingStatus.PUBLISHED },
    include: detailInclude,
  });

  if (!listing) throw new NotFoundError('listing', slug);
  return toDetailDto(listing, locale);
}

export async function listAreas(rawLocale?: unknown): Promise<AreaDto[]> {
  const locale = resolveLocale(rawLocale);
  const areas = await prisma.area.findMany({
    where: { isActive: true },
    include: { translations: true },
    orderBy: { sortOrder: 'asc' },
  });
  return areas.map((a) => toAreaDto(a, locale));
}

export async function listAmenities(scope?: AmenityScope, rawLocale?: unknown): Promise<AmenityDto[]> {
  const locale = resolveLocale(rawLocale);
  const amenities = await prisma.amenity.findMany({
    where: {
      isActive: true,
      ...(scope ? { scope: { in: [scope, 'ANY'] } } : {}),
    },
    include: { translations: true },
    orderBy: { sortOrder: 'asc' },
  });
  return amenities.map((a) => toAmenityDto(a, locale));
}

/**
 * Байки для витрины.
 *
 * Отдельная функция, а не searchListings: карточке байка нужны марка, объём и
 * коробка, а тянуть их отдельным запросом на каждую единицу — дюжина лишних
 * обращений к базе на одну страницу.
 */
export type BikeCardDto = ListingCardDto & {
  bike: BikeDetailsDto;
  /**
   * Тариф без условий по сроку — то, что человек сравнивает в первую очередь.
   * Именно он идёт в заголовок карточки: показывать в качестве цены недельный
   * тариф означало бы объявить стоимость ниже той, по которой байк реально
   * возьмут на два дня.
   */
  perDay: MoneyDto | null;
  minDuration: number;
  /** Более дешёвый тариф на длительный срок, если он есть. */
  longStay: { price: MoneyDto; minDuration: number } | null;
};

export async function listBikes(limit = 12, rawLocale?: unknown): Promise<BikeCardDto[]> {
  const locale = resolveLocale(rawLocale);

  const rows = await prisma.listing.findMany({
    where: { status: ListingStatus.PUBLISHED, type: ListingType.BIKE },
    include: {
      ...cardInclude,
      bikeDetails: true,
      units: { where: { isActive: true }, include: { translations: true }, orderBy: { priceAmount: 'asc' } },
    },
    orderBy: [{ isFeatured: 'desc' }, { priceFromAmount: 'asc' }, { id: 'asc' }],
    take: Math.min(24, Math.max(1, limit)),
  });

  return rows
    .filter((row) => row.bikeDetails !== null)
    .map((row) => {
      const bike = row.bikeDetails!;

      // Базовый тариф — с наименьшим минимальным сроком, а не с наименьшей
      // ценой: у самого дешёвого обычно условие «от семи суток».
      const base = [...row.units].sort(
        (a, b) => a.minDuration - b.minDuration || Number(a.priceAmount - b.priceAmount),
      )[0];

      const discounted = row.units
        .filter((unit) => base && unit.minDuration > base.minDuration && unit.priceAmount < base.priceAmount)
        .sort((a, b) => Number(a.priceAmount - b.priceAmount))[0];

      return {
        ...toCardDto(row, locale),
        bike: {
          brand: bike.brand,
          model: bike.model,
          engineCc: bike.engineCc,
          transmission: bike.transmission,
          year: bike.year,
          deposit: toMoney(bike.depositAmount, bike.depositCurrency ?? Currency.VND),
          helmetsIncluded: bike.helmetsIncluded,
          deliveryIncluded: bike.deliveryIncluded,
          deliveryFee: toMoney(bike.deliveryFeeAmount, row.currency),
        },
        perDay: base ? toMoney(base.priceAmount, base.currency) : null,
        minDuration: base?.minDuration ?? 1,
        longStay: discounted
          ? {
              price: toMoney(discounted.priceAmount, discounted.currency)!,
              minDuration: discounted.minDuration,
            }
          : null,
      };
    });
}

/** Подборка для главной страницы. */
export async function listFeatured(limit = 6, rawLocale?: unknown): Promise<ListingCardDto[]> {
  const locale = resolveLocale(rawLocale);
  const rows = await prisma.listing.findMany({
    where: { status: ListingStatus.PUBLISHED, isFeatured: true },
    include: cardInclude,
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    take: Math.min(24, Math.max(1, limit)),
  });
  return rows.map((row) => toCardDto(row, locale));
}
