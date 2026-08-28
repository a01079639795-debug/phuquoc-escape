'use client';

import { useState } from 'react';

import type { AreaDto } from '@/server/modules/catalog.service';
import { Icon } from '../shared/Icon';
import styles from './search.module.css';

/** Событие, по которому каталог применяет параметры поиска. */
export const SEARCH_EVENT = 'phuquoc:search';

export type SearchPayload = { area: string | null; guests: number };

/**
 * Панель поиска, наезжающая на нижний край первого экрана.
 *
 * Поля настоящие и результат настоящий: выбор применяется к каталогу ниже на
 * этой же странице. Даты пока принимаются и передаются в форму заявки — на
 * фильтр доступности они начнут влиять вместе с бронированием, и до тех пор
 * подпись у поля говорит об этом прямо, а не притворяется.
 */
export function SearchBar({ areas }: { areas: AreaDto[] }) {
  const [area, setArea] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [guests, setGuests] = useState(2);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    window.dispatchEvent(
      new CustomEvent<SearchPayload>(SEARCH_EVENT, {
        detail: { area: area || null, guests },
      }),
    );
    document.getElementById('stays')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <form className={styles.bar} onSubmit={submit}>
      <div className={styles.field}>
        <Icon name="pin" size={18} className={styles.fieldIcon} />
        <div className={styles.fieldBody}>
          <label className={styles.label} htmlFor="s-area">
            Район
          </label>
          <select
            id="s-area"
            className={styles.control}
            value={area}
            onChange={(event) => setArea(event.target.value)}
          >
            <option value="">Весь остров</option>
            {areas.map((option) => (
              <option key={option.slug} value={option.slug}>
                {option.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <span className={styles.divider} aria-hidden="true" />

      <div className={styles.field}>
        <Icon name="calendar" size={18} className={styles.fieldIcon} />
        <div className={styles.fieldBody}>
          <label className={styles.label} htmlFor="s-from">
            Заезд
          </label>
          <input
            id="s-from"
            type="date"
            className={styles.control}
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </div>
      </div>

      <span className={styles.divider} aria-hidden="true" />

      <div className={styles.field}>
        <Icon name="calendar" size={18} className={styles.fieldIcon} />
        <div className={styles.fieldBody}>
          <label className={styles.label} htmlFor="s-to">
            Выезд
          </label>
          <input
            id="s-to"
            type="date"
            className={styles.control}
            value={to}
            min={from || undefined}
            onChange={(event) => setTo(event.target.value)}
          />
        </div>
      </div>

      <span className={styles.divider} aria-hidden="true" />

      <div className={styles.field}>
        <Icon name="guests" size={18} className={styles.fieldIcon} />
        <div className={styles.fieldBody}>
          <label className={styles.label} htmlFor="s-guests">
            Гости
          </label>
          <select
            id="s-guests"
            className={styles.control}
            value={guests}
            onChange={(event) => setGuests(Number(event.target.value))}
          >
            {[1, 2, 3, 4, 5, 6].map((value) => (
              <option key={value} value={value}>
                {value} {value === 1 ? 'гость' : value < 5 ? 'гостя' : 'гостей'}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button type="submit" className={`btn btn-teal ${styles.submit}`}>
        <Icon name="search" size={18} />
        Найти
      </button>
    </form>
  );
}
