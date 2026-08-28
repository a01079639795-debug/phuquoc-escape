import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Подхват фотографий, положенных в public/images.
 *
 * Проверка существования файла делается на сервере при отрисовке: положил
 * файл — он появился на сайте, никаких правок кода. Пока файла нет,
 * используется нарисованная сцена, и первый экран не показывает пустоту.
 *
 * Клиентские компоненты этот модуль не импортируют: здесь работа с файловой
 * системой. Результат приходит к ним пропсом со страницы.
 */

const PUBLIC_DIR = join(process.cwd(), 'public');

function firstExisting(...candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (existsSync(join(PUBLIC_DIR, candidate))) return `/${candidate}`;
  }
  return null;
}

/** Фон первого экрана. */
export function heroPhoto(): string | null {
  return firstExisting(
    'images/hero/beach.jpg',
    'images/hero/beach.jpeg',
    'images/hero/beach.png',
    'images/hero/beach.webp',
  );
}

export type DiscoveryPhotos = {
  stays: string;
  bikes: string;
  experiences: string;
};

/**
 * Кадры для трёх плиток «Соберите поездку».
 *
 * Если специальных снимков нет, берутся те, что уже есть в проекте, — плитка
 * не должна оставаться пустым прямоугольником.
 */
export function discoveryPhotos(): DiscoveryPhotos {
  return {
    stays:
      firstExisting('images/discovery/stays.jpg', 'images/discovery/stays.webp') ??
      '/images/stays/bungalow-dusk.jpg',
    bikes:
      firstExisting('images/discovery/bikes.jpg', 'images/discovery/bikes.webp') ??
      '/images/bikes/honda-vision.jpg',
    experiences:
      firstExisting('images/discovery/experiences.jpg', 'images/discovery/experiences.webp') ??
      '/images/stays/bungalow-night.jpg',
  };
}
