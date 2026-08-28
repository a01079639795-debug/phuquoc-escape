/**
 * Хранилище в памяти процесса.
 *
 * Нужно для тестов: без него проверка magic bytes и снятия EXIF требовала бы
 * поднятого MinIO, то есть перестала бы выполняться в обычном прогоне.
 *
 * В проде не используется — фабрика в index.ts выбирает его только когда
 * переменные окружения хранилища не заданы, и пишет об этом предупреждение.
 */

import type { ObjectHead, StoragePort, UploadTicket } from './types';

type StoredObject = { body: Buffer; contentType: string };

export class MemoryStorage implements StoragePort {
  readonly kind = 'memory';
  private readonly objects = new Map<string, StoredObject>();

  async createUploadUrl(input: { key: string; contentType: string; maxBytes: number }): Promise<UploadTicket> {
    return {
      // Адрес заведомо нерабочий: в тестах файл кладут через put(), а в деве
      // без настроенного хранилища загрузка и не должна притворяться рабочей.
      url: `memory://upload/${encodeURIComponent(input.key)}`,
      method: 'PUT',
      headers: { 'content-type': input.contentType, 'content-length': String(input.maxBytes) },
      key: input.key,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    };
  }

  async head(key: string): Promise<ObjectHead | null> {
    const object = this.objects.get(key);
    return object ? { size: object.body.length, contentType: object.contentType } : null;
  }

  async get(key: string, bytes?: number): Promise<Buffer> {
    const object = this.objects.get(key);
    if (!object) throw new Error(`Объект отсутствует в хранилище: ${key}`);
    return bytes ? object.body.subarray(0, bytes) : object.body;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { body, contentType });
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  publicUrl(key: string): string {
    return `https://media.local/${key}`;
  }

  /** Только для тестов. */
  clear(): void {
    this.objects.clear();
  }
}
