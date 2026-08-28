'use client';

import Image from 'next/image';
import { useEffect, useRef, type CSSProperties } from 'react';

import { buildTrack } from './cableCars';
import type { HeroScene } from './scene.generated';
import { createWater, type Water } from './water';
import styles from './livePhoto.module.css';

/**
 * Ожившая фотография первого экрана.
 *
 * Задача — не «анимация поверх снимка», а тот же самый снимок, в котором
 * работает то, что и должно работать: канатка едет, вода дышит. Поэтому
 * ничего не дорисовано. Кабинки вырезаны из этого же кадра и стёрты с него
 * (`scripts/hero-scene.mjs`), а вода — те же пиксели фотографии, чуть
 * смещаемые шейдером.
 *
 * Кадр внутри секции живёт в собственной системе координат: слой .space имеет
 * ровно те размеры, которые дал бы `object-fit: cover`, и всё внутри
 * расставляется в долях кадра. Никаких пересчётов «где сейчас фотография» в
 * JS: сдвинулась секция — кабинки и вода уехали вместе с ней.
 *
 * Без JS или с «меньше движения» остаётся неподвижный кадр с кабинками на тех
 * местах, где они были на исходном снимке.
 */

/** Кабинок на тросе одновременно. */
const CABINS = 4;

/** Полный проход троса из конца в конец, секунды. */
const TRAVEL = 82;

/** Разброс скорости: трос один, но пусть строй не будет чертёжным. */
const SPEEDS = [1, 0.985, 1.014, 0.996];

/** Раскачка на подвесе: градусы и период в секундах. */
const SWAY = [
  { angle: 0.5, period: 6.4, phase: 0 },
  { angle: 0.42, period: 7.9, phase: 2.1 },
  { angle: 0.58, period: 5.6, phase: 4.3 },
  { angle: 0.46, period: 7.1, phase: 1.2 },
];

/** Наибольшее смещение воды у нижнего края кадра, пиксели исходника. */
const WATER_PEAK = 5;

export function LivePhoto({ scene, className }: { scene: HeroScene; className?: string }) {
  const spaceRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cabinsRef = useRef<(HTMLImageElement | null)[]>([]);

  useEffect(() => {
    const space = spaceRef.current;
    const photo = photoRef.current;
    if (!space || !photo) return;

    const track = buildTrack(scene);
    const cabins = cabinsRef.current;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');

    let width = space.clientWidth;
    let height = space.clientHeight;

    // Разметка расставила кабинки в процентах — дальше их ведёт transform,
    // и left/top должны уйти, иначе сдвиг посчитается дважды.
    for (const cabin of cabins) {
      if (!cabin) continue;
      cabin.style.display = '';
      cabin.style.left = '0px';
      cabin.style.top = '0px';
      cabin.style.width = `${(scene.cabin.width / scene.width) * 100}%`;
    }

    /**
     * Раскладка одной кабинки. Всё сводится к одному transform: точка подвеса
     * ставится на трос, вокруг неё же идут масштаб и раскачка.
     */
    const place = (index: number, progress: number, time: number) => {
      const cabin = cabins[index];
      if (!cabin) return;
      const pose = track.at(progress);
      const baseW = (scene.cabin.width / scene.width) * width;
      const baseH = (scene.cabin.height / scene.height) * height;
      const x = pose.x * width - scene.cabin.grip[0] * baseW;
      const y = pose.y * height - scene.cabin.grip[1] * baseH;
      const sway = SWAY[index % SWAY.length]!;
      const angle = sway.angle * Math.sin((time / sway.period) * Math.PI * 2 + sway.phase);
      cabin.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${angle.toFixed(3)}deg) scale(${pose.scale.toFixed(4)})`;
      cabin.style.opacity = pose.opacity.toFixed(3);
    };

    // Неподвижный кадр: кабинки стоят там же, где стояли на фотографии.
    const freeze = () => {
      const anchors = [scene.cabin.near.x, scene.cabin.far.x];
      cabins.forEach((cabin, i) => {
        if (!cabin) return;
        if (i < anchors.length) {
          cabin.style.display = '';
          place(i, track.progressAt(anchors[i]!), 0);
        } else {
          cabin.style.display = 'none';
        }
      });
    };

    let water: Water | null = null;
    let frame = 0;
    let clock = 0;
    let last = 0;
    let visible = true;

    /** Расстановка всех кабинок на текущий момент времени. */
    const layout = () => {
      for (let i = 0; i < CABINS; i++) {
        place(i, (clock * SPEEDS[i % SPEEDS.length]!) / TRAVEL + i / CABINS, clock);
      }
    };

    const tick = (now: number) => {
      frame = window.requestAnimationFrame(tick);
      // Скачок после вкладки в фоне не должен телепортировать кабинки.
      const delta = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      clock += delta;
      layout();
      water?.draw(clock);
    };

    const start = () => {
      if (frame || still.matches || !visible) return;
      last = 0;
      // Первая раскладка сразу: кабинки не должны мелькнуть в углу кадра,
      // если первый кадр анимации почему-то задержится.
      layout();
      frame = window.requestAnimationFrame(tick);
    };

    const stop = () => {
      if (!frame) return;
      window.cancelAnimationFrame(frame);
      frame = 0;
    };

    const resize = new ResizeObserver(([entry]) => {
      if (!entry) return;
      width = entry.contentRect.width;
      height = entry.contentRect.height;
      water?.resize();
      // Пересчёт под новый размер: и в покое, и между кадрами анимации.
      if (still.matches) freeze();
      else layout();
    });
    resize.observe(space);

    // Пока первый экран не в кадре, считать нечего.
    const watcher = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? true;
        if (visible) start();
        else stop();
      },
      { threshold: 0 },
    );
    watcher.observe(space);

    // Вода включается, когда есть и кадр, и маска. Нет WebGL — просто нет ряби.
    let cancelled = false;
    const mask = new window.Image();
    mask.decoding = 'async';
    mask.src = scene.water.mask;

    /** Картинка загружена — ждём событие, а не decode(): он есть не везде. */
    const ready = (image: HTMLImageElement) =>
      new Promise<boolean>((resolve) => {
        if (image.complete && image.naturalWidth > 0) {
          resolve(true);
          return;
        }
        image.addEventListener('load', () => resolve(true), { once: true });
        image.addEventListener('error', () => resolve(false), { once: true });
      });

    const startWater = async () => {
      const canvas = canvasRef.current;
      if (!canvas || still.matches) return;
      const [photoOk, maskOk] = await Promise.all([ready(photo), ready(mask)]);
      if (!photoOk || !maskOk || cancelled) return;
      water = createWater({
        canvas,
        photo,
        mask,
        rect: scene.water.rect,
        horizon: scene.water.horizon,
        aspect: scene.width / scene.height,
        peak: WATER_PEAK,
        height: scene.height,
      });
      if (water) canvas.dataset.on = 'true';
    };

    // Браузер мог подставить другой размер из srcset — текстуру берём заново.
    const refresh = () => water?.refresh();
    photo.addEventListener('load', refresh);

    const motion = () => {
      if (still.matches) {
        stop();
        freeze();
      } else {
        cabins.forEach((cabin) => cabin && (cabin.style.display = ''));
        start();
      }
    };
    still.addEventListener('change', motion);

    if (still.matches) freeze();
    else {
      start();
      void startWater();
    }

    return () => {
      cancelled = true;
      stop();
      resize.disconnect();
      watcher.disconnect();
      photo.removeEventListener('load', refresh);
      still.removeEventListener('change', motion);
      water?.dispose();
      water = null;
    };
  }, [scene]);

  const [x0, y0, x1, y1] = scene.water.rect;

  // Разметка отдаёт кадр в том виде, в каком он был снят: две кабинки стоят
  // ровно там, где стояли на фотографии. Скрипт подхватит их с этих мест —
  // без скрипта и при «меньше движения» кадр остаётся исходным.
  const track = buildTrack(scene);
  const initial = [scene.cabin.near.x, scene.cabin.far.x].map((x) =>
    track.at(track.progressAt(x)),
  );

  return (
    <div className={`${styles.frame} ${className ?? ''}`}>
      <div
        ref={spaceRef}
        className={styles.space}
        style={{ '--frame-ratio': `${scene.width / scene.height}` } as CSSProperties}
      >
        <Image
          ref={photoRef}
          className={styles.photo}
          src={scene.plate}
          alt=""
          fill
          priority
          quality={88}
          sizes="(max-width: 900px) 360vw, 115vw"
        />

        <canvas
          ref={canvasRef}
          className={styles.water}
          aria-hidden="true"
          style={{
            left: `${x0 * 100}%`,
            top: `${y0 * 100}%`,
            width: `${(x1 - x0) * 100}%`,
            height: `${(y1 - y0) * 100}%`,
          }}
        />

        <div className={styles.cabins} aria-hidden="true">
          {Array.from({ length: CABINS }, (_, i) => {
            const pose = initial[i];
            const base = (scene.cabin.width / scene.width) * 100;
            return (
              <img
                key={i}
                ref={(node) => {
                  cabinsRef.current[i] = node;
                }}
                className={styles.cabin}
                src={scene.cabin.src}
                alt=""
                width={scene.cabin.width}
                height={scene.cabin.height}
                decoding="async"
                style={{
                  display: pose ? undefined : 'none',
                  left: pose ? `${pose.x * 100}%` : 0,
                  top: pose ? `${pose.y * 100}%` : 0,
                  width: `${base * (pose ? pose.scale : 1)}%`,
                  transform: `translate(${-scene.cabin.grip[0] * 100}%, ${-scene.cabin.grip[1] * 100}%)`,
                  transformOrigin: `${scene.cabin.grip[0] * 100}% ${scene.cabin.grip[1] * 100}%`,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
