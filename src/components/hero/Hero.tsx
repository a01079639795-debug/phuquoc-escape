'use client';

import Image from 'next/image';
import { useEffect, useRef } from 'react';

import type { AreaDto } from '@/server/modules/catalog.service';
import { Icon } from '../shared/Icon';
import { HeroScene } from './HeroScene';
import { LivePhoto } from './LivePhoto';
import type { HeroScene as HeroSceneData } from './scene.generated';
import { SearchBar } from './SearchBar';
import styles from './hero.module.css';

/**
 * Первый экран.
 *
 * Движение собрано на одной переменной прокрутки и двух переменных курсора,
 * которые пишутся раз за кадр в корень секции. Слои читают их в transform, и
 * ни один слой не пересчитывает раскладку.
 *
 * При включённой настройке «меньше движения» слушатели не вешаются вовсе —
 * сцена остаётся статичной картинкой.
 */
export function Hero({
  areas,
  photo,
  scene,
}: {
  areas: AreaDto[];
  photo: string | null;
  /** Разобранный на слои кадр: канатка едет, вода дышит. */
  scene: HeroSceneData | null;
}) {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Целевые и сглаженные значения: курсор догоняется, а не прыгает.
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let frame = 0;

    const write = () => {
      frame = 0;

      currentX += (targetX - currentX) * 0.12;
      currentY += (targetY - currentY) * 0.12;

      const { top, height } = section.getBoundingClientRect();
      const runway = Math.max(1, height);
      const progress = Math.min(1, Math.max(0, -top / runway));

      section.style.setProperty('--p', progress.toFixed(4));
      section.style.setProperty('--mx', currentX.toFixed(4));
      section.style.setProperty('--my', currentY.toFixed(4));

      // Пока курсор не догнал цель, продолжаем кадры.
      if (Math.abs(targetX - currentX) > 0.001 || Math.abs(targetY - currentY) > 0.001) {
        frame = window.requestAnimationFrame(write);
      }
    };

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(write);
    };

    const onPointer = (event: PointerEvent) => {
      targetX = event.clientX / window.innerWidth - 0.5;
      targetY = event.clientY / window.innerHeight - 0.5;
      schedule();
    };

    write();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('pointermove', onPointer, { passive: true });

    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('pointermove', onPointer);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      <section ref={sectionRef} className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.frame}>
          {scene ? (
            // Тот же кадр, но с работающей канаткой и живой водой.
            <div className={styles.photoLayer}>
              <LivePhoto scene={scene} />
              <span className={styles.photoScrim} />
            </div>
          ) : photo ? (
            // Своя фотография побеждает нарисованную сцену: рисунок был
            // временной мерой, пока снимка не было.
            <div className={styles.photoLayer}>
              <Image
                src={photo}
                alt=""
                fill
                priority
                sizes="100vw"
                quality={88}
                className={styles.photoImg}
              />
              <span className={styles.photoScrim} />
            </div>
          ) : (
            <HeroScene />
          )}
        </div>

        <div className={`shell ${styles.copy}`}>
          <p className={`${styles.eyebrow} ${styles.fade} ${styles.d1}`}>
            Добро пожаловать на остров
          </p>

          <h1 id="hero-title" className={styles.title}>
            <span className={`${styles.titleLine} ${styles.rise} ${styles.d2}`}>
              <span data-tone="light">Explore</span>
            </span>
            <span className={`${styles.titleLine} ${styles.rise} ${styles.d3}`}>
              <span lang="vi">
                <span data-tone="light">Phú </span>
                <span data-tone="water">Quốc</span>
              </span>
            </span>
          </h1>

          <p className={`${styles.script} ${styles.fade} ${styles.d4}`}>
            Жильё. Байки. Открытия.
          </p>

          <div className={`${styles.actions} ${styles.fade} ${styles.d5}`}>
            <a className="btn btn-gold" href="#stays" style={{ paddingRight: '0.45rem' }}>
              Смотреть жильё
              <span className={styles.btnDisc}>
                <Icon name="arrow-right" size={16} />
              </span>
            </a>
            <a className="btn btn-line" href="#rides" style={{ color: 'var(--color-shell)' }}>
              Аренда байков
            </a>
          </div>
        </div>

        <span className={styles.grain} aria-hidden="true" />

        <div className={styles.rail} aria-hidden="true">
          <span className={styles.railDot} data-on="true" />
          <span className={styles.railDot} />
          <span className={styles.railDot} />
          <span className={styles.railText}>Фукуок</span>
        </div>
      </section>

      {/* Панель поднята на границу секций: она принадлежит обеим. */}
      <div className="shell" style={{ marginTop: 'clamp(-3.25rem, -5vw, -2.25rem)', position: 'relative', zIndex: 20 }}>
        <SearchBar areas={areas} />
      </div>
    </>
  );
}
