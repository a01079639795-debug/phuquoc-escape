import Image from 'next/image';
import Link from 'next/link';

import { galleryFor } from '@/lib/media';
import type { ListingDetailDto } from '@/server/modules/catalog.service';

const TRANSMISSION: Record<string, string> = {
  AUTOMATIC: 'автомат',
  SEMI_AUTOMATIC: 'полуавтомат',
  MANUAL: 'механика',
};

/**
 * Страница объекта.
 *
 * Намеренно сдержанная: на этом шаге задача — не оставить карточки каталога
 * ведущими в никуда и показать данные, которые уже есть. Форма заявки, галерея
 * с лайтбоксом и карта появятся отдельным шагом; вместо заглушки-кнопки внизу
 * стоит прямой текст о том, что происходит дальше.
 */
export function ListingDetail({ listing }: { listing: ListingDetailDto }) {
  const isBike = listing.type === 'BIKE';
  const gallery = galleryFor(listing.type, listing.slug, listing.title);
  const cover = gallery[0];

  const facts = isBike
    ? [
        listing.bike?.engineCc ? { k: 'Двигатель', v: `${listing.bike.engineCc} см³` } : null,
        listing.bike ? { k: 'Коробка', v: TRANSMISSION[listing.bike.transmission] ?? '—' } : null,
        listing.bike?.year ? { k: 'Год', v: String(listing.bike.year) } : null,
        listing.bike?.deposit ? { k: 'Депозит', v: listing.bike.deposit.formatted } : null,
        listing.bike ? { k: 'Шлемы', v: String(listing.bike.helmetsIncluded) } : null,
        listing.bike?.deliveryIncluded ? { k: 'Доставка', v: 'по острову' } : null,
      ]
    : [
        listing.hotel?.stars ? { k: 'Категория', v: `${listing.hotel.stars}★` } : null,
        listing.hotel?.checkInTime ? { k: 'Заезд', v: listing.hotel.checkInTime } : null,
        listing.hotel?.checkOutTime ? { k: 'Выезд', v: listing.hotel.checkOutTime } : null,
        listing.hotel?.distanceToBeachM !== null && listing.hotel?.distanceToBeachM !== undefined
          ? { k: 'До пляжа', v: `${listing.hotel.distanceToBeachM} м` }
          : null,
        listing.hotel?.totalRooms ? { k: 'Номеров', v: String(listing.hotel.totalRooms) } : null,
      ];

  const visibleFacts = facts.filter(Boolean) as { k: string; v: string }[];

  return (
    <article className="bg-[var(--color-cream)] text-[var(--color-ink)]">
      <div className="shell pt-[calc(var(--nav-h)+clamp(1.5rem,4vw,3rem))]">
        <Link
          href={isBike ? '/#rides' : '/#stays'}
          className="inline-flex items-center gap-2 text-[var(--color-ink-soft)] no-underline hover:text-[var(--color-ink)]"
        >
          <span aria-hidden="true">←</span>
          {isBike ? 'Все байки' : 'Всё жильё'}
        </Link>

        <header className="mt-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-[24ch]">
            {listing.area ? <p className="eyebrow mb-3 text-[var(--color-ink-soft)]">{listing.area.name}</p> : null}
            <h1
              className="m-0 font-[600] leading-[1.06] tracking-[-0.02em]"
              style={{ fontSize: 'clamp(2rem, 5vw, 3.4rem)', textWrap: 'balance' }}
            >
              {listing.title}
            </h1>
          </div>
          {listing.priceFrom ? (
            <p className="m-0 flex-none">
              <span className="eyebrow block text-[var(--color-ink-soft)]">
                {isBike ? 'В сутки от' : 'За ночь от'}
              </span>
              <span className="mt-1 block font-mono text-[1.5rem] font-[500]">
                {listing.priceFrom.formatted}
              </span>
            </p>
          ) : null}
        </header>
      </div>

      {cover ? (
        <div className="shell mt-[clamp(1.5rem,3vw,2.5rem)]">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="relative aspect-[16/10] overflow-hidden rounded-[12px] bg-[var(--color-sand)]">
              <Image
                src={cover.url}
                alt={cover.alt ?? listing.title}
                fill
                sizes="(max-width: 768px) 100vw, 66vw"
                placeholder={cover.blurDataUrl ? 'blur' : 'empty'}
                blurDataURL={cover.blurDataUrl ?? undefined}
                priority
                className="object-cover"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
              {gallery.slice(1, 3).map((image) => (
                <div
                  key={image.id}
                  className="relative aspect-[16/10] overflow-hidden rounded-[12px] bg-[var(--color-sand)]"
                >
                  <Image
                    src={image.url}
                    alt={image.alt ?? ''}
                    fill
                    sizes="(max-width: 768px) 50vw, 33vw"
                    loading="lazy"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="shell grid grid-cols-1 gap-[clamp(2rem,4vw,4rem)] py-[clamp(2.5rem,6vw,5rem)] lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div>
          {listing.description ? (
            <p className="lede m-0 max-w-[62ch] whitespace-pre-line">{listing.description}</p>
          ) : null}

          {visibleFacts.length ? (
            <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              {visibleFacts.map((fact) => (
                <div key={fact.k}>
                  <dt className="eyebrow text-[var(--color-ink-soft)]">{fact.k}</dt>
                  <dd className="m-0 mt-1 font-mono text-[0.95rem]">{fact.v}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {listing.amenities.length ? (
            <>
              <hr className="mt-10 border-0 border-t border-[color-mix(in_srgb,var(--color-ink)_14%,transparent)]" />
              <h2 className="mt-8 text-[1.05rem] font-[600]">
                {isBike ? 'Что входит' : 'Удобства'}
              </h2>
              <ul className="m-0 mt-4 flex list-none flex-wrap gap-x-5 gap-y-2 p-0">
                {listing.amenities.map((amenity) => (
                  <li key={amenity.id} className="text-[0.9375rem] text-[var(--color-ink-soft)]">
                    {amenity.name}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>

        <aside>
          <h2 className="text-[1.05rem] font-[600]">
            {isBike ? 'Тарифы' : 'Варианты размещения'}
          </h2>
          <ul className="m-0 mt-4 list-none p-0">
            {listing.units.map((unit) => (
              <li
                key={unit.id}
                className="border-t border-[color-mix(in_srgb,var(--color-ink)_28%,transparent)] py-4 last:border-b"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-[600]">{unit.name}</span>
                  <span className="flex-none font-mono text-[0.95rem]">
                    {unit.price.formatted}
                  </span>
                </div>
                <p className="eyebrow m-0 mt-1.5 text-[var(--color-ink-soft)]">
                  {unit.capacity ? `до ${unit.capacity} чел · ` : ''}
                  {unit.priceUnit === 'NIGHT' ? 'за ночь' : 'за сутки'}
                  {unit.minDuration > 1 ? ` · от ${unit.minDuration}` : ''}
                </p>
                {unit.description ? (
                  <p className="m-0 mt-2 text-[0.9rem] leading-[1.5] text-[var(--color-ink-soft)]">
                    {unit.description}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>

          <p className="mt-6 rounded-[12px] bg-[var(--color-sand)] p-5 text-[0.9375rem] leading-[1.55] text-[var(--color-ink-soft)]">
            Форма заявки подключается следующим шагом — приём заявок на стороне
            сервера уже работает и покрыт тестами.
          </p>
        </aside>
      </div>
    </article>
  );
}
