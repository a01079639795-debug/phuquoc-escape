/**
 * Подготовка объёмной карты острова для блока «Что посмотреть».
 *
 * Исходник — вид Фукуока с высоты, на котором подписи достопримечательностей
 * впечатаны в саму картинку: латиница, чужая типографика, и главное —
 * нажимать на них нельзя. Скрипт их убирает.
 *
 * Как убирает: на месте каждой подписи ищется похожий кусок той же картинки
 * (сравнение идёт по рамке вокруг пятна) и переносится с мягким краем. Для
 * листвы, воды и песка этого достаточно: рисунок продолжается, шва не видно.
 * Дальше на чистую карту сайт кладёт свои маркеры — по-русски и с описаниями.
 *
 * Запуск:  node scripts/island-map.mjs
 *
 * Скрипт привязан к конкретной картинке: координаты ниже сняты с неё.
 */

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import sharp from 'sharp';

const SOURCE = 'assets/island-source.png';
const OUT_DIR = join(process.cwd(), 'public/images/island');

/**
 * Что стирать: булавка (тонкая, с иглой и тенью) и плашка подписи рядом.
 * Координаты — пиксели исходника 1536×1024.
 */
const ERASE = [
  { pin: [327, 171, 32, 52], plate: [352, 170, 123, 54] }, // VinWonders Phu Quoc
  { pin: [855, 206, 32, 50], plate: [880, 206, 126, 38] }, // Bai Dai Beach
  { pin: [603, 233, 32, 51], plate: [627, 232, 120, 41] }, // Grand World
  { pin: [1125, 350, 32, 52], plate: [1150, 345, 106, 60] }, // Hon Thom Cable Car
  { pin: [314, 429, 32, 52], plate: [341, 424, 124, 58] }, // Duong Dong Town
  { pin: [307, 621, 33, 51], plate: [332, 622, 111, 39] }, // Sao Beach
  { pin: [601, 624, 33, 52], plate: [626, 619, 111, 60] }, // Ho Quoc Pagoda
  { pin: [948, 653, 33, 52], plate: [973, 652, 131, 43] }, // Sunset Town
];

const { data, info } = await sharp(SOURCE).raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const C = info.channels;
const out = Buffer.from(data);

const clampX = (x) => Math.max(0, Math.min(W - 1, x));
const clampY = (y) => Math.max(0, Math.min(H - 1, y));
const px = (buf, x, y, ch) => buf[(clampY(y) * W + clampX(x)) * C + ch];

/** Все стираемые прямоугольники: донор не должен попадать ни в один из них. */
const holes = ERASE.flatMap((item) => [item.pin, item.plate]);
const inHole = (x, y, pad = 6) =>
  holes.some(([hx, hy, hw, hh]) => x >= hx - pad && x < hx + hw + pad && y >= hy - pad && y < hy + hh + pad);

/**
 * Поиск донора: сдвиг, при котором рамка вокруг пятна совпадает с рамкой
 * вокруг кандидата. Совпала рамка — совпадёт и то, что внутри: небо к небу,
 * листва к листве.
 */
function findDonor([rx, ry, rw, rh]) {
  const ring = [];
  const step = Math.max(2, Math.round(Math.min(rw, rh) / 12));
  for (let x = rx - 6; x < rx + rw + 6; x += step) {
    ring.push([x, ry - 8], [x, ry + rh + 7]);
  }
  for (let y = ry - 6; y < ry + rh + 6; y += step) {
    ring.push([rx - 8, y], [rx + rw + 7, y]);
  }
  const clean = ring.filter(([x, y]) => !inHole(x, y, 2));

  let best = null;
  for (let dy = -170; dy <= 170; dy += 5) {
    for (let dx = -230; dx <= 230; dx += 5) {
      if (Math.abs(dx) < rw * 0.9 && Math.abs(dy) < rh * 0.9) continue;
      // Донор целиком в кадре и не задевает другие стираемые места.
      if (rx + dx < 4 || ry + dy < 4 || rx + dx + rw > W - 4 || ry + dy + rh > H - 4) continue;
      let overlaps = false;
      for (let y = ry + dy; y < ry + dy + rh && !overlaps; y += 6) {
        for (let x = rx + dx; x < rx + dx + rw; x += 6) if (inHole(x, y)) { overlaps = true; break; }
      }
      if (overlaps) continue;

      let cost = 0;
      for (const [x, y] of clean) {
        for (let ch = 0; ch < 3; ch++) {
          const diff = px(data, x, y, ch) - px(data, x + dx, y + dy, ch);
          cost += diff * diff;
        }
      }
      cost /= Math.max(1, clean.length);
      if (!best || cost < best.cost) best = { dx, dy, cost };
    }
  }
  return best;
}

/** Перенос куска с мягким краем: жёсткая граница выдала бы заплату. */
function patch([rx, ry, rw, rh], donor, feather = 7) {
  for (let y = ry - feather; y < ry + rh + feather; y++) {
    for (let x = rx - feather; x < rx + rw + feather; x++) {
      const insideX = Math.min(x - (rx - feather), rx + rw + feather - 1 - x) / feather;
      const insideY = Math.min(y - (ry - feather), ry + rh + feather - 1 - y) / feather;
      const t = Math.max(0, Math.min(1, Math.min(insideX, insideY)));
      const weight = t * t * (3 - 2 * t);
      if (weight <= 0) continue;
      const o = (clampY(y) * W + clampX(x)) * C;
      for (let ch = 0; ch < 3; ch++) {
        const donorValue = px(data, x + donor.dx, y + donor.dy, ch);
        out[o + ch] = Math.round(out[o + ch] * (1 - weight) + donorValue * weight);
      }
    }
  }
}

for (const { pin, plate } of ERASE) {
  for (const rect of [plate, pin]) {
    const donor = findDonor(rect);
    if (!donor) {
      console.warn(`донор не найден для ${rect.join(',')}`);
      continue;
    }
    patch(rect, donor);
    console.log(`стёрто ${String(rect[2]).padStart(3)}×${String(rect[3]).padStart(2)} на ${rect[0]},${rect[1]} — донор со сдвигом ${donor.dx},${donor.dy} (невязка ${Math.sqrt(donor.cost).toFixed(1)})`);
  }
}

await mkdir(OUT_DIR, { recursive: true });
await sharp(out, { raw: { width: W, height: H, channels: C } })
  .resize({ width: 1400 })
  .webp({ quality: 86, effort: 5 })
  .toFile(join(OUT_DIR, 'phu-quoc-3d.webp'));

console.log('готово: public/images/island/phu-quoc-3d.webp');
