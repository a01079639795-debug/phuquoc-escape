/**
 * Разбор фотографии первого экрана на слои для «ожившего кадра».
 *
 * Скрипт читает public/images/hero/beach.jpg и готовит из неё три вещи:
 *
 *   1) plate.jpg   — тот же кадр, но с убранными кабинками канатки. Трос
 *                    остаётся на месте: на месте кабинки он восстанавливается
 *                    переносом чистого участка того же троса.
 *   2) cabin.png   — вырезанная кабинка с настоящей альфой. Это не рисунок:
 *                    пиксели те же, что были на фотографии, поэтому свет,
 *                    цвет и мягкость объектива совпадают с кадром.
 *   3) water-mask  — карта воды в градациях серого для шейдера ряби.
 *
 * И четвёртое — геометрия: линия троса прослеживается по самой фотографии,
 * а не задаётся на глаз. Результат уезжает в src/components/hero/scene.generated.ts.
 *
 * Запуск:  node scripts/hero-scene.mjs
 *
 * Скрипт привязан к конкретному снимку: опорные точки ниже — координаты
 * кабинок и троса на нём. Если фотографию заменят, сцена не подхватится
 * (хеш исходника не совпадёт) и первый экран покажет обычный статичный кадр,
 * пока скрипт не прогонят заново по новым опорам.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import sharp from 'sharp';

const ROOT = process.cwd();
const SOURCE = 'images/hero/beach.jpg';
const OUT_DIR = join(ROOT, 'public/images/hero/gen');
const MODULE_PATH = join(ROOT, 'src/components/hero/scene.generated.ts');

/** Опоры, снятые с этого снимка. */
const ANCHORS = {
  /** Точка на тросе, с которой начинается прослеживание. */
  cableSeed: { x: 1157, y: 372.5, slope: -0.15 },
  /** Прослеживание идёт до этих границ; левее трос уходит в засветку. */
  cableFrom: 600,
  cableTo: 1448,
  /** Кабинки на фотографии: рамка вместе с подвесом и захватом. */
  cabins: [
    // gripSpan — ширина захвата на тросе: внутри неё трос закрыт кабинкой,
    // снаружи его нужно вычесть из спрайта, иначе кабинка повезёт с собой
    // кусок линии.
    { x: 1131, y: 365, w: 52, h: 76, grip: { x: 1157, y: 373 }, gripSpan: [1145, 1168], body: 40 },
    { x: 1334, y: 337, w: 38, h: 52, grip: { x: 1355, y: 345 }, gripSpan: [1347, 1364], body: 26 },
  ],
  /** Чистые участки троса, по которым снимается его поперечный профиль. */
  cableSamples: [
    [960, 1120],
    [1200, 1320],
  ],
};

// ── Чтение ────────────────────────────────────────────────────────────────

const file = await readFile(join(ROOT, 'public', SOURCE));
const hash = createHash('sha256').update(file).digest('hex').slice(0, 16);
const { data: raw, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const C = info.channels;

const idx = (x, y) => (y * W + x) * C;
const clampX = (x) => Math.max(0, Math.min(W - 1, x));
const clampY = (y) => Math.max(0, Math.min(H - 1, y));

/** Билинейная выборка яркости — трос тоньше пикселя, целочисленной не хватает. */
function lumIn(buf, x, y) {
  const x0 = Math.floor(clampX(x));
  const y0 = Math.floor(clampY(y));
  const x1 = Math.min(W - 1, x0 + 1);
  const y1 = Math.min(H - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const l = (xx, yy) => {
    const p = idx(xx, yy);
    return 0.299 * buf[p] + 0.587 * buf[p + 1] + 0.114 * buf[p + 2];
  };
  const a = l(x0, y0) * (1 - fx) + l(x1, y0) * fx;
  const b = l(x0, y1) * (1 - fx) + l(x1, y1) * fx;
  return a + (b - a) * fy;
}

const lumAt = (x, y) => lumIn(raw, x, y);

// ── 1. Линия троса ────────────────────────────────────────────────────────

/**
 * Отклик на тонкую тёмную линию под наклоном s: усредняем вдоль линии и
 * сравниваем с фоном по обе стороны от неё. Облака дают широкие перепады и
 * такой фильтр их почти не замечает.
 */
function lineResponse(x, y, s) {
  const norm = Math.hypot(1, s);
  const nx = -s / norm;
  const ny = 1 / norm;
  let core = 0;
  let side = 0;
  let n = 0;
  for (let t = -7; t <= 7; t += 1) {
    const px = x + t;
    const py = y + s * t;
    core += lumAt(px, py);
    side += (lumAt(px + nx * 2.5, py + ny * 2.5) + lumAt(px - nx * 2.5, py - ny * 2.5)) / 2;
    n++;
  }
  return (side - core) / n;
}

/** Прослеживание троса от опорной точки: шаг за шагом, с плавным наклоном. */
function traceCable(from, to) {
  const seed = ANCHORS.cableSeed;
  const walk = (dir, limit) => {
    const out = [];
    let y = seed.y;
    let s = seed.slope;
    for (let x = seed.x + dir; dir > 0 ? x <= limit : x >= limit; x += dir) {
      let best = null;
      for (let dy = -1.2; dy <= 1.2; dy += 0.1) {
        for (let ds = -0.02; ds <= 0.02; ds += 0.01) {
          const yy = y + s * dir + dy;
          const v = lineResponse(x, yy, s + ds);
          if (!best || v > best.v) best = { v, y: yy, s: s + ds };
        }
      }
      if (!best || best.v < 2) {
        // Слабый участок — идём по инерции, наклон не меняем.
        y += s * dir;
        out.push({ x, y, weak: true });
        continue;
      }
      s = Math.max(-0.9, Math.min(0.05, s * 0.7 + best.s * 0.3));
      y = best.y;
      out.push({ x, y, weak: false });
    }
    return out;
  };
  const left = walk(-1, from).reverse();
  const right = walk(+1, to);
  return [...left, { x: seed.x, y: seed.y, weak: false }, ...right];
}

const traced = traceCable(ANCHORS.cableFrom, ANCHORS.cableTo);

/**
 * Сглаживание: настоящий трос — цепная линия, поэтому по прослеженным точкам
 * строится многочлен четвёртой степени. Он убирает и дрожание пикселей, и
 * участки, где прослеживание сбилось на кабинку.
 *
 * Точки внутри кабинок в аппроксимацию не идут: там троса на кадре не видно.
 */
function fitPolynomial(points, degree, x0, scale) {
  const n = degree + 1;
  const A = Array.from({ length: n }, () => new Float64Array(n + 1));
  for (const p of points) {
    const t = (p.x - x0) / scale;
    const pow = [1];
    for (let k = 1; k < 2 * n; k++) pow[k] = pow[k - 1] * t;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) A[i][j] += pow[i + j];
      A[i][n] += pow[i] * p.y;
    }
  }
  for (let i = 0; i < n; i++) {
    let piv = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
    [A[i], A[piv]] = [A[piv], A[i]];
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = A[r][i] / A[i][i];
      for (let c = i; c <= n; c++) A[r][c] -= f * A[i][c];
    }
  }
  const coef = Array.from({ length: n }, (_, i) => A[i][n] / A[i][i]);
  return (x) => {
    const t = (x - x0) / scale;
    let sum = 0;
    let pow = 1;
    for (let i = 0; i < n; i++) {
      sum += coef[i] * pow;
      pow *= t;
    }
    return sum;
  };
}

const hiddenByCabin = (x) =>
  ANCHORS.cabins.some((c) => x >= c.x - 4 && x <= c.x + c.w + 4);

const fitPoints = traced.filter((p) => !p.weak && !hiddenByCabin(p.x));
const cableY = fitPolynomial(fitPoints, 4, ANCHORS.cableSeed.x, 400);

const residuals = fitPoints.map((p) => Math.abs(p.y - cableY(p.x))).sort((a, b) => a - b);
const cableFit = {
  points: fitPoints.length,
  weak: traced.filter((p) => p.weak).length,
  median: residuals[residuals.length >> 1],
  worst: residuals[residuals.length - 1],
};

const cable = [];
for (let x = ANCHORS.cableFrom; x <= ANCHORS.cableTo; x++) cable.push({ x, y: cableY(x) });

// ── 2. Оценка фона под кабинкой ───────────────────────────────────────────

/**
 * Небо под кабинкой: для каждой строки берём медиану слева и справа от рамки
 * и растягиваем между ними. Пиксели ближе 5 px к тросу в выборку не идут —
 * иначе трос размажется поперёк кадра.
 *
 * Строки, где трос перекрывает всю боковую выборку, заполняются по вертикали
 * от чистых соседей: небо по вертикали такое же гладкое, как по горизонтали.
 */
function estimateBackground(rect, margin = 10) {
  const { x, y, w, h } = rect;
  const bg = new Float32Array(w * h * 3);
  const rows = [];

  for (let row = 0; row < h; row++) {
    const yy = y + row;
    const side = (from, to) => {
      const acc = [[], [], []];
      for (let sx = from; sx <= to; sx++) {
        const cx = clampX(sx);
        if (Math.abs(yy - cableY(cx)) < 5) continue;
        const p = idx(cx, clampY(yy));
        acc[0].push(raw[p]);
        acc[1].push(raw[p + 1]);
        acc[2].push(raw[p + 2]);
      }
      if (acc[0].length < 3) return null;
      return acc.map((list) => {
        list.sort((a, b) => a - b);
        return list[list.length >> 1];
      });
    };
    rows.push({ left: side(x - margin, x - 2), right: side(x + w + 1, x + w + margin - 1) });
  }

  // Пропуски (строки на уровне троса) — интерполяция по вертикали.
  for (const key of ['left', 'right']) {
    for (let row = 0; row < h; row++) {
      if (rows[row][key]) continue;
      let up = row - 1;
      while (up >= 0 && !rows[up][key]) up--;
      let down = row + 1;
      while (down < h && !rows[down][key]) down++;
      const a = up >= 0 ? rows[up][key] : null;
      const b = down < h ? rows[down][key] : null;
      if (a && b) {
        const t = (row - up) / (down - up);
        rows[row][key] = a.map((v, i) => v + (b[i] - v) * t);
      } else {
        rows[row][key] = a ?? b ?? [200, 200, 200];
      }
    }
  }

  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const t = (col + 0.5) / w;
      for (let ch = 0; ch < 3; ch++) {
        bg[(row * w + col) * 3 + ch] = rows[row].left[ch] + (rows[row].right[ch] - rows[row].left[ch]) * t;
      }
    }
  }
  return bg;
}

// ── 3. Вырезание кабинки ──────────────────────────────────────────────────

/**
 * Матирование по известному фону: альфа — насколько пиксель отличается от
 * неба, цвет — снятие подмеса неба с полупрозрачных краёв. На выходе край
 * мягкий и без светлого ореола, которым выдают себя вырезки «по контуру».
 */
function cutout(rect, bg) {
  const { x, y, w, h } = rect;
  const smooth = (t) => t * t * (3 - 2 * t);
  const alpha = new Float32Array(w * h);

  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const p = idx(clampX(x + col), clampY(y + row));
      const b = (row * w + col) * 3;
      const dist = Math.hypot(raw[p] - bg[b], raw[p + 1] - bg[b + 1], raw[p + 2] - bg[b + 2]);
      // Ниже 11 — шум неба после JPEG, выше 34 — точно кабинка.
      alpha[row * w + col] = smooth(Math.max(0, Math.min(1, (dist - 11) / 23)));
    }
  }

  // Трос за пределами захвата в спрайт не идёт: кабинка едет по нему, а не
  // возит его с собой.
  const [gripFrom, gripTo] = rect.gripSpan;
  for (let col = 0; col < w; col++) {
    const px = x + col;
    if (px >= gripFrom && px <= gripTo) continue;
    const edge = Math.min(Math.abs(px - gripFrom), Math.abs(px - gripTo));
    const keep = Math.max(0, Math.min(1, (4 - edge) / 4)); // мягкий стык у захвата
    const cy = cableY(px);
    for (let row = 0; row < h; row++) {
      const off = Math.abs(y + row - cy);
      if (off > 4) continue;
      const cut = smooth(Math.max(0, Math.min(1, (4 - off) / 2.5)));
      alpha[row * w + col] *= 1 - cut * (1 - keep);
    }
  }

  // Одиночные пиксели-искры: размываем альфу и подрезаем порогом.
  const blurred = new Float32Array(w * h);
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const rr = row + dy;
          const cc = col + dx;
          if (rr < 0 || cc < 0 || rr >= h || cc >= w) continue;
          const weight = dx === 0 && dy === 0 ? 4 : 1;
          sum += alpha[rr * w + cc] * weight;
          n += weight;
        }
      }
      blurred[row * w + col] = sum / n;
    }
  }

  const out = Buffer.alloc(w * h * 4);
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const i = row * w + col;
      const a = smooth(Math.max(0, Math.min(1, (blurred[i] - 0.12) / 0.5)));
      const o = i * 4;
      if (a <= 0.004) continue;
      const p = idx(clampX(x + col), clampY(y + row));
      const b = i * 3;
      // Снятие подмеса неба: у полупрозрачных краёв делитель ограничен, иначе
      // шум разгоняется в цветные искры.
      const un = (ch) =>
        Math.max(0, Math.min(255, Math.round(bg[b + ch] + (raw[p + ch] - bg[b + ch]) / Math.max(a, 0.45))));
      out[o] = un(0);
      out[o + 1] = un(1);
      out[o + 2] = un(2);
      out[o + 3] = Math.round(a * 255);
    }
  }
  return out;
}

// ── 4. Стирание кабинок с кадра ───────────────────────────────────────────

const plate = Buffer.from(raw);

/** Кладём фон вместо кабинки. */
function eraseCabin(rect, bg) {
  const { x, y, w, h } = rect;
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const p = idx(clampX(x + col), clampY(y + row));
      const b = (row * w + col) * 3;
      plate[p] = Math.round(bg[b]);
      plate[p + 1] = Math.round(bg[b + 1]);
      plate[p + 2] = Math.round(bg[b + 2]);
    }
  }
}

/**
 * Поперечный профиль троса: насколько он темнее неба на каждом отступе от
 * своей оси. Снимается по сотням чистых колонок и берётся медиана — так в
 * профиль не попадают ни облака, ни соседние тросы, ни сами кабинки.
 */
function cableProfile() {
  const offsets = [];
  for (let off = -4; off <= 4; off += 0.5) offsets.push(off);
  const samples = offsets.map(() => [[], [], []]);

  for (const [from, to] of ANCHORS.cableSamples) {
    for (let x = from; x <= to; x++) {
      // Точный центр линии в этой колонке: парабола по трём отсчётам яркости.
      // Без этого профиль размазывается на доли пикселя и трос выходит бледнее.
      const base = cableY(x);
      let cy = base;
      let bestLum = Infinity;
      for (let d = -1.5; d <= 1.5; d += 0.25) {
        const l = lumAt(x, base + d);
        if (l < bestLum) {
          bestLum = l;
          cy = base + d;
        }
      }
      const lm = lumAt(x, cy - 0.25);
      const l0 = lumAt(x, cy);
      const lp = lumAt(x, cy + 0.25);
      const denom = lm - 2 * l0 + lp;
      if (Math.abs(denom) > 1e-6) cy += (0.25 * (lm - lp)) / (2 * denom);
      // Небо этой колонки — медиана строк, заведомо свободных от линии.
      const sky = [0, 1, 2].map((ch) => {
        const list = [];
        for (const off of [-16, -14, -12, 12, 14, 16]) {
          list.push(raw[idx(clampX(x), clampY(Math.round(cy + off))) + ch]);
        }
        list.sort((a, b) => a - b);
        return (list[2] + list[3]) / 2;
      });
      offsets.forEach((off, i) => {
        const y = cy + off;
        const y0 = Math.floor(y);
        const fy = y - y0;
        for (let ch = 0; ch < 3; ch++) {
          const a = raw[idx(clampX(x), clampY(y0)) + ch];
          const b = raw[idx(clampX(x), clampY(y0 + 1)) + ch];
          samples[i][ch].push(a + (b - a) * fy - sky[ch]);
        }
      });
    }
  }

  return samples.map((chans, i) => ({
    off: offsets[i],
    delta: chans.map((list) => {
      list.sort((a, b) => a - b);
      return list[list.length >> 1];
    }),
  }));
}

/**
 * Возврат троса на стёртый участок: по его оси заново рисуется тот самый
 * профиль. Небо уже восстановлено, поэтому профиль просто добавляется —
 * толщина и плотность линии выходят те же, что на соседних метрах троса.
 */
function restoreCable(profile, fromX, toX) {
  for (let x = fromX; x <= toX; x++) {
    const cy = cableY(x);
    for (const { off, delta } of profile) {
      const y = cy + off;
      const y0 = Math.floor(y);
      const fy = y - y0;
      // Профиль снят с шагом 0.5 px — раскладываем его по двум строкам.
      for (const [row, w] of [[y0, (1 - fy) * 0.5], [y0 + 1, fy * 0.5]]) {
        if (w <= 0) continue;
        const p = idx(clampX(x), clampY(row));
        for (let ch = 0; ch < 3; ch++) {
          plate[p + ch] = Math.max(0, Math.min(255, Math.round(plate[p + ch] + delta[ch] * w)));
        }
      }
    }
  }
}

// Профиль троса снимается до стирания: он берётся с чистых участков кадра.
const profile = cableProfile();

const sprites = [];
for (const rect of ANCHORS.cabins) {
  const bg = estimateBackground(rect);
  sprites.push({ rect, rgba: cutout(rect, bg) });
  eraseCabin(rect, bg);
}
for (const rect of ANCHORS.cabins) {
  restoreCable(profile, rect.x - 2, rect.x + rect.w + 2);
}

/**
 * Проверка стыка: насколько восстановленный трос темнее неба по сравнению с
 * настоящим по соседству. Совпадение по числам надёжнее, чем «на глаз».
 */
function cableDip(buf, from, to) {
  let sum = 0;
  let n = 0;
  for (let x = from; x <= to; x++) {
    const cy = cableY(x);
    let darkest = Infinity;
    for (let d = -1.2; d <= 1.2; d += 0.2) darkest = Math.min(darkest, lumIn(buf, x, cy + d));
    sum += (lumIn(buf, x, cy - 7) + lumIn(buf, x, cy + 7)) / 2 - darkest;
    n++;
  }
  return sum / n;
}

const dipCheck = ANCHORS.cabins.map((rect) => ({
  restored: cableDip(plate, rect.x, rect.x + rect.w),
  neighbours:
    (cableDip(plate, rect.x - 60, rect.x - 10) + cableDip(plate, rect.x + rect.w + 10, rect.x + rect.w + 60)) / 2,
}));

// ── 5. Карта воды ─────────────────────────────────────────────────────────

/**
 * Вода отличается от всего остального в кадре одним признаком: синего в ней
 * больше, чем красного. Песок, засветка, скалы и пена этот тест не проходят,
 * поэтому маска получается без ручного обведения берега.
 */
const MASK_DIV = 4;
/** Горизонт на кадре: ниже него начинается вода. */
const HORIZON = 548;
const mw = Math.floor(W / MASK_DIV);
const mh = Math.floor(H / MASK_DIV);
const mask = Buffer.alloc(mw * mh);
/** Рамка воды: холст ряби покрывает только её, а не весь кадр. */
const waterBox = { x0: mw, x1: 0, y0: mh, y1: 0 };
for (let my = 0; my < mh; my++) {
  for (let mx = 0; mx < mw; mx++) {
    let sum = 0;
    let n = 0;
    for (let dy = 0; dy < MASK_DIV; dy++) {
      for (let dx = 0; dx < MASK_DIV; dx++) {
        const p = idx(clampX(mx * MASK_DIV + dx), clampY(my * MASK_DIV + dy));
        const r = raw[p];
        const g = raw[p + 1];
        const b = raw[p + 2];
        const cool = (b - r) / 26; // холодный тон = вода
        const lit = Math.min(1, (b - 38) / 40); // не тень скалы
        // Небо тоже холодное, поэтому всё выше горизонта отсекается.
        const below = Math.max(0, Math.min(1, (my * MASK_DIV + dy - HORIZON) / 20));
        sum += Math.max(0, Math.min(1, cool)) * Math.max(0, lit) * below;
        n++;
      }
    }
    mask[my * mw + mx] = Math.round((sum / n) * 255);
    if (mask[my * mw + mx] > 40) {
      waterBox.x0 = Math.min(waterBox.x0, mx);
      waterBox.x1 = Math.max(waterBox.x1, mx);
      waterBox.y0 = Math.min(waterBox.y0, my);
      waterBox.y1 = Math.max(waterBox.y1, my);
    }
  }
}

// ── 6. Запись ─────────────────────────────────────────────────────────────

await mkdir(OUT_DIR, { recursive: true });

await sharp(plate, { raw: { width: W, height: H, channels: C } })
  .jpeg({ quality: 92, chromaSubsampling: '4:4:4', mozjpeg: true })
  .toFile(join(OUT_DIR, 'plate.jpg'));

const SPRITE_SCALE = 3;
const main = sprites[0];
await sharp(main.rgba, { raw: { width: main.rect.w, height: main.rect.h, channels: 4 } })
  .resize({ width: main.rect.w * SPRITE_SCALE, kernel: 'lanczos3' })
  .png({ compressionLevel: 9 })
  .toFile(join(OUT_DIR, 'cabin.png'));

await sharp(mask, { raw: { width: mw, height: mh, channels: 1 } })
  .blur(2.5)
  .png({ colors: 64, compressionLevel: 9 })
  .toFile(join(OUT_DIR, 'water-mask.png'));

// Линия троса — в долях кадра, с прореживанием: 1 точка на 8 px хватает,
// между ними кривая всё равно гладкая.
const path = cable
  .filter((_, i) => i % 8 === 0 || i === cable.length - 1)
  .map((p) => [Number((p.x / W).toFixed(5)), Number((p.y / H).toFixed(5))]);

const cabinRect = ANCHORS.cabins[0];
const module = `/**
 * СГЕНЕРИРОВАНО scripts/hero-scene.mjs — руками не править.
 *
 * Геометрия снята с самой фотографии: линия троса прослежена по пикселям,
 * размеры кабинок измерены на кадре. Все координаты — доли кадра (0…1),
 * поэтому не зависят ни от размера экрана, ни от кадрирования.
 */

export const heroScene = {
  /** Отпечаток исходного снимка: не совпал — сцена не показывается. */
  sourceHash: '${hash}',
  source: '/${SOURCE}',
  width: ${W},
  height: ${H},

  /** Кадр без кабинок; трос на месте. */
  plate: '/images/hero/gen/plate.jpg',

  cabin: {
    src: '/images/hero/gen/cabin.png',
    /** Размер спрайта в пикселях исходного кадра. */
    width: ${cabinRect.w},
    height: ${cabinRect.h},
    /** Точка подвеса (захват на тросе) в долях спрайта. */
    grip: [${((cabinRect.grip.x - cabinRect.x) / cabinRect.w).toFixed(4)}, ${((cabinRect.grip.y - cabinRect.y) / cabinRect.h).toFixed(4)}],
    /** Ширина корпуса на кадре у ближней и дальней кабинок. */
    near: { x: ${ANCHORS.cabins[0].grip.x / W}, body: ${ANCHORS.cabins[0].body / W} },
    far: { x: ${ANCHORS.cabins[1].grip.x / W}, body: ${ANCHORS.cabins[1].body / W} },
  },

  /** Трос: доли кадра, слева направо. */
  cable: ${JSON.stringify(path)},

  water: {
    mask: '/images/hero/gen/water-mask.png',
    /** Рамка воды в долях кадра: холст ряби покрывает только её. */
    rect: [${(waterBox.x0 / mw).toFixed(4)}, ${(waterBox.y0 / mh).toFixed(4)}, ${((waterBox.x1 + 1) / mw).toFixed(4)}, ${((waterBox.y1 + 1) / mh).toFixed(4)}],
    /** Горизонт в долях высоты: у него волна почти не видна. */
    horizon: ${(HORIZON / H).toFixed(4)},
  },
} as const;

export type HeroScene = typeof heroScene;
`;
await writeFile(MODULE_PATH, module, 'utf8');

console.log(`Кадр: ${W}×${H}, хеш ${hash}`);
console.log(`Трос: ${cableFit.points} точек в аппроксимации, слабых ${cableFit.weak}, невязка медиана ${cableFit.median.toFixed(2)} px, худшая ${cableFit.worst.toFixed(2)} px`);
console.log(`Кабинка: ${cabinRect.w}×${cabinRect.h} → ${cabinRect.w * SPRITE_SCALE}px в спрайте`);
console.log(`Маска воды: ${mw}×${mh}`);
console.log('Готово: public/images/hero/gen/{plate.jpg,cabin.png,water-mask.png}');
dipCheck.forEach((d, i) => {
  console.log(`Стык ${i + 1}: трос восстановлен на ${d.restored.toFixed(1)} против ${d.neighbours.toFixed(1)} у соседей`);
});
