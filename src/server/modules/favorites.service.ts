/**
 * Избранное в личном кабинете.
 */

import { ListingStatus, Prisma } from '@prisma/client';

import { prisma } from '../db';
import type { Actor } from '../authz';
import { assertAuthenticated } from '../authz';
import { NotFoundError } from '../errors';
import { resolveLocale } from '../lib/locale';
import { paginate, parsePaging, type Paginated } from '../pagination';
import { toDetailDto, type ListingCardDto } from './catalog.service';

const favoriteInclude = {
  listing: {
    include: {
      translations: true,
      area: { include: { translations: true } },
      images: { include: { media: true }, orderBy: { sortOrder: 'asc' } },
      units: { where: { isActive: true }, include: { translations: true }, orderBy: { sortOrder: 'asc' } },
      amenities: { include: { amenity: { include: { translations: true } } } },
      hotelDetails: true,
      bikeDetails: true,
    },
  },
} satisfies Prisma.FavoriteInclude;

export async function listFavorites(
  actor: Actor | null,
  input: { page?: number; perPage?: number } = {},
  locale?: unknown,
): Promise<Paginated<ListingCardDto>> {
  assertAuthenticated(actor);
  const resolved = resolveLocale(locale);
  const { page, perPage, skip, take } = parsePaging(input);

  const where: Prisma.FavoriteWhereInput = { userId: actor.id };

  const [rows, total] = await Promise.all([
    prisma.favorite.findMany({ where, include: favoriteInclude, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.favorite.count({ where }),
  ]);

  // Карточка строится из того же маппера, что и публичная страница объекта:
  // одно место, где решается, как объект выглядит снаружи.
  const data = rows.map((row) => {
    const detail = toDetailDto(row.listing, resolved);
    return {
      id: detail.id,
      type: detail.type,
      slug: detail.slug,
      title: detail.title,
      shortDescription: detail.shortDescription,
      area: detail.area,
      priceFrom: detail.priceFrom,
      cover: detail.cover,
      isFeatured: detail.isFeatured,
      stars: detail.stars,
    } satisfies ListingCardDto;
  });

  return paginate(data, total, page, perPage);
}

export async function addFavorite(actor: Actor | null, listingId: string): Promise<void> {
  assertAuthenticated(actor);

  const listing = await prisma.listing.findFirst({
    where: { id: listingId, status: ListingStatus.PUBLISHED },
    select: { id: true },
  });
  if (!listing) throw new NotFoundError('listing', listingId);

  // Повторное добавление — не ошибка: пользователь мог нажать дважды.
  await prisma.favorite.upsert({
    where: { userId_listingId: { userId: actor.id, listingId } },
    create: { userId: actor.id, listingId },
    update: {},
  });
}

export async function removeFavorite(actor: Actor | null, listingId: string): Promise<void> {
  assertAuthenticated(actor);
  await prisma.favorite.deleteMany({ where: { userId: actor.id, listingId } });
}

export async function isFavorite(actor: Actor | null, listingId: string): Promise<boolean> {
  if (!actor) return false;
  const found = await prisma.favorite.findUnique({
    where: { userId_listingId: { userId: actor.id, listingId } },
    select: { userId: true },
  });
  return found !== null;
}
