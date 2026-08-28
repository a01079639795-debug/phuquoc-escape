/**
 * Тесты загрузки медиа: presigned-ссылка, проверка содержимого по сигнатуре,
 * снятие EXIF.
 *
 * Хранилище подменяется реализацией в памяти — иначе эти проверки требовали бы
 * поднятого MinIO и на практике не выполнялись бы.
 *
 * Запуск:  npm run test:media
 */

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import EmbeddedPostgres from 'embedded-postgres';
import pgLib from 'pg';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const MIGRATION = join(ROOT, 'prisma/migrations/20260824225039_init/migration.sql');

const dataDir = mkdtempSync(join(tmpdir(), 'pq-media-'));
const port = 6000 + Math.floor(Math.random() * 90);
const DATABASE_URL = `postgresql://postgres:postgres@localhost:${port}/phuquoc?schema=public`;

const pg = new EmbeddedPostgres({
  databaseDir: dataDir, user: 'postgres', password: 'postgres', port, persistent: false,
});

let S: typeof import('../index');
let db: typeof import('../db');
let storageModule: typeof import('./index');
let image: typeof import('../lib/image');
let storage: InstanceType<typeof import('./memory').MemoryStorage>;

const manager = { id: '', role: 'MANAGER' as const, status: 'ACTIVE' as const };

// ── конструирование тестовых изображений ────────────────────────────────────

/** 1×1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBASfMhbcAAAAASUVORK5CYII=',
  'base64',
);

/**
 * Минимальный JPEG 96×64 с блоком APP1.
 *
 * Собирается вручную, а не берётся файлом: так в тесте видно, что именно
 * вырезается при снятии метаданных, и не нужен двоичный файл в репозитории.
 */
function makeJpeg(options: { withExif: boolean }): Buffer {
  const parts: Buffer[] = [Buffer.from([0xff, 0xd8])]; // SOI

  if (options.withExif) {
    const payload = Buffer.concat([
      Buffer.from('Exif\0\0', 'latin1'),
      // Здесь у настоящего снимка лежали бы координаты съёмки. Размер взят
      // близким к реальному: EXIF телефона — это сотни байт, а не десяток,
      // иначе очистка не давала бы заметной экономии.
      Buffer.from('GPS-DATA', 'latin1'),
      Buffer.alloc(240, 0x20),
    ]);
    const app1 = Buffer.alloc(4);
    app1.writeUInt8(0xff, 0);
    app1.writeUInt8(0xe1, 1);
    app1.writeUInt16BE(payload.length + 2, 2);
    parts.push(app1, payload);
  }

  // SOF0: точность 8 бит, высота 64, ширина 96, три компонента
  parts.push(
    Buffer.from([
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x40, 0x00, 0x60, 0x03,
      0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    ]),
  );
  parts.push(Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]));
  parts.push(Buffer.from([0xff, 0xd9])); // EOI

  return Buffer.concat(parts);
}

/** Минимальный WebP 120×80 в форме VP8X. */
function makeWebp(): Buffer {
  const vp8x = Buffer.alloc(18);
  vp8x.write('VP8X', 0, 'latin1');
  vp8x.writeUInt32LE(10, 4);
  vp8x.writeUInt8(0, 8);
  vp8x.writeUIntLE(119, 12, 3); // ширина минус один
  vp8x.writeUIntLE(79, 15, 3); // высота минус один

  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(4 + vp8x.length, 4);
  header.write('WEBP', 8, 'latin1');

  return Buffer.concat([header, vp8x]);
}

/** Заголовок AVIF: нужен только для распознавания типа. */
function makeAvifHeader(): Buffer {
  const buf = Buffer.alloc(32);
  buf.writeUInt32BE(32, 0);
  buf.write('ftyp', 4, 'latin1');
  buf.write('avif', 8, 'latin1');
  return buf;
}

// ═══════════════════════════════════════════════════════════════════════════

before(async () => {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('phuquoc');

  const admin = new pgLib.Client({ connectionString: DATABASE_URL });
  await admin.connect();
  await admin.query(readFileSync(MIGRATION, 'utf8'));
  await admin.end();

  const code = await new Promise<number>((res) => {
    const child = spawn('npx', ['--no-install', 'tsx', 'prisma/seed.ts'], {
      cwd: ROOT, env: { ...process.env, DATABASE_URL }, stdio: ['ignore', 'ignore', 'inherit'], shell: true,
    });
    child.on('close', (c) => res(c ?? 1));
  });
  assert.equal(code, 0, 'сид должен отработать без ошибок');

  process.env.DATABASE_URL = DATABASE_URL;
  S = await import('../index');
  db = await import('../db');
  storageModule = await import('./index');
  image = await import('../lib/image');

  const { MemoryStorage } = await import('./memory');
  storage = new MemoryStorage();
  storageModule.setStorage(storage);

  manager.id = (await db.prisma.user.findUniqueOrThrow({ where: { email: 'manager@phuquoc.demo' } })).id;
});

after(async () => {
  storageModule?.setStorage(null);
  try { await db?.prisma.$disconnect(); } catch { /* уже закрыто */ }
  try { await pg.stop(); } catch { /* уже остановлен */ }
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* каталог занят */ }
});

// ═══════════════════════════════════════════════════════════════════════════

describe('Определение типа по сигнатуре', () => {
  test('распознаёт четыре поддерживаемых формата', () => {
    assert.equal(image.sniffImageType(makeJpeg({ withExif: false })), 'image/jpeg');
    assert.equal(image.sniffImageType(PNG), 'image/png');
    assert.equal(image.sniffImageType(makeWebp()), 'image/webp');
    assert.equal(image.sniffImageType(makeAvifHeader()), 'image/avif');
  });

  test('SVG не распознаётся как изображение', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    assert.equal(image.sniffImageType(svg), null);
  });

  test('исполняемый файл не выдаёт себя за картинку', () => {
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64)]);
    assert.equal(image.sniffImageType(exe), null);
  });

  test('размеры читаются из содержимого', () => {
    assert.deepEqual(image.readDimensions(makeJpeg({ withExif: true })), { width: 96, height: 64 });
    assert.deepEqual(image.readDimensions(PNG), { width: 1, height: 1 });
    assert.deepEqual(image.readDimensions(makeWebp()), { width: 120, height: 80 });
  });
});

describe('Снятие метаданных JPEG', () => {
  test('блок EXIF вырезается, изображение остаётся читаемым', () => {
    const withExif = makeJpeg({ withExif: true });
    assert.ok(withExif.includes(Buffer.from('GPS-DATA', 'latin1')), 'подготовка: метка должна быть');

    const stripped = image.stripJpegMetadata(withExif);
    assert.ok(stripped, 'ожидали, что резать есть что');
    assert.ok(!stripped!.includes(Buffer.from('GPS-DATA', 'latin1')), 'координаты должны исчезнуть');
    assert.ok(stripped!.length < withExif.length);
    assert.deepEqual(image.readDimensions(stripped!), { width: 96, height: 64 });
  });

  test('файл без метаданных не переписывается зря', () => {
    assert.equal(image.stripJpegMetadata(makeJpeg({ withExif: false })), null);
  });
});

describe('Выдача ссылки на загрузку', () => {
  test('ключ генерирует сервер, клиент его не задаёт', async () => {
    const ticket = await S.media.createUpload(manager, { mime: 'image/jpeg', sizeBytes: 120_000 });
    assert.match(ticket.storageKey, /^listings\/\d{4}-\d{2}\/[0-9a-f-]{36}\.jpg$/);
    assert.equal(ticket.method, 'PUT');
    assert.equal(ticket.headers['content-type'], 'image/jpeg');
    assert.ok(ticket.expiresAt > new Date());
  });

  test('SVG не получает ссылку', async () => {
    await assert.rejects(
      () => S.media.createUpload(manager, { mime: 'image/svg+xml', sizeBytes: 1000 }),
      S.ValidationError,
    );
  });

  test('файл сверх лимита не получает ссылку', async () => {
    await assert.rejects(
      () => S.media.createUpload(manager, { mime: 'image/jpeg', sizeBytes: 50 * 1024 * 1024 }),
      S.ValidationError,
    );
  });

  test('обычный пользователь ссылку не получает', async () => {
    const user = { id: manager.id, role: 'USER' as const, status: 'ACTIVE' as const };
    await assert.rejects(
      () => S.media.createUpload(user, { mime: 'image/jpeg', sizeBytes: 1000 }),
      S.ForbiddenError,
    );
  });
});

describe('Подтверждение загрузки', () => {
  test('корректный PNG попадает в медиатеку с реальными размерами', async () => {
    const ticket = await S.media.createUpload(manager, { mime: 'image/png', sizeBytes: PNG.length });
    await storage.put(ticket.storageKey, PNG, 'image/png');

    const asset = await S.media.confirmUpload(manager, { storageKey: ticket.storageKey });

    assert.equal(asset.mime, 'image/png');
    assert.equal(asset.width, 1);
    assert.equal(asset.height, 1);
    assert.equal(asset.usageCount, 0);
    assert.ok(asset.url.includes(ticket.storageKey));
  });

  test('подменённый тип не проходит: в базу идёт фактический', async () => {
    // Заявили JPEG, положили PNG. Верить заголовку нельзя — верим байтам.
    const ticket = await S.media.createUpload(manager, { mime: 'image/jpeg', sizeBytes: PNG.length });
    await storage.put(ticket.storageKey, PNG, 'image/jpeg');

    const asset = await S.media.confirmUpload(manager, { storageKey: ticket.storageKey });
    assert.equal(asset.mime, 'image/png', 'должен быть записан настоящий тип, а не заявленный');
  });

  test('не-изображение отвергается и удаляется из хранилища', async () => {
    const ticket = await S.media.createUpload(manager, { mime: 'image/jpeg', sizeBytes: 500 });
    const payload = Buffer.from('<svg onload="alert(1)"></svg>');
    await storage.put(ticket.storageKey, payload, 'image/jpeg');

    await assert.rejects(
      () => S.media.confirmUpload(manager, { storageKey: ticket.storageKey }),
      S.ValidationError,
    );

    assert.equal(await storage.head(ticket.storageKey), null, 'мусор не должен оставаться в хранилище');
    const row = await db.prisma.mediaAsset.findUnique({ where: { storageKey: ticket.storageKey } });
    assert.equal(row, null, 'записи в медиатеке быть не должно');
  });

  test('EXIF снимается при подтверждении, в хранилище остаётся очищенный файл', async () => {
    const withExif = makeJpeg({ withExif: true });
    const ticket = await S.media.createUpload(manager, { mime: 'image/jpeg', sizeBytes: withExif.length });
    await storage.put(ticket.storageKey, withExif, 'image/jpeg');

    const asset = await S.media.confirmUpload(manager, { storageKey: ticket.storageKey });

    const stored = await storage.get(ticket.storageKey);
    assert.ok(!stored.includes(Buffer.from('GPS-DATA', 'latin1')), 'геометка должна быть удалена');
    assert.equal(asset.sizeBytes, stored.length, 'в базе должен быть размер после очистки');
    assert.ok(asset.sizeBytes < withExif.length);
    assert.equal(asset.width, 96);
  });

  test('отсутствующий в хранилище файл — 404', async () => {
    await assert.rejects(
      () => S.media.confirmUpload(manager, { storageKey: 'listings/2026-08/нет-такого.jpg' }),
      S.NotFoundError,
    );
  });

  test('повторное подтверждение того же ключа — конфликт', async () => {
    const ticket = await S.media.createUpload(manager, { mime: 'image/png', sizeBytes: PNG.length });
    await storage.put(ticket.storageKey, PNG, 'image/png');

    await S.media.confirmUpload(manager, { storageKey: ticket.storageKey });
    await assert.rejects(
      () => S.media.confirmUpload(manager, { storageKey: ticket.storageKey }),
      S.ConflictError,
    );
  });

  test('загрузка попадает в журнал аудита', async () => {
    const ticket = await S.media.createUpload(manager, { mime: 'image/png', sizeBytes: PNG.length });
    await storage.put(ticket.storageKey, PNG, 'image/png');
    const asset = await S.media.confirmUpload(manager, { storageKey: ticket.storageKey });

    const entries = await db.prisma.auditLog.count({
      where: { entity: 'MediaAsset', entityId: asset.id, action: 'upload' },
    });
    assert.equal(entries, 1);
  });
});

describe('Связь с объектами каталога', () => {
  test('загруженный файл привязывается к объекту и становится обложкой', async () => {
    const listing = await db.prisma.listing.findFirstOrThrow({ where: { slug: 'starfish-beach-camp' } });
    const before = await db.prisma.listingImage.count({ where: { listingId: listing.id } });

    const ticket = await S.media.createUpload(manager, { mime: 'image/png', sizeBytes: PNG.length });
    await storage.put(ticket.storageKey, PNG, 'image/png');
    const asset = await S.media.confirmUpload(manager, { storageKey: ticket.storageKey });

    await S.listings.attachImage(manager, listing.id, asset.id, 'Тестовое фото');

    const after = await db.prisma.listingImage.count({ where: { listingId: listing.id } });
    assert.equal(after, before + 1);

    const covers = await db.prisma.listingImage.count({ where: { listingId: listing.id, isCover: true } });
    assert.equal(covers, 1, 'обложка должна остаться ровно одна');
  });

  test('используемый файл нельзя удалить из медиатеки', async () => {
    const image = await db.prisma.listingImage.findFirstOrThrow();
    await assert.rejects(() => S.media.deleteAsset(manager, image.mediaId), S.ConflictError);
  });
});
