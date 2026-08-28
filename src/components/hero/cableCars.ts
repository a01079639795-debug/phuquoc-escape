import type { HeroScene } from './scene.generated';

/**
 * Движение кабинок по тросу.
 *
 * Три вещи делают его похожим на настоящее, и все три — про перспективу.
 *
 * Путь — не прямая через экран, а сама линия троса, прослеженная по
 * фотографии: кабинка идёт по провису и вместе с ним меняет наклон.
 *
 * Размер падает по мере удаления. Опорных точек две — обе кабинки с исходного
 * снимка: между ними размер меняется ровно так, как снял объектив. Влево, к
 * зрителю, тот же закон продолжается ослабленным: буквальная экстраполяция
 * раздула бы ближнюю кабинку вдвое против кадра.
 *
 * Скорость постоянна не на экране, а на тросе. Поэтому вдали кабинка ползёт,
 * вблизи идёт заметно быстрее — как и должно быть, и никакой равномерной
 * «поездки слайда» не получается.
 */

/** Насколько слабее закон перспективы работает ближе опорной пары. */
const NEAR_DAMPING = 0.32;

/** Появление из засветки и растворение в дымке у дальней опоры. */
const FADE_IN = 0.05;
const FADE_OUT = 0.03;

/** Дальняя кабинка теряет контраст: между ней и зрителем километры воздуха. */
const HAZE = 0.16;

export type CabinPose = {
  /** Точка подвеса в долях кадра. */
  x: number;
  y: number;
  /** Размер относительно кабинки с исходного снимка. */
  scale: number;
  opacity: number;
};

export type Track = {
  /** Поза по доле пути: 0 — у засветки слева, 1 — у опоры справа. */
  at(progress: number): CabinPose;
  /** Доля пути, на которой кабинка стоит в точке x (доли кадра). */
  progressAt(x: number): number;
};

export function buildTrack(scene: HeroScene): Track {
  const points = scene.cable;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const step = (last[0] - first[0]) / (points.length - 1);

  /** Высота троса в точке x. */
  const cableY = (x: number) => {
    const t = (x - first[0]) / step;
    const i = Math.max(0, Math.min(points.length - 2, Math.floor(t)));
    const a = points[i]!;
    const b = points[i + 1]!;
    return a[1] + (b[1] - a[1]) * Math.max(0, Math.min(1, t - i));
  };

  const near = scene.cabin.near;
  const far = scene.cabin.far;
  const decay = Math.log(near.body / far.body) / (far.x - near.x);

  /** Ширина корпуса в долях кадра. */
  const bodyAt = (x: number) => {
    const shift = x - near.x;
    return near.body * Math.exp(-decay * (shift >= 0 ? shift : shift * NEAR_DAMPING));
  };

  // Время хода: постоянная скорость по тросу — это dx, поделённый на масштаб.
  // Таблица переводит долю времени в координату и обратно.
  const STEPS = 256;
  const xs = new Float64Array(STEPS + 1);
  const ts = new Float64Array(STEPS + 1);
  const span = last[0] - first[0];
  let clock = 0;
  for (let i = 0; i <= STEPS; i++) {
    const x = first[0] + (span * i) / STEPS;
    if (i > 0) clock += span / STEPS / bodyAt((x + xs[i - 1]!) / 2);
    xs[i] = x;
    ts[i] = clock;
  }
  const total = ts[STEPS]!;

  const biggest = bodyAt(first[0]);

  const fade = (x: number) => {
    const start = Math.max(0, Math.min(1, (x - first[0]) / FADE_IN));
    const end = Math.max(0, Math.min(1, (last[0] - x) / FADE_OUT));
    const smooth = (t: number) => t * t * (3 - 2 * t);
    const haze = 1 - HAZE * (1 - bodyAt(x) / biggest);
    return smooth(start) * smooth(end) * haze;
  };

  return {
    at(progress) {
      const wanted = (((progress % 1) + 1) % 1) * total;
      // Двоичный поиск по таблице времени: шаг таблицы неравномерный.
      let lo = 0;
      let hi = STEPS;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (ts[mid]! <= wanted) lo = mid;
        else hi = mid;
      }
      const gap = ts[hi]! - ts[lo]!;
      const t = gap > 0 ? (wanted - ts[lo]!) / gap : 0;
      const x = xs[lo]! + (xs[hi]! - xs[lo]!) * t;
      return { x, y: cableY(x), scale: bodyAt(x) / near.body, opacity: fade(x) };
    },
    progressAt(x) {
      const clamped = Math.max(first[0], Math.min(last[0], x));
      const i = Math.max(0, Math.min(STEPS - 1, Math.floor(((clamped - first[0]) / span) * STEPS)));
      const t = ((clamped - first[0]) / span) * STEPS - i;
      return (ts[i]! + (ts[i + 1]! - ts[i]!) * t) / total;
    },
  };
}
