'use client';

import { useEffect, useMemo, useState } from 'react';

import type { AreaDto, ListingCardDto } from '@/server/modules/catalog.service';
import { SEARCH_EVENT, type SearchPayload } from '../../hero/SearchBar';
import { Icon } from '../../shared/Icon';
import { Reveal } from '../../shared/Reveal';
import { SectionHeading } from '../../shared/SectionHeading';
import { HotelCard } from './HotelCard';

/**
 * Каталог жилья с фильтром по районам.
 *
 * Фильтр стоит рядом с тем, что фильтрует, и работает по-настоящему. Панель
 * поиска на первом экране присылает сюда событие — так у неё есть настоящий
 * результат, а не вид работающей формы.
 *
 * Объекты отдаются целиком и фильтруются на клиенте: на полутора десятках
 * карточек запрос за каждым нажатием стоил бы дороже самих данных.
 */
export function StaysSection({
  hotels,
  areas,
}: {
  hotels: ListingCardDto[];
  areas: AreaDto[];
}) {
  const [area, setArea] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);

  /** По четыре карточки на страницу — как в исходном макете. */
  const PER_PAGE = 4;

  useEffect(() => {
    const onSearch = (event: Event) => {
      const detail = (event as CustomEvent<SearchPayload>).detail;
      setArea(detail.area);
      setPageIndex(0);
    };
    window.addEventListener(SEARCH_EVENT, onSearch);
    return () => window.removeEventListener(SEARCH_EVENT, onSearch);
  }, []);

  // В фильтре только районы, где действительно есть жильё: пустой фильтр,
  // который ничего не находит, — это дефект, а не полнота.
  const options = useMemo(() => {
    const counts = new Map<string, number>();
    for (const hotel of hotels) {
      if (!hotel.area) continue;
      counts.set(hotel.area.slug, (counts.get(hotel.area.slug) ?? 0) + 1);
    }
    return areas
      .filter((option) => counts.has(option.slug))
      .map((option) => ({ ...option, count: counts.get(option.slug)! }));
  }, [hotels, areas]);

  const visible = area ? hotels.filter((hotel) => hotel.area?.slug === area) : hotels;
  const pageCount = Math.max(1, Math.ceil(visible.length / PER_PAGE));
  const safeIndex = Math.min(pageIndex, pageCount - 1);
  const page = visible.slice(safeIndex * PER_PAGE, safeIndex * PER_PAGE + PER_PAGE);
  const activeName = options.find((option) => option.slug === area)?.name;

  return (
    <section id="stays" className="section" aria-labelledby="stays-title">
      <div className="shell">
        <SectionHeading
          id="stays-title"
          eyebrow={`${hotels.length} мест на острове`}
          title="Где остановиться"
          accent="для вас"
          action={
            <a
              className="inline-flex items-center gap-3 text-[0.9375rem] font-[600] no-underline text-[var(--color-ink)]"
              href="#island"
            >
              Смотреть по районам
              <span className="btn-round">
                <Icon name="arrow-right" size={18} />
              </span>
            </a>
          }
        />

        <div className="mb-[clamp(1.5rem,3vw,2.25rem)] flex flex-wrap gap-2" role="group" aria-label="Фильтр по районам">
          <Chip active={area === null} onClick={() => { setArea(null); setPageIndex(0); }}>
            Весь остров <Count>{hotels.length}</Count>
          </Chip>
          {options.map((option) => (
            <Chip
              key={option.slug}
              active={area === option.slug}
              onClick={() => {
                setArea(area === option.slug ? null : option.slug);
                setPageIndex(0);
              }}
            >
              {option.name} <Count>{option.count}</Count>
            </Chip>
          ))}
        </div>

        <ul
          className="m-0 grid list-none grid-cols-1 gap-[clamp(1rem,1.8vw,1.5rem)] p-0 sm:grid-cols-2 lg:grid-cols-4"
          aria-live="polite"
        >
          {page.map((hotel, index) => (
            <Reveal as="li" key={hotel.id} delay={Math.min(index, 4) * 70}>
              <HotelCard hotel={hotel} priority={index < 4} />
            </Reveal>
          ))}
        </ul>

        {/* Точки перелистывают по-настоящему: витрина показывает четвёрку
            за раз, как в исходном макете, а не весь список сразу. */}
        {pageCount > 1 ? (
          <div className="mt-8 flex items-center justify-center gap-2.5">
            {Array.from({ length: pageCount }, (_, index) => (
              // Точка маленькая, а нажимаемая область — полноразмерная:
              // попасть пальцем в 10 px невозможно.
              <button
                key={index}
                type="button"
                onClick={() => setPageIndex(index)}
                aria-label={`Страница ${index + 1} из ${pageCount}`}
                aria-current={index === safeIndex}
                className="group grid h-11 w-11 cursor-pointer place-items-center rounded-full"
              >
                <span
                  className={`h-2.5 rounded-full transition-all duration-300 ${
                    index === safeIndex
                      ? 'w-7 bg-[var(--color-gold)]'
                      : 'w-2.5 bg-[color-mix(in_srgb,var(--color-ink)_22%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--color-ink)_38%,transparent)]'
                  }`}
                />
              </button>
            ))}
          </div>
        ) : null}

        {visible.length === 0 ? (
          <p className="mt-8 text-[var(--color-ink-soft)]">
            В районе {activeName ?? '—'} пока нет жилья. Выберите другой или посмотрите весь остров.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function Count({ children }: { children: React.ReactNode }) {
  return <span className="data ml-1 text-[0.75rem] opacity-55">{children}</span>;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'inline-flex min-h-[44px] cursor-pointer items-center rounded-full border px-4 text-[0.875rem] transition-colors duration-200',
        active
          ? 'border-transparent bg-[var(--color-teal)] text-[var(--color-cream)]'
          : 'border-[color-mix(in_srgb,var(--color-ink)_16%,transparent)] bg-[var(--color-shell)] text-[var(--color-ink)] hover:border-[var(--color-teal)]',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
