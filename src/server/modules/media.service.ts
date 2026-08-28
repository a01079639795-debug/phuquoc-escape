/**
 * Медиатека.
 *
 * Здесь только учёт файлов и политика допустимости. Выдача presigned-ссылок
 * и сама загрузка появятся вместе с адаптером хранилища (R2/MinIO) — это
 * инфраструктура, и она сознательно не тянется в MVP-слой сервисов.
 *
 * Правила из раздела «Работа с изображениями» архитектуры, которые
 * реализованы уже сейчас:
 *  • ключ объекта генерирует сервер, клиентские пути не принимаются;
 *  • SVG запрещён — это вектор XSS;
 *  • размер ограничен сверху.
 */

import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { prisma } from '../db';
import type { Actor } from '../authz';
import { assertStaff } from '../authz';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { parseInput } from '../lib/validate';
import { writeAudit } from '../lib/audit';
import { paginate, parsePaging, type Paginated } from '../pagination';
import { getStorage } from '../storage';
import {
  NEUTRAL_BLUR,
  SNIFF_BYTES,
  readDimensions,
  sniffImageType,
  stripJpegMetadata,
} from '../lib/image';

/** SVG отсутствует намеренно: он может содержать скрипт. */
export const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;
export const MAX_FILE_BYTES = 8 * 1024 * 1024;

const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

export const registerAssetSchema = z.object({
  storageKey: z.string().min(3).max(300),
  url: z.string().url().max(2000),
  mime: z.enum(ALLOWED_MIME),
  width: z.number().int().positive().max(20000),
  height: z.number().int().positive().max(20000),
  sizeBytes: z.number().int().positive().max(MAX_FILE_BYTES),
  blurDataUrl: z.string().max(4000).optional().nullable(),
});

export type MediaDto = {
  id: string;
  url: string;
  storageKey: string;
  mime: string;
  width: number;
  height: number;
  sizeBytes: number;
  blurDataUrl: string | null;
  usageCount: number;
  createdAt: Date;
};

/**
 * Ключ в хранилище. Генерируется сервером и только сервером: имя файла от
 * клиента открыло бы путь к перезаписи чужих объектов и path traversal.
 */
export function buildStorageKey(mime: string, prefix = 'listings'): string {
  const ext = EXTENSION[mime];
  if (!ext) throw new ValidationError(`Неподдерживаемый тип файла: ${mime}`);
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${prefix}/${month}/${randomUUID()}.${ext}`;
}

// ── загрузка через хранилище ────────────────────────────────────────────────

export const createUploadSchema = z.object({
  mime: z.enum(ALLOWED_MIME),
  sizeBytes: z.number().int().positive().max(MAX_FILE_BYTES),
  prefix: z.enum(['listings', 'areas']).default('listings'),
});

export type UploadTicketDto = {
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  storageKey: string;
  expiresAt: Date;
};

/**
 * Выдаёт ссылку на прямую загрузку в хранилище.
 *
 * Файл идёт из браузера в R2 или MinIO минуя наш сервер: нет нагрузки на
 * приложение и нет лимитов body-parser. Тип и размер входят в подпись, а
 * ключ объекта генерирует сервер — клиент не выбирает, куда положить файл.
 */
export async function createUpload(actor: Actor | null, input: unknown): Promise<UploadTicketDto> {
  assertStaff(actor);
  const data = parseInput(createUploadSchema, input);

  const key = buildStorageKey(data.mime, data.prefix);
  const ticket = await getStorage().createUploadUrl({
    key,
    contentType: data.mime,
    maxBytes: data.sizeBytes,
  });

  return {
    uploadUrl: ticket.url,
    method: ticket.method,
    headers: ticket.headers,
    storageKey: ticket.key,
    expiresAt: ticket.expiresAt,
  };
}

export const confirmUploadSchema = z.object({
  storageKey: z.string().min(3).max(300),
  alt: z.string().trim().max(300).optional().nullable(),
});

/**
 * Подтверждение загрузки: файл проверяется и попадает в медиатеку.
 *
 * Здесь и только здесь мы впервые видим содержимое. Заявленный при выдаче
 * ссылки тип не является доказательством: заголовок Content-Type задаёт
 * клиент. Поэтому тип определяется по сигнатуре байтов, а несоответствие
 * означает, что в хранилище лежит не то, что обещали — такой объект
 * удаляется, а не остаётся мусором.
 */
export async function confirmUpload(actor: Actor | null, input: unknown): Promise<MediaDto> {
  assertStaff(actor);
  const data = parseInput(confirmUploadSchema, input);
  const storage = getStorage();

  const duplicate = await prisma.mediaAsset.findUnique({
    where: { storageKey: data.storageKey },
    select: { id: true },
  });
  if (duplicate) throw new ConflictError('MEDIA_ALREADY_REGISTERED', 'Этот файл уже есть в медиатеке');

  const head = await storage.head(data.storageKey);
  if (!head) throw new NotFoundError('media', data.storageKey);

  const discard = async (message: string): Promise<never> => {
    await storage.delete(data.storageKey);
    throw new ValidationError(message);
  };

  if (head.size > MAX_FILE_BYTES) {
    return discard(`Файл больше допустимых ${Math.floor(MAX_FILE_BYTES / 1024 / 1024)} МБ`);
  }

  const probe = await storage.get(data.storageKey, SNIFF_BYTES);

  const actualMime = sniffImageType(probe);
  if (!actualMime) {
    return discard('Файл не является изображением поддерживаемого формата (JPEG, PNG, WebP, AVIF)');
  }

  const dimensions = readDimensions(probe);
  if (!dimensions) return discard('Не удалось определить размеры изображения');

  let sizeBytes = head.size;

  // EXIF снимается вырезанием блоков контейнера, без перекодирования:
  // геометка съёмки не должна уехать в публичный доступ вместе с фотографией.
  if (actualMime === 'image/jpeg') {
    const full = await storage.get(data.storageKey);
    const stripped = stripJpegMetadata(full);
    if (stripped) {
      await storage.put(data.storageKey, stripped, actualMime);
      sizeBytes = stripped.length;
    }
  }

  const asset = await prisma.mediaAsset.create({
    data: {
      storageKey: data.storageKey,
      url: storage.publicUrl(data.storageKey),
      // В базу идёт фактический тип, а не заявленный.
      mime: actualMime,
      width: dimensions.width,
      height: dimensions.height,
      sizeBytes,
      blurDataUrl: NEUTRAL_BLUR,
      uploadedById: actor.id,
    },
  });

  await writeAudit(prisma, {
    actorId: actor.id,
    actorRole: actor.role,
    entity: 'MediaAsset',
    entityId: asset.id,
    action: 'upload',
    after: { storageKey: asset.storageKey, mime: actualMime, sizeBytes },
  });

  return { ...toMediaDto(asset), usageCount: 0 };
}

/**
 * Регистрация файла, уже лежащего в хранилище, по известным метаданным.
 *
 * Используется сидом и импортом. Обычный путь загрузки из админки —
 * createUpload + confirmUpload, где содержимое проверяется по байтам.
 */
export async function registerAsset(actor: Actor | null, input: unknown): Promise<MediaDto> {
  assertStaff(actor);
  const data = parseInput(registerAssetSchema, input);

  const existing = await prisma.mediaAsset.findUnique({
    where: { storageKey: data.storageKey },
    select: { id: true },
  });
  if (existing) throw new ConflictError('MEDIA_ALREADY_REGISTERED', 'Этот файл уже есть в медиатеке');

  const asset = await prisma.mediaAsset.create({
    data: {
      storageKey: data.storageKey,
      url: data.url,
      mime: data.mime,
      width: data.width,
      height: data.height,
      sizeBytes: data.sizeBytes,
      blurDataUrl: data.blurDataUrl ?? null,
      uploadedById: actor.id,
    },
  });

  return { ...toMediaDto(asset), usageCount: 0 };
}

function toMediaDto(asset: Prisma.MediaAssetGetPayload<object>): Omit<MediaDto, 'usageCount'> {
  return {
    id: asset.id,
    url: asset.url,
    storageKey: asset.storageKey,
    mime: asset.mime,
    width: asset.width,
    height: asset.height,
    sizeBytes: asset.sizeBytes,
    blurDataUrl: asset.blurDataUrl,
    createdAt: asset.createdAt,
  };
}

export async function listAssets(
  actor: Actor | null,
  input: { page?: number; perPage?: number; unusedOnly?: boolean } = {},
): Promise<Paginated<MediaDto>> {
  assertStaff(actor);
  const { page, perPage, skip, take } = parsePaging(input);

  const where: Prisma.MediaAssetWhereInput = input.unusedOnly ? { listingImages: { none: {} } } : {};

  const [rows, total] = await Promise.all([
    prisma.mediaAsset.findMany({
      where,
      include: { _count: { select: { listingImages: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.mediaAsset.count({ where }),
  ]);

  const data = rows.map((row) => ({ ...toMediaDto(row), usageCount: row._count.listingImages }));
  return paginate(data, total, page, perPage);
}

/**
 * Удаление файла из медиатеки.
 *
 * База защищает от удаления используемого файла внешним ключом RESTRICT.
 * Проверка здесь нужна не вместо неё, а чтобы вернуть внятное сообщение
 * вместо ошибки СУБД.
 */
export async function deleteAsset(actor: Actor | null, mediaId: string): Promise<void> {
  assertStaff(actor);

  const asset = await prisma.mediaAsset.findUnique({
    where: { id: mediaId },
    include: { _count: { select: { listingImages: true } } },
  });
  if (!asset) throw new NotFoundError('media', mediaId);

  if (asset._count.listingImages > 0) {
    throw new ConflictError(
      'MEDIA_IN_USE',
      `Файл используется в ${asset._count.listingImages} объекте(ах) — сначала отвяжите его`,
      { usageCount: asset._count.listingImages },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.mediaAsset.delete({ where: { id: mediaId } });
    await writeAudit(tx, {
      actorId: actor.id, actorRole: actor.role,
      entity: 'MediaAsset', entityId: mediaId, action: 'delete',
      before: { storageKey: asset.storageKey },
    });
  });
}
