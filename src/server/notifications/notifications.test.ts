/**
 * Тесты уведомлений о новой заявке.
 *
 * Канал подменяется реализацией в памяти. Проверяется не только «сообщение
 * ушло», но и то, что сбой канала не ломает приём заявки: уведомление —
 * вспомогательное действие, а заявка уже сохранена.
 *
 * Запуск:  npm run test:notify
 */

import { after, before, beforeEach, describe, test } from 'node:test';
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

const dataDir = mkdtempSync(join(tmpdir(), 'pq-notify-'));
const port = 6100 + Math.floor(Math.random() * 90);
const DATABASE_URL = `postgresql://postgres:postgres@localhost:${port}/phuquoc?schema=public`;

const pg = new EmbeddedPostgres({
  databaseDir: dataDir, user: 'postgres', password: 'postgres', port, persistent: false,
});

let S: typeof import('../index');
let db: typeof import('../db');
let notifications: typeof import('./index');
let rateLimit: typeof import('../lib/rate-limit');
let notifier: InstanceType<typeof import('./memory').MemoryNotifier>;

let publishedId = '';
let publishedUnitId = '';

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
  notifications = await import('./index');
  rateLimit = await import('../lib/rate-limit');

  const { MemoryNotifier } = await import('./memory');
  notifier = new MemoryNotifier();
  notifications.setNotifier(notifier);

  const listing = await db.prisma.listing.findFirstOrThrow({
    where: { slug: 'sunset-sands-resort' },
    include: { units: true },
  });
  publishedId = listing.id;
  publishedUnitId = listing.units[0]!.id;
});

beforeEach(() => {
  notifier.clear();
  rateLimit.clearAllRateLimits();
});

after(async () => {
  notifications?.setNotifier(null);
  try { await db?.prisma.$disconnect(); } catch { /* уже закрыто */ }
  try { await pg.stop(); } catch { /* уже остановлен */ }
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* каталог занят */ }
});

// ═══════════════════════════════════════════════════════════════════════════

describe('Текст сообщения', () => {
  test('содержит код заявки, объект, даты и контакты', async () => {
    const { formatNewRequest } = notifications;
    const message = formatNewRequest({
      publicCode: 'PQ-AB12C',
      type: 'HOTEL',
      listingTitle: 'Сансет Сэндс Резорт',
      unitName: 'Deluxe с видом на море',
      contactName: 'Иван Петров',
      contactPhone: '+7 916 123-45-67',
      contactEmail: 'ivan@example.com',
      messenger: 'TELEGRAM',
      messengerHandle: '@ivan_petrov',
      dateFrom: new Date(Date.UTC(2026, 8, 10)),
      dateTo: new Date(Date.UTC(2026, 8, 14)),
      guests: 2,
      quantity: null,
      comment: 'Хотим номер повыше',
    });

    assert.equal(message.kind, 'request.created');
    for (const fragment of [
      'PQ-AB12C', 'Сансет Сэндс Резорт', 'Deluxe с видом на море',
      '10.09.2026', '14.09.2026', 'Иван Петров', '+7 916 123-45-67',
      '@ivan_petrov', 'Хотим номер повыше',
    ]) {
      assert.ok(message.text.includes(fragment), `в сообщении нет: ${fragment}`);
    }
  });

  test('разметка в пользовательском тексте экранируется', async () => {
    const message = notifications.formatNewRequest({
      publicCode: 'PQ-XSS01',
      type: 'GENERAL',
      listingTitle: null,
      unitName: null,
      contactName: '<b>Взлом</b>',
      contactPhone: '+79990000000',
      contactEmail: null,
      messenger: 'NONE',
      messengerHandle: null,
      dateFrom: null,
      dateTo: null,
      guests: null,
      quantity: null,
      comment: '<script>alert(1)</script>',
    });

    assert.ok(!message.text.includes('<script>'), 'сырой тег не должен попасть в сообщение');
    assert.ok(message.text.includes('&lt;script&gt;'));
    assert.ok(message.text.includes('&lt;b&gt;Взлом&lt;/b&gt;'));
  });

  test('необязательные поля не порождают пустых строк', async () => {
    const message = notifications.formatNewRequest({
      publicCode: 'PQ-MIN01',
      type: 'BIKE',
      listingTitle: null,
      unitName: null,
      contactName: 'Минимал',
      contactPhone: '+79990000001',
      contactEmail: null,
      messenger: 'NONE',
      messengerHandle: null,
      dateFrom: null,
      dateTo: null,
      guests: null,
      quantity: null,
      comment: null,
    });

    assert.ok(!message.text.includes('Почта:'));
    assert.ok(!message.text.includes('Комментарий:'));
    assert.ok(!message.text.includes('Гостей:'));
  });
});

describe('Отправка при создании заявки', () => {
  test('новая заявка порождает уведомление', async () => {
    const created = await S.requests.createRequest({
      type: 'HOTEL',
      listingId: publishedId,
      listingUnitId: publishedUnitId,
      contactName: 'Ольга Уведомлённая',
      contactPhone: '+79161112233',
      dateFrom: '2026-11-01',
      dateTo: '2026-11-05',
      guests: 2,
    });

    await notifications.flushNotifications();

    assert.equal(notifier.sent.length, 1);
    assert.ok(notifier.last!.text.includes(created.publicCode));
    assert.ok(notifier.last!.text.includes('Ольга Уведомлённая'));
    assert.ok(notifier.last!.text.includes('Сансет Сэндс Резорт'));
  });

  test('сбой канала не мешает принять заявку', async () => {
    notifier.failNext = true;

    const created = await S.requests.createRequest({
      type: 'GENERAL',
      contactName: 'Заявка Несмотря Ни На Что',
      contactPhone: '+79161114455',
    });

    await notifications.flushNotifications();

    assert.ok(created.publicCode, 'заявка должна быть создана');
    const row = await db.prisma.request.findUnique({ where: { id: created.id } });
    assert.ok(row, 'заявка должна лежать в базе');
    assert.equal(notifier.sent.length, 0, 'сообщение не ушло — и это допустимо');
  });

  test('повтор с тем же ключом идемпотентности не шлёт второе сообщение', async () => {
    const body = {
      type: 'BIKE' as const,
      contactName: 'Двойная Отправка',
      contactPhone: '+79161116677',
    };
    const ctx = { idempotencyKey: 'notify-idem-1' };

    await S.requests.createRequest(body, null, ctx);
    await S.requests.createRequest(body, null, ctx);
    await notifications.flushNotifications();

    assert.equal(notifier.sent.length, 1, 'менеджер не должен получать дубль по одной заявке');
  });

  test('отклонённая заявка уведомления не порождает', async () => {
    await assert.rejects(() =>
      S.requests.createRequest({
        type: 'GENERAL',
        contactName: 'Бот',
        contactPhone: '+79161118899',
        website: 'http://spam.example',
      }),
    );

    await notifications.flushNotifications();
    assert.equal(notifier.sent.length, 0);
  });

  test('заявка на черновик уведомления не порождает', async () => {
    const draft = await db.prisma.listing.findFirstOrThrow({ where: { status: 'DRAFT' } });

    await assert.rejects(() =>
      S.requests.createRequest({
        type: 'HOTEL',
        listingId: draft.id,
        contactName: 'Мимо Черновика',
        contactPhone: '+79161119900',
      }),
    );

    await notifications.flushNotifications();
    assert.equal(notifier.sent.length, 0);
  });
});

describe('Канал Telegram', () => {
  test('недоступная сеть не приводит к исключению', async () => {
    const { TelegramNotifier } = notifications;
    const telegram = new TelegramNotifier({ botToken: 'test-token', chatId: '-100500' });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error('сеть недоступна');
    }) as typeof fetch;

    try {
      // Отсутствие броска и есть проверяемое поведение.
      await telegram.send({ kind: 'request.created', text: 'проверка' });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('ответ с ошибкой от Telegram не приводит к исключению', async () => {
    const telegram = new notifications.TelegramNotifier({ botToken: 'test-token', chatId: 'bad-chat' });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: false, description: 'chat not found' }), { status: 400 })) as typeof fetch;

    try {
      await telegram.send({ kind: 'request.created', text: 'проверка' });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('запрос уходит на sendMessage с разметкой HTML', async () => {
    const telegram = new notifications.TelegramNotifier({ botToken: 'secret-token', chatId: '-100777' });

    let captured: { url: string; body: Record<string, unknown> } | null = null;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      captured = { url: String(url), body: JSON.parse(String(init?.body)) };
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    try {
      await telegram.send({ kind: 'request.created', text: '<b>Новая заявка</b>' });
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.ok(captured, 'запрос должен был уйти');
    const { url, body } = captured as unknown as { url: string; body: Record<string, unknown> };
    assert.ok(url.endsWith('/sendMessage'));
    assert.ok(url.includes('secret-token'));
    assert.equal(body.chat_id, '-100777');
    assert.equal(body.parse_mode, 'HTML');
    assert.equal(body.text, '<b>Новая заявка</b>');
  });
});
