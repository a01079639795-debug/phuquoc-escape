import styles from './hero.module.css';

/**
 * Сцена первого экрана: закат над Гулфом, канатная дорога к Хон Тхом,
 * пальмы в кадре.
 *
 * Рисунок, а не фотография — по двум причинам. Своего снимка Фукуока у нас
 * пока нет, а стоковый кадр сделал бы первый экран неотличимым от соседних
 * тревел-сайтов. И слои: параллакс, движение света на воде и качание листьев
 * требуют, чтобы части сцены двигались отдельно.
 *
 * Когда появится своя фотография, она подставляется в `Hero` вместо этого
 * компонента — вся механика движения остаётся на месте.
 */

const HORIZON = 470;

/** Точки вдоль черешка: по ним сажаются доли листа. */
function spine(length: number, droop: number, count: number) {
  const cx = length * 0.55;
  const cy = droop * 0.2;
  return Array.from({ length: count }, (_, i) => {
    const t = 0.08 + (i / (count - 1)) * 0.92;
    const inv = 1 - t;
    return {
      t,
      x: 2 * inv * t * cx + t * t * length,
      y: 2 * inv * t * cy + t * t * droop,
    };
  });
}

function Frond({ length, droop, flip = false }: { length: number; droop: number; flip?: boolean }) {
  const points = spine(length, droop, 20);
  return (
    <g transform={flip ? 'scale(-1 1)' : undefined}>
      <path
        d={`M0 0 Q ${length * 0.55} ${droop * 0.2}, ${length} ${droop}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={7}
        strokeLinecap="round"
      />
      {points.map((p, i) => {
        const taper = 1 - p.t * 0.6;
        const blade = 80 * taper;
        return (
          <g key={i}>
            <line
              x1={p.x}
              y1={p.y}
              x2={p.x - blade * 0.32}
              y2={p.y + blade}
              stroke="currentColor"
              strokeWidth={4.5 * taper + 1}
              strokeLinecap="round"
            />
            <line
              x1={p.x}
              y1={p.y}
              x2={p.x + blade * 0.14}
              y2={p.y - blade * 0.8}
              stroke="currentColor"
              strokeWidth={4 * taper + 1}
              strokeLinecap="round"
            />
          </g>
        );
      })}
    </g>
  );
}

/** Кабина канатной дороги. */
function Cabin({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} stroke="currentColor" fill="none">
      <path d="M0 0v9" strokeWidth="2" />
      <path d="M-7 9h14" strokeWidth="2.4" />
      <rect x="-9" y="9" width="18" height="15" rx="4" fill="currentColor" stroke="none" />
    </g>
  );
}

export function HeroScene() {
  // Опоры уходят вправо к острову: шаг сокращается, высота падает.
  const pylons = [0, 1, 2, 3].map((i) => {
    const p = i / 3;
    return { x: 150 + p * 700, height: 54 - p * 20 };
  });

  return (
    <svg
      className={styles.scene}
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="h-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4f9dc4" />
          <stop offset="34%" stopColor="#8dc3d8" />
          <stop offset="62%" stopColor="#e9c69a" />
          <stop offset="84%" stopColor="#f3b478" />
          <stop offset="100%" stopColor="#f7cfa0" />
        </linearGradient>

        <linearGradient id="h-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#cfa877" />
          <stop offset="7%" stopColor="#4aa8b4" />
          <stop offset="38%" stopColor="#2b93a8" />
          <stop offset="100%" stopColor="#12617a" />
        </linearGradient>

        <radialGradient id="h-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#fff0cf" stopOpacity="0.95" />
          <stop offset="42%" stopColor="#f6be74" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#f0a860" stopOpacity="0" />
        </radialGradient>

        <linearGradient id="h-glitter" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe6bd" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#ffe6bd" stopOpacity="0" />
        </linearGradient>

        <clipPath id="h-glitter-shape">
          <path d={`M1080 ${HORIZON} L1200 ${HORIZON} L1420 900 L840 900 Z`} />
        </clipPath>

        <clipPath id="h-sea-clip">
          <rect x="0" y={HORIZON} width="1600" height={900 - HORIZON} />
        </clipPath>

        <linearGradient id="h-scrim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0b3040" stopOpacity="0" />
          <stop offset="58%" stopColor="#0b3040" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#0b3040" stopOpacity="0.62" />
        </linearGradient>

        <linearGradient id="h-top-scrim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0b3040" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#0b3040" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* ── Небо ───────────────────────────────────────────────────────── */}
      <g className={styles.sky}>
        <rect x="0" y="0" width="1600" height={HORIZON + 2} fill="url(#h-sky)" />

        {/* Тёплые облачные полосы — свет идёт справа. */}
        <g fill="#ffd9a8" opacity="0.5">
          <ellipse cx="1180" cy="150" rx="290" ry="20" />
          <ellipse cx="980" cy="205" rx="220" ry="14" opacity="0.75" />
          <ellipse cx="1330" cy="255" rx="240" ry="16" opacity="0.6" />
          <ellipse cx="620" cy="180" rx="180" ry="12" opacity="0.45" />
        </g>
      </g>

      {/* ── Солнце ─────────────────────────────────────────────────────── */}
      <g className={styles.sun}>
        <circle className={styles.halo} cx="1150" cy="360" r="340" fill="url(#h-glow)" />
        <circle cx="1150" cy="360" r="52" fill="#fff2d6" />
      </g>

      {/* ── Дальние острова ────────────────────────────────────────────── */}
      <g className={styles.islands}>
        <path
          d={`M120 ${HORIZON} q 90 -30 170 -10 q 46 -14 92 10 z`}
          fill="#2c6d84"
          opacity="0.55"
        />
        <path
          d={`M1370 ${HORIZON} q 70 -26 140 -6 q 40 -10 90 6 z`}
          fill="#255f76"
          opacity="0.5"
        />
      </g>

      {/* ── Остров с опорой канатной дороги ────────────────────────────── */}
      <g className={styles.island}>
        <path
          d={`M840 ${HORIZON} q 60 -52 140 -60 q 70 -8 120 26 q 60 -14 110 34 z`}
          fill="#1f5d6e"
        />
        <path
          d={`M900 ${HORIZON} q 46 -34 104 -38 q 52 -4 88 20 z`}
          fill="#2b7183"
          opacity="0.8"
        />
        {/* Высокая мачта — узнаваемый силуэт трассы на Хон Тхом. */}
        <g stroke="#123c4b" fill="none" strokeLinecap="round">
          <path d={`M1042 ${HORIZON - 46} v -150`} strokeWidth="6" />
          <path d={`M1016 ${HORIZON - 196} h 52`} strokeWidth="5" />
          <path d={`M1024 ${HORIZON - 180} h 36`} strokeWidth="4" />
        </g>
      </g>

      {/* ── Канатная дорога ────────────────────────────────────────────── */}
      <g className={styles.cable} color="#134454">
        <g stroke="currentColor" fill="none" strokeLinecap="round">
          {pylons.map((pylon, i) => {
            const next = pylons[i + 1];
            const top = HORIZON - pylon.height;
            return (
              <g key={i}>
                <path d={`M${pylon.x} ${HORIZON + 3} v ${-pylon.height}`} strokeWidth={2.6 - i * 0.3} />
                <path
                  d={`M${pylon.x - pylon.height * 0.13} ${top + 4} h ${pylon.height * 0.26}`}
                  strokeWidth={2.2}
                />
                {next ? (
                  <path
                    d={`M${pylon.x} ${top + 4} Q ${(pylon.x + next.x) / 2} ${
                      top + 4 + (next.x - pylon.x) * 0.07
                    }, ${next.x} ${HORIZON - next.height + 4}`}
                    strokeWidth="1.4"
                  />
                ) : null}
              </g>
            );
          })}
          {/* Пролёт от последней опоры к мачте на острове. */}
          <path
            d={`M${pylons[3]!.x} ${HORIZON - pylons[3]!.height + 4} Q 950 ${HORIZON - 60}, 1042 ${
              HORIZON - 192
            }`}
            strokeWidth="1.4"
          />
        </g>

        <g className={styles.cabins}>
          <Cabin x={430} y={HORIZON - 46} scale={0.95} />
          <Cabin x={690} y={HORIZON - 40} scale={0.82} />
          <Cabin x={905} y={HORIZON - 78} scale={0.66} />
        </g>
      </g>

      {/* ── Море ───────────────────────────────────────────────────────── */}
      <g className={styles.sea}>
        <rect x="0" y={HORIZON} width="1600" height={900 - HORIZON} fill="url(#h-sea)" />

        <g clipPath="url(#h-sea-clip)">
          <g clipPath="url(#h-glitter-shape)" fill="url(#h-glitter)">
            <g className={styles.glimmer}>
              {Array.from({ length: 24 }, (_, i) => {
                const y = HORIZON + 6 + i * i * 0.62 + i * 3.2;
                const w = 44 + i * 14;
                return (
                  <rect
                    key={i}
                    x={1140 - w / 2 + Math.sin(i * 1.6) * i * 3.6}
                    y={y}
                    width={w}
                    height={2 + i * 0.18}
                    rx={1}
                  />
                );
              })}
            </g>
          </g>

          <g className={styles.glimmerSlow} fill="#d9f2f5" opacity="0.22">
            {Array.from({ length: 20 }, (_, i) => {
              const y = HORIZON + 16 + i * i * 0.8 + i * 4;
              const w = 100 + ((i * 149) % 300);
              return (
                <rect key={i} x={((i * 283) % 1500) - 60} y={y} width={w} height={1.6 + i * 0.1} rx={1} />
              );
            })}
          </g>

          {/* Кромка прибоя у берега. */}
          <path
            d="M0 812 q 220 -34 430 -6 q 250 34 470 2 q 240 -34 480 4 q 130 20 220 8 V900 H0 Z"
            fill="#8fd3d8"
            opacity="0.5"
          />
          <path
            d="M0 846 q 240 -28 460 -2 q 250 28 470 0 q 230 -26 470 6 V900 H0 Z"
            fill="#cfeef0"
            opacity="0.55"
          />
        </g>

        <rect x="0" y={HORIZON} width="1600" height="1.6" fill="#ffe0b4" opacity="0.6" />
      </g>

      {/* ── Песок и камни ──────────────────────────────────────────────── */}
      <g className={styles.shore}>
        <path d="M0 872 q 260 -22 520 2 q 280 26 560 -4 q 260 -26 520 6 V900 H0 Z" fill="#f0dcb8" />
        <g fill="#123c4b" opacity="0.82">
          <path d="M1338 884 q 44 -46 96 -30 q 40 12 52 40 z" />
          <path d="M1454 890 q 34 -30 74 -18 q 30 10 40 26 z" opacity="0.8" />
          <path d="M96 890 q 40 -34 88 -20 q 32 10 42 28 z" opacity="0.7" />
        </g>
      </g>

      {/* Затемнение сверху и снизу — под белым текстом нужен контраст. */}
      <rect x="0" y="0" width="1600" height="300" fill="url(#h-top-scrim)" />
      <rect x="0" y="380" width="1600" height="520" fill="url(#h-scrim)" />

      {/* ── Листья в кадре ─────────────────────────────────────────────── */}
      <g className={styles.fronds} color="#0d2f2c">
        <g className={styles.frondLeft} transform="translate(-30 -40)">
          <Frond length={520} droop={330} />
          <g transform="translate(10 40)">
            <Frond length={430} droop={430} />
          </g>
          <g transform="translate(-10 -10)">
            <Frond length={470} droop={210} />
          </g>
        </g>
        <g className={styles.frondRight} transform="translate(1650 -60)">
          <Frond length={420} droop={300} flip />
          <g transform="translate(-20 46)">
            <Frond length={350} droop={390} flip />
          </g>
        </g>
      </g>
    </svg>
  );
}
