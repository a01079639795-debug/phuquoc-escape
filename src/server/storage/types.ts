/**
 * Порт объектного хранилища.
 *
 * Сервисы работают с этим интерфейсом, а не с конкретным SDK. Реализаций две:
 * S3-совместимая (Cloudflare R2 в проде, MinIO локально — у них один и тот же
 * протокол) и хранилище в памяти для тестов.
 *
 * Такое разделение нужно не ради абстракции как таковой: без него тесты
 * загрузки требовали бы поднятого MinIO, а проверка magic bytes стала бы
 * непроверяемой.
 */

export type UploadTicket = {
  /** Куда браузер кладёт файл. Прямая загрузка, минуя наш сервер. */
  url: string;
  method: 'PUT';
  /** Заголовки, которые браузер обязан отправить вместе с телом. */
  headers: Record<string, string>;
  /** Ключ объекта. Генерируется сервером, клиент его не выбирает. */
  key: string;
  expiresAt: Date;
};

export type ObjectHead = {
  size: number;
  contentType: string | null;
};

export interface StoragePort {
  /** Название реализации — попадает в логи и в ответ /health. */
  readonly kind: string;

  /**
   * Ссылка для прямой загрузки с ограниченным сроком жизни.
   * Ограничение по типу и размеру закладывается в подпись, а не проверяется
   * на нашей стороне: файл до сервера не доходит.
   */
  createUploadUrl(input: { key: string; contentType: string; maxBytes: number }): Promise<UploadTicket>;

  /** Метаданные объекта. null, если объекта нет. */
  head(key: string): Promise<ObjectHead | null>;

  /** Содержимое объекта целиком либо первые `bytes` байт. */
  get(key: string, bytes?: number): Promise<Buffer>;

  put(key: string, body: Buffer, contentType: string): Promise<void>;

  delete(key: string): Promise<void>;

  /** Публичный адрес для раздачи через CDN. */
  publicUrl(key: string): string;
}
