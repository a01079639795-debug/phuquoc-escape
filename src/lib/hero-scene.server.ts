import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { heroScene, type HeroScene } from '@/components/hero/scene.generated';

/**
 * Проверка, что разобранная сцена первого экрана всё ещё соответствует
 * фотографии в public.
 *
 * Слои для «ожившего кадра» (кадр без кабинок, вырезанная кабинка, маска
 * воды, линия троса) готовит `scripts/hero-scene.mjs` под конкретный снимок.
 * Положили другой файл — геометрия к нему не подходит, и кабинки поехали бы
 * мимо троса. Поэтому здесь сверяется отпечаток исходника: не совпал или
 * файлов сборки нет — первый экран показывает обычную неподвижную
 * фотографию, как будто ничего и не было.
 *
 * Считается один раз на процесс: файл в public меняется только при сборке.
 */

const PUBLIC_DIR = join(process.cwd(), 'public');

let checked: HeroScene | null | undefined;

function verify(): HeroScene | null {
  const source = join(PUBLIC_DIR, heroScene.source);
  if (!existsSync(source)) return null;

  for (const asset of [heroScene.plate, heroScene.cabin.src, heroScene.water.mask]) {
    if (!existsSync(join(PUBLIC_DIR, asset))) return null;
  }

  const hash = createHash('sha256').update(readFileSync(source)).digest('hex').slice(0, 16);
  return hash === heroScene.sourceHash ? heroScene : null;
}

/** Сцена для первого экрана или null, если снимок сменился. */
export function liveHeroScene(): HeroScene | null {
  if (checked === undefined) checked = verify();
  return checked;
}
