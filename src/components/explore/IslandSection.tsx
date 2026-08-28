'use client';

import Image from 'next/image';
import { useState } from 'react';

import type { AreaDto } from '@/server/modules/catalog.service';
import { Icon, type IconName } from '../shared/Icon';
import { LeafDecor } from '../shared/LeafDecor';
import { Reveal } from '../shared/Reveal';
import { SectionHeading } from '../shared/SectionHeading';
import { ATTRACTIONS } from './attractions';
import styles from './island.module.css';

/**
 * Остров: одна карта, два взгляда на неё.
 *
 * Карта — вид Фукуока с высоты. Внешний картографический сервис не
 * подключается: тайлы тянут стороннюю библиотеку, свои ключи и лишние
 * полмегабайта, а показать нужно полтора десятка точек на узнаваемом острове.
 *
 * Переключатель меняет не карту, а то, что на ней отмечено. «Что посмотреть» —
 * места, ради которых сюда едут; «Районы» — где жить, и оттуда прямая дорога
 * в каталог. Порядок именно такой: район выбирают, когда уже решили ехать, а
 * до этого человеку нужно понять, чем остров хорош.
 *
 * Подписи на снимке были впечатаны латиницей и не нажимались; их убрал
 * `scripts/island-map.mjs`, а маркеры теперь свои — русские и живые.
 */

/** Вьетнамские названия районов: то, что написано на указателях острова. */
const LOCAL_NAMES: Record<string, string> = {
  'duong-dong': 'Dương Đông',
  'ong-lang': 'Ông Lang',
  'bai-truong': 'Bãi Trường',
  'bai-sao': 'Bãi Sao',
  'an-thoi': 'An Thới',
  'cua-can': 'Cửa Cạn',
  'ganh-dau': 'Gành Dầu',
};

/**
 * Районы на карте — доли кадра, а не широта с долготой: снимок сделан с
 * высоты и под углом, географическая сетка на него не ложится. Точки
 * расставлены по узнаваемым местам самого кадра: город на западном берегу,
 * длинный пляж южнее, порт на юге.
 */
const AREA_POSITION: Record<string, { x: number; y: number }> = {
  'ganh-dau': { x: 0.145, y: 0.205 },
  'cua-can': { x: 0.335, y: 0.345 },
  'ong-lang': { x: 0.175, y: 0.375 },
  'duong-dong': { x: 0.215, y: 0.462 },
  'bai-truong': { x: 0.245, y: 0.56 },
  'bai-sao': { x: 0.215, y: 0.65 },
  'an-thoi': { x: 0.64, y: 0.7 },
};

const FEATURES: { icon: IconName; label: string; note: string }[] = [
  { icon: 'wave', label: 'Пляжи', note: 'От белого песка до диких бухт' },
  { icon: 'temple', label: 'Культура', note: 'Храмы, рынки, перечные фермы' },
  { icon: 'camera', label: 'Виды', note: 'Канатка, закаты, архипелаг' },
  { icon: 'bowl', label: 'Кухня', note: 'Морепродукты, бун куай и сельдь гой' },
];

const MODES = [
  { id: 'sights', label: 'Что посмотреть' },
  { id: 'areas', label: 'Районы' },
] as const;

type ModeId = (typeof MODES)[number]['id'];

/** Точка на карте: и район, и достопримечательность приводятся к этому виду. */
type MapPoint = {
  id: string;
  name: string;
  local: string;
  meta: string;
  description: string;
  icon: IconName;
  x: number;
  y: number;
};

export function IslandSection({ areas }: { areas: AreaDto[] }) {
  const [mode, setMode] = useState<ModeId>('sights');

  const sights: MapPoint[] = ATTRACTIONS.map((item) => ({
    id: item.id,
    name: item.name,
    local: item.local,
    meta: item.note,
    description: item.description,
    icon: item.icon,
    x: item.x,
    y: item.y,
  }));

  // Порядок с севера на юг: номера на карте должны читаться сверху вниз,
  // а не в том порядке, в каком районы легли в базу.
  const districts: MapPoint[] = areas
    .filter((area) => AREA_POSITION[area.slug])
    .sort((a, b) => AREA_POSITION[a.slug]!.y - AREA_POSITION[b.slug]!.y)
    .map((area) => ({
      id: area.slug,
      name: area.name,
      local: LOCAL_NAMES[area.slug] ?? '',
      meta:
        area.lat != null && area.lng != null
          ? `${area.lat.toFixed(2)}° N · ${area.lng.toFixed(2)}° E`
          : 'Район острова',
      description: area.description ?? '',
      icon: 'pin',
      x: AREA_POSITION[area.slug]!.x,
      y: AREA_POSITION[area.slug]!.y,
    }));

  const points = mode === 'sights' ? sights : districts;

  // Выбранная точка своя у каждого режима: вернулся на вкладку — она на месте.
  const [chosen, setChosen] = useState<Record<ModeId, string>>({
    sights: sights[0]?.id ?? '',
    areas: districts[0]?.id ?? '',
  });
  const active = points.find((point) => point.id === chosen[mode]) ?? points[0];

  const pick = (id: string) => setChosen((prev) => ({ ...prev, [mode]: id }));

  return (
    <section id="island" className={styles.section} aria-labelledby="island-title">
      <LeafDecor kind="monstera" className="-bottom-16 -right-10 hidden md:block" width={340} rotate={12} />
      <LeafDecor kind="palm" className="-bottom-8 right-40 hidden lg:block" width={380} rotate={-8} flip />
      <div className={`shell ${styles.grid}`}>
        {/* ── Текст ────────────────────────────────────────────────── */}
        <div className={styles.copy}>
          <SectionHeading
            id="island-title"
            tone="light"
            eyebrow="Узнать остров"
            title="Тропический остров"
            accent="целиком"
            lede="Город и ночной рынок посередине, длинный закатный пляж на западе, белый песок и порт на юге, реки и тишина на севере. Дальше — канатная дорога над морем к Хон Тхом и Сансет-таун с мостом Поцелуя."
          />

          <a className="btn btn-teal" href="#stays">
            Смотреть жильё по районам
            <Icon name="arrow-right" size={18} />
          </a>

          <ul className={styles.features}>
            {FEATURES.map((feature) => (
              <li key={feature.label}>
                <Icon name={feature.icon} size={26} />
                <span className={styles.featureLabel}>{feature.label}</span>
                <span className={styles.featureNote}>{feature.note}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* ── Карта ────────────────────────────────────────────────── */}
        <Reveal className={styles.mapWrap}>
          <div className={styles.tabs} role="group" aria-label="Что отмечено на карте">
            {MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={styles.tab}
                data-active={mode === item.id}
                aria-pressed={mode === item.id}
                onClick={() => setMode(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className={styles.photoMap}>
            <Image
              className={styles.photoMapImg}
              src="/images/island/phu-quoc-3d.webp"
              alt="Остров Фукуок с высоты: парки на севере, город на западном берегу, Сансет-таун и канатная дорога на юге"
              width={1400}
              height={933}
              sizes="(max-width: 980px) 92vw, 620px"
            />

            <ul className={styles.sights}>
              {points.map((point, index) => {
                const isActive = point.id === active?.id;
                return (
                  <li
                    key={point.id}
                    className={styles.sight}
                    style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%`, zIndex: isActive ? 5 : 2 }}
                  >
                    <button
                      type="button"
                      className={styles.sightBtn}
                      data-active={isActive}
                      data-side={point.x > 0.6 ? 'left' : 'right'}
                      onClick={() => pick(point.id)}
                      aria-pressed={isActive}
                    >
                      <span className={styles.sightDot}>{index + 1}</span>
                      <span className={styles.sightChip}>{point.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {active ? (
            <p className={styles.detail}>
              <span className={styles.detailName}>
                {active.name}
                {active.local ? (
                  <>
                    {' · '}
                    <span lang="vi">{active.local}</span>
                  </>
                ) : null}
              </span>
              <span className={styles.detailCoords}>{active.meta}</span>
              {active.description ? <span>{active.description}</span> : null}
            </p>
          ) : null}

          <ul className={styles.sightList}>
            {points.map((point, index) => (
              <li key={point.id}>
                <button
                  type="button"
                  className={styles.sightItem}
                  data-active={point.id === active?.id}
                  onClick={() => pick(point.id)}
                  aria-pressed={point.id === active?.id}
                >
                  <span className={styles.sightNum}>{index + 1}</span>
                  <Icon name={point.icon} size={18} />
                  <span className={styles.sightItemName}>{point.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
