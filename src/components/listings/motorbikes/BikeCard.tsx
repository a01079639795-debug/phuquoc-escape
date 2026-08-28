import Image from 'next/image';

import { coverFor } from '@/lib/media';
import type { BikeCardDto } from '@/server/modules/catalog.service';
import { Icon } from '../../shared/Icon';

const TRANSMISSION: Record<string, string> = {
  AUTOMATIC: 'автомат',
  SEMI_AUTOMATIC: 'полуавтомат',
  MANUAL: 'механика',
};

/**
 * Карточка байка.
 *
 * Байк выбирают по кубатуре и коробке, а не по атмосфере, поэтому
 * характеристики стоят строкой сразу под названием, а не прячутся в описание.
 */
export function BikeCard({ bike }: { bike: BikeCardDto }) {
  const cover = coverFor('BIKE', bike.slug, bike.title);
  const specs = [
    bike.bike.engineCc ? `${bike.bike.engineCc} см³` : null,
    TRANSMISSION[bike.bike.transmission] ?? null,
    bike.bike.year ? String(bike.bike.year) : null,
  ].filter(Boolean) as string[];

  return (
    <a
      href={`/bikes/${bike.slug}`}
      className="card group h-full w-[min(82vw,20.5rem)] flex-none sm:w-[21rem]"
    >
      <div className="photo aspect-[16/10]">
        <Image
          src={cover.url}
          alt={cover.alt ?? bike.title}
          width={cover.width}
          height={cover.height}
          sizes="(max-width: 640px) 82vw, 21rem"
          loading="lazy"
        />
        {bike.bike.deliveryIncluded ? (
          <span className="chip absolute left-3 top-3">Доставка в отель</span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="m-0 text-[0.75rem] font-[600] uppercase tracking-[0.14em] text-[var(--color-ink-soft)]">
          {bike.bike.brand}
        </p>
        <h3 className="m-0 mt-1 text-[1.0625rem] font-[600] leading-[1.25]">{bike.bike.model}</h3>

        <ul className="m-0 mt-3 flex list-none flex-wrap items-center gap-x-2 gap-y-1 p-0 text-[0.8125rem] text-[var(--color-ink-soft)]">
          {specs.map((spec, index) => (
            <li key={spec} className="flex items-center gap-2">
              {index > 0 ? (
                <span className="h-1 w-1 rounded-full bg-current opacity-40" aria-hidden="true" />
              ) : null}
              {spec}
            </li>
          ))}
        </ul>

        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <p className="m-0 text-[0.875rem] text-[var(--color-ink-soft)]">
            <span className="data text-[1.0625rem] font-[600] text-[var(--color-ink)]">
              {bike.perDay?.formatted ?? '—'}
            </span>{' '}
            / сутки
            {bike.longStay ? (
              <span className="mt-0.5 block text-[0.75rem]">
                {bike.longStay.price.formatted} от {bike.longStay.minDuration} дней
              </span>
            ) : null}
          </p>
          <span className="grid h-9 w-9 flex-none place-items-center rounded-full border border-[color-mix(in_srgb,var(--color-ink)_16%,transparent)] text-[var(--color-teal)] transition-colors duration-300 group-hover:border-[var(--color-gold)] group-hover:bg-[var(--color-gold)] group-hover:text-[#2c1e05]">
            <Icon name="arrow-right" size={16} />
          </span>
        </div>
      </div>
    </a>
  );
}
