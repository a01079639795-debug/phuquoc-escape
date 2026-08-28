/**
 * Выбор реализации хранилища.
 *
 * Если переменные окружения заданы — работает S3-совместимое хранилище
 * (R2 или MinIO). Если нет — хранилище в памяти, и об этом пишется
 * предупреждение: молчаливый переход на заглушку в проде был бы хуже
 * явного отказа.
 */

import { MemoryStorage } from './memory';
import { S3Storage } from './s3';
import type { StoragePort } from './types';

export type { StoragePort, UploadTicket, ObjectHead } from './types';
export { MemoryStorage } from './memory';
export { S3Storage } from './s3';

let instance: StoragePort | null = null;

function build(): StoragePort {
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

  if (!bucket || !accessKeyId || !secretAccessKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Хранилище не настроено: задайте S3_BUCKET, S3_ACCESS_KEY_ID и S3_SECRET_ACCESS_KEY',
      );
    }
    console.warn('[storage] переменные хранилища не заданы — используется память процесса');
    return new MemoryStorage();
  }

  return new S3Storage({
    bucket,
    accessKeyId,
    secretAccessKey,
    region: process.env.S3_REGION ?? 'auto',
    endpoint: process.env.S3_ENDPOINT,
    publicBaseUrl: process.env.S3_PUBLIC_URL ?? `https://${bucket}.example`,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  });
}

export function getStorage(): StoragePort {
  instance ??= build();
  return instance;
}

/** Подмена реализации в тестах. */
export function setStorage(storage: StoragePort | null): void {
  instance = storage;
}
