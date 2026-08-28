/**
 * S3-совместимое хранилище: Cloudflare R2 в проде, MinIO при разработке.
 *
 * Протокол один и тот же, поэтому адаптер один. Отличаются только адрес
 * конечной точки и способ построения публичной ссылки.
 */

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { ObjectHead, StoragePort, UploadTicket } from './types';

/** Сколько живёт ссылка на загрузку. Больше не нужно: файл выбирают сразу. */
const UPLOAD_TTL_SECONDS = 10 * 60;

export type S3StorageConfig = {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Домен раздачи через CDN. */
  publicBaseUrl: string;
  /** MinIO требует path-style адресацию, R2 работает и так, и так. */
  forcePathStyle?: boolean;
};

export class S3Storage implements StoragePort {
  readonly kind = 's3';
  private readonly client: S3Client;

  constructor(private readonly config: S3StorageConfig) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle ?? Boolean(config.endpoint),
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async createUploadUrl(input: { key: string; contentType: string; maxBytes: number }): Promise<UploadTicket> {
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.maxBytes,
    });

    const url = await getSignedUrl(this.client, command, { expiresIn: UPLOAD_TTL_SECONDS });

    return {
      url,
      method: 'PUT',
      // Заголовки входят в подпись: подменить тип или размер при загрузке
      // не получится — хранилище отвергнет запрос.
      headers: { 'content-type': input.contentType, 'content-length': String(input.maxBytes) },
      key: input.key,
      expiresAt: new Date(Date.now() + UPLOAD_TTL_SECONDS * 1000),
    };
  }

  async head(key: string): Promise<ObjectHead | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      return { size: result.ContentLength ?? 0, contentType: result.ContentType ?? null };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async get(key: string, bytes?: number): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        ...(bytes ? { Range: `bytes=0-${bytes - 1}` } : {}),
      }),
    );
    const body = await result.Body?.transformToByteArray();
    return Buffer.from(body ?? new Uint8Array());
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }

  publicUrl(key: string): string {
    return `${this.config.publicBaseUrl.replace(/\/$/, '')}/${key}`;
  }
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const named = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return named.name === 'NotFound' || named.$metadata?.httpStatusCode === 404;
}
