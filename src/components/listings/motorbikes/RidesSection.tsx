import type { BikeCardDto } from '@/server/modules/catalog.service';
import { Reveal } from '../../shared/Reveal';
import { SectionHeading } from '../../shared/SectionHeading';
import { BikeCard } from './BikeCard';

/**
 * Аренда байков.
 *
 * Лента с горизонтальной прокруткой, а не сетка: моделей дюжина, они
 * сопоставимы между собой, и их сравнивают, а не выбирают по одной.
 * Обрезанная у правого края карточка сама показывает, что список
 * продолжается — подсказка «листайте вбок» не нужна.
 */
export function RidesSection({ bikes }: { bikes: BikeCardDto[] }) {
  return (
    <section id="rides" className="section bg-sand" aria-labelledby="rides-title">
      <div className="shell">
        <SectionHeading
          id="rides-title"
          eyebrow={`${bikes.length} моделей · автомат и механика`}
          title="На чём ездить"
          accent="по острову"
          lede="Остров объезжается за день. Без байка половина пляжей остаётся на картинках."
        />
      </div>

      <Reveal>
        <ul
          className="m-0 flex list-none snap-x snap-mandatory gap-4 overflow-x-auto p-0 pb-5"
          style={{
            paddingInlineStart:
              'max(var(--spacing-gutter), calc((100vw - 82rem) / 2 + var(--spacing-gutter)))',
            paddingInlineEnd: 'var(--spacing-gutter)',
          }}
        >
          {bikes.map((bike) => (
            <li key={bike.id} className="flex snap-start">
              <BikeCard bike={bike} />
            </li>
          ))}
        </ul>
      </Reveal>

      <div className="shell">
        <p className="lede m-0 mt-2">
          Депозит и доставку подтверждает менеджер при обработке заявки. Права
          нужны мотоциклетные: вьетнамская категория A1 (до 125 см³) или A,
          либо международное удостоверение по конвенции 1968 года.
          Автоматическая коробка этого не отменяет — категории B на байк
          недостаточно.
        </p>
      </div>
    </section>
  );
}
