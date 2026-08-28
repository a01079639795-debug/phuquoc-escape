/**
 * Разбор изображений на уровне байтов.
 *
 * Заголовок Content-Type приходит от клиента и подделывается тривиально:
 * достаточно назвать исполняемый файл «photo.jpg» и указать image/jpeg.
 * Поэтому фактический тип определяется по сигнатуре содержимого, а не по
 * тому, что заявил загружающий.
 */

import { imageSize } from 'image-size';

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';

export const IMAGE_MIMES: readonly ImageMime[] = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

/** Сколько байт достаточно, чтобы определить тип и размеры. */
export const SNIFF_BYTES = 64 * 1024;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Фактический тип по сигнатуре.
 *
 * SVG не распознаётся намеренно: это XML, он может содержать скрипт, и в
 * медиатеке ему делать нечего. Отсутствие в списке — не упущение.
 */
export function sniffImageType(buffer: Buffer): ImageMime | null {
  if (buffer.length < 12) return null;

  // JPEG: SOI-маркер FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';

  if (buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return 'image/png';

  // WebP: контейнер RIFF с меткой WEBP на четвёртом слове
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }

  // AVIF: ISOBMFF, бренд в блоке ftyp
  if (buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('ascii');
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
  }

  return null;
}

export type Dimensions = { width: number; height: number };

export function readDimensions(buffer: Buffer): Dimensions | null {
  try {
    const size = imageSize(buffer);
    if (!size.width || !size.height) return null;
    return { width: size.width, height: size.height };
  } catch {
    return null;
  }
}

// ── EXIF ────────────────────────────────────────────────────────────────────

/**
 * Маркеры, которые вырезаются: APP1 (EXIF с геометкой и XMP), APP3…APP15
 * и текстовый комментарий.
 *
 * APP0 (JFIF) и APP2 (цветовой профиль ICC) намеренно остаются. JFIF —
 * структурный заголовок: без него файл формально валиден, но строгие
 * анализаторы перестают читать размеры. ICC отвечает за цветопередачу,
 * и его удаление изменило бы вид фотографии.
 */
const METADATA_MARKERS = new Set([
  0xe1, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9,
  0xea, 0xeb, 0xec, 0xed, 0xee, 0xef, 0xfe,
]);

/**
 * Минимальный блок JFIF: версия 1.01, плотность 1×1, без миниатюры.
 * Подставляется, если после очистки файл остался вообще без APP-заголовка.
 */
const JFIF_APP0 = Buffer.from([
  0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00,
  0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
]);

/**
 * Вырезает блоки метаданных из JPEG.
 *
 * Это операция над контейнером, а не перекодирование: пиксельные данные не
 * трогаются, качество не меняется. Смысл — снять EXIF, где лежат координаты
 * съёмки и модель устройства: снимок отеля, сделанный на телефон владельца,
 * иначе опубликует его местоположение.
 *
 * Возвращает null, если резать нечего.
 */
export function stripJpegMetadata(buffer: Buffer): Buffer | null {
  if (sniffImageType(buffer) !== 'image/jpeg') return null;

  const chunks: Buffer[] = [];
  let offset = 2;
  let removed = false;
  let hasAppHeader = false;

  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) break;

    const marker = buffer[offset + 1]!;

    // SOS: дальше идут сжатые данные до конца файла, разбирать их не нужно.
    if (marker === 0xda) {
      chunks.push(buffer.subarray(offset));
      break;
    }

    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > buffer.length) break;

    if (METADATA_MARKERS.has(marker)) {
      removed = true;
    } else {
      if (marker === 0xe0 || marker === 0xe2) hasAppHeader = true;
      chunks.push(buffer.subarray(offset, offset + 2 + length));
    }

    offset += 2 + length;
  }

  if (!removed) return null;

  const head: Buffer[] = [buffer.subarray(0, 2)]; // SOI
  if (!hasAppHeader) head.push(JFIF_APP0);

  return Buffer.concat([...head, ...chunks]);
}

/** Есть ли в JPEG блоки метаданных. Используется для отчётности. */
export function hasJpegMetadata(buffer: Buffer): boolean {
  return stripJpegMetadata(buffer) !== null;
}

/**
 * Крошечный плейсхолдер для плавной загрузки.
 *
 * Настоящее размытие требует перекодирования, то есть sharp с его нативной
 * сборкой. До появления обработки изображений отдаётся нейтральная заглушка
 * нужных пропорций — вёрстка от неё не зависит, так как ширина и высота
 * известны точно.
 */
export const NEUTRAL_BLUR =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBASfMhbcAAAAASUVORK5CYII=';
