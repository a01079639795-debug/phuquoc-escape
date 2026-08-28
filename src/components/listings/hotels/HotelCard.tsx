import Image from 'next/image';

import { coverFor } from '@/lib/media';
import type { ListingCardDto } from '@/server/modules/catalog.service';
import { Icon } from '../../shared/Icon';

/**
 * Карточка жилья.
 *
 * Плашка сверху показывает категорию звёздами, а не выдуманным рейтингом:
 * оценок постояльцев у нас пока нет, и рисовать «4.8» было бы неправдой.
 */
export function HotelCard({
  hotel,
  priority = false,
}: {
  hotel: ListingCardDto;
  priority?: boolean;
}) {
  const cover = coverFor('HOTEL', hotel.slug, hotel.title);

  return (
    <a className="card group h-full" href={`/hotels/${hotel.slug}`}>
      <div className="photo aspect-[4/3]">
        <Image
          src={cover.url}
          alt={cover.alt ?? hotel.title}
          width={cover.width}
          height={cover.height}
          sizes="(max-width: 640px) 92vw, (max-width: 1100px) 46vw, 24vw"
          priority={priority}
          loading={priority ? undefined : 'lazy'}
        />

        {hotel.stars ? (
          <span className="chip absolute left-3 top-3">
            <Icon name="star" size={13} className="text-[var(--color-gold)]" />
            {hotel.stars}
          </span>
        ) : null}

        {/*
          Сердце пока только отмечает намерение: избранное живёт в кабинете,
          которого на этом этапе нет. Кнопка честно говорит об этом заголовком
          и не притворяется сохраняющей.
        */}
        <span className="fav absolute right-3 top-3" title="Избранное появится вместе с кабинетом">
          <Icon name="heart" size={15} />
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="m-0 text-[1rem] font-[600] leading-[1.3] tracking-[-0.01em]">
          {hotel.title}
        </h3>

        {hotel.area ? (
          <p className="m-0 mt-1.5 flex items-center gap-1.5 text-[0.8125rem] text-[var(--color-ink-soft)]">
            <Icon name="pin" size={14} />
            {hotel.area.name}
          </p>
        ) : null}

        <p className="m-0 mt-auto border-t border-[color-mix(in_srgb,var(--color-ink)_10%,transparent)] pt-3.5 text-[0.8125rem] text-[var(--color-ink-soft)]">
          от <span className="price text-[1.0625rem]">{hotel.priceFrom?.formatted ?? '—'}</span> / ночь
        </p>
      </div>
    </a>
  );
}
