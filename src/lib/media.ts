/**
 * Подстановка настоящих фотографий вместо демонстрационных.
 *
 * В базе у объектов лежат ссылки на внешний плейсхолдер — случайные снимки,
 * не имеющие отношения к острову. Пока своей фотобазы нет, витрина
 * показывает реальные фотографии из public/images: они верно передают, как
 * выглядит жильё и техника, и не создают ложного впечатления, будто это
 * снимки конкретного объекта.
 *
 * Как заменить на свои: положить файл в public/images/stays или
 * public/images/bikes и добавить его в списки ниже. Ничего больше менять не
 * нужно. Когда у каждого объекта появится собственная фотография, эта
 * подстановка убирается — карточки уже читают cover из базы.
 */

import type { ImageDto } from '@/server/modules/catalog.service';

const STAY_PHOTOS = [
  '/images/stays/bungalow-dusk.jpg',
  '/images/stays/bungalow-night.jpg',
] as const;

const BIKE_PHOTO = '/images/bikes/honda-vision.jpg';

/** Все подставляемые снимки сняты горизонтально в одном размере. */
const PHOTO_SIZE = { width: 1280, height: 853 };

/**
 * Устойчивый выбор по slug: у объекта всегда одна и та же фотография.
 * Случайный выбор менял бы картинку при каждой отрисовке, и список
 * «прыгал» бы между переходами.
 */
function pick(slug: string, count: number): number {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  return hash % count;
}

export function stayPhoto(slug: string, alt: string): ImageDto {
  return {
    id: `stay-${slug}`,
    url: STAY_PHOTOS[pick(slug, STAY_PHOTOS.length)]!,
    alt,
    ...PHOTO_SIZE,
    blurDataUrl: null,
    isCover: true,
  };
}

export function bikePhoto(slug: string, alt: string): ImageDto {
  return {
    id: `bike-${slug}`,
    url: BIKE_PHOTO,
    alt,
    ...PHOTO_SIZE,
    blurDataUrl: null,
    isCover: true,
  };
}

/** Галерея страницы объекта: те же настоящие снимки, что и в карточке. */
export function galleryFor(type: 'HOTEL' | 'BIKE', slug: string, title: string): ImageDto[] {
  if (type === 'BIKE') return [bikePhoto(slug, title)];

  // У жилья два кадра: первый — как в карточке, второй — второй ракурс.
  const first = pick(slug, STAY_PHOTOS.length);
  return STAY_PHOTOS.map((_url, index) => ({
    id: `stay-${slug}-${index}`,
    url: STAY_PHOTOS[(first + index) % STAY_PHOTOS.length]!,
    alt: title,
    ...PHOTO_SIZE,
    blurDataUrl: null,
    isCover: index === 0,
  }));
}

/** Обложка карточки: настоящая фотография вместо плейсхолдера из базы. */
export function coverFor(
  type: 'HOTEL' | 'BIKE',
  slug: string,
  title: string,
): ImageDto {
  return type === 'BIKE' ? bikePhoto(slug, title) : stayPhoto(slug, title);
}
