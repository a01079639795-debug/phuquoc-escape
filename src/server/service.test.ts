/**
 * Тесты service layer.
 *
 * Поднимают настоящий PostgreSQL из npm-пакета, применяют миграцию и сид,
 * затем проверяют сценарии MVP. Docker не нужен.
 *
 * Запуск:  npm test
 *
 * Сервисы импортируются динамически: PrismaClient читает DATABASE_URL в момент
 * создания, а адрес базы известен только после старта сервера.
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
const ROOT = resolve(HERE, '../..');
const MIGRATION = join(ROOT, 'prisma/migrations/20260824225039_init/migration.sql');

const dataDir = mkdtempSync(join(tmpdir(), 'pq-svc-'));
const port = 5700 + Math.floor(Math.random() * 200);
const DATABASE_URL = `postgresql://postgres:postgres@localhost:${port}/phuquoc?schema=public`;

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port,
  persistent: false,
});

type Services = typeof import('./index');
type RateLimit = typeof import('./lib/rate-limit');
type Db = typeof import('./db');

let S: Services;
let rateLimit: RateLimit;
let db: Db;

/** Идентификаторы из сида, нужные тестам. */
const ids = {
  admin: '', manager: '', ivan: '', maria: '',
  publishedHotel: '', publishedHotelSlug: '', draftListing: '',
  hotelUnit: '', area: '',
};

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
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL },
      stdio: ['ignore', 'ignore', 'inherit'],
      shell: true,
    });
    child.on('close', (c) => res(c ?? 1));
  });
  assert.equal(code, 0, 'сид должен отработать без ошибок');

  process.env.DATABASE_URL = DATABASE_URL;
  S = await import('./index');
  rateLimit = await import('./lib/rate-limit');
  db = await import('./db');

  const users = await db.prisma.user.findMany({ select: { id: true, email: true } });
  ids.admin = users.find((u) => u.email === 'admin@phuquoc.demo')!.id;
  ids.manager = users.find((u) => u.email === 'manager@phuquoc.demo')!.id;
  ids.ivan = users.find((u) => u.email === 'ivan@example.com')!.id;
  ids.maria = users.find((u) => u.email === 'maria@example.com')!.id;

  const hotel = await db.prisma.listing.findFirst({
    where: { slug: 'sunset-sands-resort' },
    include: { units: true },
  });
  ids.publishedHotel = hotel!.id;
  ids.publishedHotelSlug = hotel!.slug;
  ids.hotelUnit = hotel!.units[0]!.id;
  ids.area = hotel!.areaId!;

  const draft = await db.prisma.listing.findFirst({ where: { status: 'DRAFT' } });
  ids.draftListing = draft!.id;
});

after(async () => {
  try { await db?.prisma.$disconnect(); } catch { /* соединение уже закрыто */ }
  try { await pg.stop(); } catch { /* сервер уже остановлен */ }
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* каталог занят */ }
});

// Актёры собираются вручную: getSession проверяется отдельно в блоке auth.
const asAdmin = () => ({ id: ids.admin, role: 'ADMIN' as const, status: 'ACTIVE' as const });
const asManager = () => ({ id: ids.manager, role: 'MANAGER' as const, status: 'ACTIVE' as const });
const asUser = (id: string) => ({ id, role: 'USER' as const, status: 'ACTIVE' as const });

// ═══════════════════════════════════════════════════════════════════════════

describe('Локализация', () => {
  test('запрошенный язык выигрывает', async () => {
    const { pickTranslation } = await import('./lib/locale');
    const rows = [
      { locale: 'RU' as const, title: 'Вилла' },
      { locale: 'EN' as const, title: 'Villa' },
    ];
    assert.equal(pickTranslation(rows, 'EN')?.title, 'Villa');
    assert.equal(pickTranslation(rows, 'RU')?.title, 'Вилла');
  });

  test('при отсутствии перевода срабатывает запасной язык, а не пустая строка', async () => {
    const { pickTranslation } = await import('./lib/locale');
    const onlyRu = [{ locale: 'RU' as const, title: 'Вилла' }];
    assert.equal(pickTranslation(onlyRu, 'VI')?.title, 'Вилла');
    assert.equal(pickTranslation(onlyRu, 'EN')?.title, 'Вилла');
  });

  test('неизвестный язык приводится к языку по умолчанию', () => {
    assert.equal(S.resolveLocale('de'), 'RU');
    assert.equal(S.resolveLocale(undefined), 'RU');
    assert.equal(S.resolveLocale('VI'), 'VI');
  });
});

describe('Деньги', () => {
  test('VND форматируется без дробной части', async () => {
    const { toMoney } = await import('./lib/money');
    const money = toMoney(1_350_000n, 'VND');
    assert.equal(money!.amount, 1_350_000);
    assert.ok(!money!.formatted.includes(','), `не ожидали дробную часть: ${money!.formatted}`);
  });

  test('USD трактуется как центы', async () => {
    const { toMoney } = await import('./lib/money');
    const money = toMoney(15000n, 'USD');
    assert.equal(money!.amount, 15000);
    assert.match(money!.formatted, /150/);
  });

  test('дробная сумма отвергается на входе', async () => {
    const { fromMinorUnits } = await import('./lib/money');
    assert.throws(() => fromMinorUnits(10.5), RangeError);
  });
});

describe('Каталог', () => {
  test('поиск возвращает только опубликованные объекты', async () => {
    const page = await S.catalog.searchListings({ perPage: 50 });
    assert.ok(page.meta.total >= 20);
    const rows = await db.prisma.listing.findMany({
      where: { id: { in: page.data.map((d) => d.id) } },
      select: { status: true },
    });
    assert.ok(rows.every((r) => r.status === 'PUBLISHED'));
  });

  test('черновик недоступен по публичной ссылке', async () => {
    const draft = await db.prisma.listing.findUniqueOrThrow({ where: { id: ids.draftListing } });
    await assert.rejects(() => S.catalog.getListingBySlug(draft.slug), S.NotFoundError);
  });

  test('фильтр по типу и району', async () => {
    const page = await S.catalog.searchListings({ type: 'BIKE', perPage: 50 });
    assert.ok(page.data.length > 0);
    assert.ok(page.data.every((d) => d.type === 'BIKE'));

    const byArea = await S.catalog.searchListings({ area: 'ong-lang', perPage: 50 });
    assert.ok(byArea.data.every((d) => d.area?.slug === 'ong-lang'));
  });

  test('несколько удобств объединяются по И, а не по ИЛИ', async () => {
    const both = await S.catalog.searchListings({ amenities: ['pool', 'spa'], perPage: 50 });
    for (const card of both.data) {
      const detail = await S.catalog.getListingBySlug(card.slug);
      const codes = detail.amenities.map((a) => a.code);
      assert.ok(codes.includes('pool') && codes.includes('spa'), `${card.slug}: ${codes.join(',')}`);
    }
    const onlyPool = await S.catalog.searchListings({ amenities: ['pool'], perPage: 50 });
    assert.ok(onlyPool.meta.total >= both.meta.total);
  });

  test('сортировка по цене возрастает', async () => {
    const page = await S.catalog.searchListings({ type: 'HOTEL', sort: 'price_asc', perPage: 50 });
    const prices = page.data.map((d) => d.priceFrom?.amount ?? 0);
    const sorted = [...prices].sort((a, b) => a - b);
    assert.deepEqual(prices, sorted);
  });

  test('потолок perPage не обходится', async () => {
    const page = await S.catalog.searchListings({ perPage: 10_000 });
    assert.ok(page.meta.perPage <= 50, `perPage=${page.meta.perPage}`);
  });

  test('карточка объекта содержит юниты, удобства и обложку', async () => {
    const detail = await S.catalog.getListingBySlug(ids.publishedHotelSlug);
    assert.ok(detail.units.length > 0);
    assert.ok(detail.amenities.length > 0);
    assert.ok(detail.cover);
    assert.ok(detail.priceFrom);
    assert.equal(detail.priceFrom!.amount, Math.min(...detail.units.map((u) => u.price.amount)));
  });
});

describe('Аутентификация', () => {
  test('регистрация выдаёт рабочую сессию', async () => {
    rateLimit.clearAllRateLimits();
    const result = await S.auth.register({
      email: 'Newbie@Example.com',
      password: 'sup3r-secret',
      name: 'Новый Пользователь',
    });
    assert.equal(result.user.email, 'newbie@example.com', 'email приводится к нижнему регистру');

    const session = await S.auth.getSession(result.token);
    assert.equal(session?.user.id, result.user.id);
  });

  test('повторная регистрация того же адреса отклоняется', async () => {
    rateLimit.clearAllRateLimits();
    await assert.rejects(
      () => S.auth.register({ email: 'ivan@example.com', password: 'sup3r-secret', name: 'Дубль' }),
      S.ConflictError,
    );
  });

  test('вход с верным паролем, отказ с неверным', async () => {
    rateLimit.clearAllRateLimits();
    const ok = await S.auth.login({ email: 'ivan@example.com', password: 'demo1234' });
    assert.equal(ok.user.id, ids.ivan);

    await assert.rejects(
      () => S.auth.login({ email: 'ivan@example.com', password: 'wrong-password' }),
      S.UnauthorizedError,
    );
  });

  test('несуществующий адрес и неверный пароль неотличимы', async () => {
    rateLimit.clearAllRateLimits();
    const missing = await S.auth.login({ email: 'nobody@example.com', password: 'x'.repeat(10) }).catch((e) => e);
    const wrong = await S.auth.login({ email: 'ivan@example.com', password: 'x'.repeat(10) }).catch((e) => e);
    assert.equal(missing.code, wrong.code);
    assert.equal(missing.message, wrong.message);
  });

  test('перебор пароля упирается в ограничение частоты', async () => {
    rateLimit.clearAllRateLimits();
    let limited = false;
    for (let i = 0; i < 20; i++) {
      try {
        await S.auth.login({ email: 'maria@example.com', password: 'nope-nope' }, { ip: '10.0.0.7' });
      } catch (e) {
        if (e instanceof S.TooManyRequestsError) { limited = true; break; }
      }
    }
    assert.ok(limited, 'ожидали TooManyRequestsError');
  });

  test('выход отзывает сессию немедленно', async () => {
    rateLimit.clearAllRateLimits();
    const { token } = await S.auth.login({ email: 'ivan@example.com', password: 'demo1234' });
    assert.ok(await S.auth.getSession(token));
    await S.auth.logout(token);
    assert.equal(await S.auth.getSession(token), null);
  });

  test('смена пароля обрывает остальные сессии', async () => {
    rateLimit.clearAllRateLimits();
    const first = await S.auth.login({ email: 'alex@example.com', password: 'demo1234' });
    const second = await S.auth.login({ email: 'alex@example.com', password: 'demo1234' });

    await S.auth.changePassword(
      { id: first.user.id, role: 'USER', status: 'ACTIVE' },
      { currentPassword: 'demo1234', newPassword: 'new-password-1' },
      first.token,
    );

    assert.ok(await S.auth.getSession(first.token), 'текущая сессия остаётся');
    assert.equal(await S.auth.getSession(second.token), null, 'чужая сессия отозвана');
  });

  test('сброс пароля по токену работает один раз', async () => {
    rateLimit.clearAllRateLimits();
    const { token } = await S.auth.requestPasswordReset('olga@example.com');
    assert.ok(token);

    await S.auth.resetPassword({ token: token!, newPassword: 'reset-password-1' });
    const ok = await S.auth.login({ email: 'olga@example.com', password: 'reset-password-1' });
    assert.ok(ok.token);

    await assert.rejects(
      () => S.auth.resetPassword({ token: token!, newPassword: 'another-one-2' }),
      S.ValidationError,
    );
  });

  test('запрос сброса для несуществующего адреса не раскрывает его отсутствие', async () => {
    rateLimit.clearAllRateLimits();
    const result = await S.auth.requestPasswordReset('ghost@example.com');
    assert.equal(result.token, null);
  });

  test('заблокированный пользователь теряет доступ сразу', async () => {
    rateLimit.clearAllRateLimits();
    const victim = await S.auth.register({
      email: 'blocked@example.com', password: 'sup3r-secret', name: 'Заблокированный',
    });
    await S.users.setUserStatus(asAdmin(), victim.user.id, 'BLOCKED');
    assert.equal(await S.auth.getSession(victim.token), null);
  });
});

describe('Заявки', () => {
  test('гость может оставить заявку', async () => {
    rateLimit.clearAllRateLimits();
    const created = await S.requests.createRequest({
      type: 'HOTEL',
      listingId: ids.publishedHotel,
      listingUnitId: ids.hotelUnit,
      contactName: 'Гость Тестовый',
      contactPhone: '+7 916 000-11-22',
      dateFrom: '2026-10-01',
      dateTo: '2026-10-07',
      guests: 2,
    });
    assert.match(created.publicCode, /^PQ-[A-Z2-9]{5}$/);
    assert.equal(created.status, 'NEW');
    assert.ok(created.listing);

    const row = await db.prisma.request.findUniqueOrThrow({ where: { id: created.id } });
    assert.equal(row.userId, null, 'гостевая заявка не привязана к аккаунту');
    assert.equal(row.contactPhoneNormalized, '+79160001122', 'телефон нормализован для будущей CRM');
  });

  test('honeypot-поле отклоняет бота', async () => {
    rateLimit.clearAllRateLimits();
    await assert.rejects(
      () => S.requests.createRequest({
        type: 'GENERAL',
        contactName: 'Бот Ботович',
        contactPhone: '+79990001122',
        website: 'http://spam.example',
      }),
      S.ValidationError,
    );
  });

  test('заявка на черновик отклоняется', async () => {
    rateLimit.clearAllRateLimits();
    await assert.rejects(
      () => S.requests.createRequest({
        type: 'HOTEL',
        listingId: ids.draftListing,
        contactName: 'Кто-то',
        contactPhone: '+79990001133',
      }),
      S.NotFoundError,
    );
  });

  test('дата окончания раньше даты начала не проходит', async () => {
    rateLimit.clearAllRateLimits();
    await assert.rejects(() => S.requests.createRequest({
      type: 'HOTEL',
      listingId: ids.publishedHotel,
      contactName: 'Путаник',
      contactPhone: '+79990001144',
      dateFrom: '2026-10-10',
      dateTo: '2026-10-01',
    }));
  });

  test('повторная отправка формы с тем же ключом не создаёт вторую заявку', async () => {
    rateLimit.clearAllRateLimits();
    const payload = {
      type: 'BIKE' as const,
      contactName: 'Двойной Клик',
      contactPhone: '+79990002255',
    };
    const ctx = { idempotencyKey: 'form-submit-abc-123' };

    const first = await S.requests.createRequest(payload, null, ctx);
    const second = await S.requests.createRequest(payload, null, ctx);

    assert.equal(first.publicCode, second.publicCode);
    const count = await db.prisma.request.count({ where: { contactPhone: '+79990002255' } });
    assert.equal(count, 1);
  });

  test('тот же ключ с другими данными — ошибка, а не тихий повтор', async () => {
    rateLimit.clearAllRateLimits();
    const ctx = { idempotencyKey: 'form-submit-xyz-999' };
    await S.requests.createRequest(
      { type: 'BIKE', contactName: 'Первый', contactPhone: '+79990003311' }, null, ctx,
    );
    await assert.rejects(
      () => S.requests.createRequest(
        { type: 'BIKE', contactName: 'Другой', contactPhone: '+79990003322' }, null, ctx,
      ),
      S.ConflictError,
    );
  });

  test('пользователь видит свои заявки и не видит чужие', async () => {
    rateLimit.clearAllRateLimits();
    const mine = await S.requests.createRequest(
      { type: 'HOTEL', listingId: ids.publishedHotel, contactName: 'Иван Петров', contactPhone: '+79161234567' },
      asUser(ids.ivan),
    );

    const list = await S.requests.listMyRequests(asUser(ids.ivan));
    assert.ok(list.data.some((r) => r.id === mine.id));

    // Ключевая проверка на IDOR: чужой идентификатор не открывает заявку.
    await assert.rejects(
      () => S.requests.getMyRequest(asUser(ids.maria), mine.id),
      S.NotFoundError,
    );
  });

  test('гость не может читать заявки кабинета', async () => {
    await assert.rejects(() => S.requests.listMyRequests(null), S.UnauthorizedError);
  });

  test('статусы меняются только по разрешённым переходам', async () => {
    rateLimit.clearAllRateLimits();
    const req = await S.requests.createRequest(
      { type: 'GENERAL', contactName: 'Статусный', contactPhone: '+79990004411' },
    );

    // NEW → CONFIRMED запрещён: заявку нельзя подтвердить, минуя работу менеджера
    await assert.rejects(
      () => S.requests.updateRequestStatus(asManager(), req.id, 'CONFIRMED'),
      S.ConflictError,
    );

    await S.requests.updateRequestStatus(asManager(), req.id, 'IN_PROGRESS');
    await S.requests.updateRequestStatus(asManager(), req.id, 'CONFIRMED');
    await S.requests.updateRequestStatus(asManager(), req.id, 'COMPLETED');

    // COMPLETED — конечное состояние
    await assert.rejects(
      () => S.requests.updateRequestStatus(asManager(), req.id, 'IN_PROGRESS'),
      S.ConflictError,
    );

    const log = await S.admin.listAuditLog(asAdmin(), { entity: 'Request', entityId: req.id });
    assert.ok(log.meta.total >= 4, 'каждый переход попал в журнал');
  });

  test('ответственным можно назначить только сотрудника', async () => {
    rateLimit.clearAllRateLimits();
    const req = await S.requests.createRequest(
      { type: 'GENERAL', contactName: 'Назначение', contactPhone: '+79990005511' },
    );
    await S.requests.assignRequest(asManager(), req.id, ids.manager);
    await assert.rejects(
      () => S.requests.assignRequest(asManager(), req.id, ids.ivan),
      S.ValidationError,
    );
  });

  test('обычный пользователь не имеет доступа к админским операциям с заявками', async () => {
    await assert.rejects(() => S.requests.adminListRequests(asUser(ids.ivan)), S.ForbiddenError);
    await assert.rejects(
      () => S.requests.updateRequestStatus(asUser(ids.ivan), ids.publishedHotel, 'CANCELLED'),
      S.ForbiddenError,
    );
  });
});

describe('Объекты каталога — админка', () => {
  let createdId = '';

  test('менеджер создаёт объект, он появляется черновиком', async () => {
    const listing = await S.listings.createListing(asManager(), {
      type: 'HOTEL',
      areaId: ids.area,
      content: { title: 'Тестовый Отель У Моря', shortDescription: 'Проверочный объект' },
      hotel: { stars: 3 },
      amenityCodes: ['wifi', 'pool'],
      units: [
        { name: 'Стандарт', priceAmount: 900_000, priceUnit: 'NIGHT', quantity: 5, capacity: 2 },
        { name: 'Люкс', priceAmount: 1_800_000, priceUnit: 'NIGHT', quantity: 2, capacity: 3 },
      ],
    });
    createdId = listing.id;

    assert.equal(listing.slug, 'testovyi-otel-u-morya', 'slug транслитерирован');
    assert.equal(listing.priceFrom!.amount, 900_000, 'цена «от» посчитана по юнитам');

    const row = await db.prisma.listing.findUniqueOrThrow({ where: { id: createdId } });
    assert.equal(row.status, 'DRAFT');
  });

  test('обычный пользователь создать объект не может', async () => {
    await assert.rejects(
      () => S.listings.createListing(asUser(ids.ivan), {
        type: 'HOTEL',
        content: { title: 'Самозахват' },
        units: [],
      }),
      S.ForbiddenError,
    );
  });

  test('публикация без изображений отклоняется с объяснением', async () => {
    const err = await S.listings.publishListing(asManager(), createdId).catch((e) => e);
    assert.ok(err instanceof S.ConflictError);
    assert.match(err.message, /изображени/i);
  });

  test('цена «от» пересчитывается при изменении юнитов', async () => {
    const unitId = await S.listings.addUnit(asManager(), createdId, {
      name: 'Эконом', priceAmount: 400_000, priceUnit: 'NIGHT', quantity: 3,
    });
    let row = await db.prisma.listing.findUniqueOrThrow({ where: { id: createdId } });
    assert.equal(Number(row.priceFromAmount), 400_000);

    await S.listings.updateUnit(asManager(), unitId, { isActive: false });
    row = await db.prisma.listing.findUniqueOrThrow({ where: { id: createdId } });
    assert.equal(Number(row.priceFromAmount), 900_000, 'неактивный юнит не влияет на цену');

    await S.listings.removeUnit(asManager(), unitId);
    row = await db.prisma.listing.findUniqueOrThrow({ where: { id: createdId } });
    assert.equal(Number(row.priceFromAmount), 900_000);
  });

  test('первое изображение автоматически становится обложкой, объект публикуется', async () => {
    const mediaIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const asset = await S.media.registerAsset(asManager(), {
        storageKey: `test/cover-${i}-${Date.now()}.jpg`,
        url: `https://cdn.example/test-${i}.jpg`,
        mime: 'image/jpeg',
        width: 1600, height: 900, sizeBytes: 200_000,
      });
      mediaIds.push(asset.id);
    }

    const imageIds: string[] = [];
    for (const mediaId of mediaIds) {
      imageIds.push(await S.listings.attachImage(asManager(), createdId, mediaId));
    }

    const covers = await db.prisma.listingImage.count({ where: { listingId: createdId, isCover: true } });
    assert.equal(covers, 1);

    await S.listings.publishListing(asManager(), createdId);
    const row = await db.prisma.listing.findUniqueOrThrow({ where: { id: createdId } });
    assert.equal(row.status, 'PUBLISHED');
    assert.ok(row.publishedAt);

    // смена обложки оставляет ровно одну
    await S.listings.setCoverImage(asManager(), createdId, imageIds[2]!);
    const after = await db.prisma.listingImage.findMany({ where: { listingId: createdId, isCover: true } });
    assert.equal(after.length, 1);
    assert.equal(after[0]!.id, imageIds[2]);
  });

  test('удаление обложки передаёт роль следующему изображению', async () => {
    const cover = await db.prisma.listingImage.findFirstOrThrow({
      where: { listingId: createdId, isCover: true },
    });
    await S.listings.detachImage(asManager(), createdId, cover.id);

    const covers = await db.prisma.listingImage.count({ where: { listingId: createdId, isCover: true } });
    assert.equal(covers, 1, 'объект не остался без обложки');
  });

  test('архивация убирает объект из публичного поиска', async () => {
    await S.listings.archiveListing(asManager(), createdId);
    const page = await S.catalog.searchListings({ perPage: 50, query: 'Тестовый Отель' });
    assert.ok(!page.data.some((d) => d.id === createdId));
  });
});

describe('Медиатека', () => {
  test('SVG не принимается — это вектор XSS', async () => {
    await assert.rejects(() => S.media.registerAsset(asManager(), {
      storageKey: 'test/evil.svg',
      url: 'https://cdn.example/evil.svg',
      mime: 'image/svg+xml',
      width: 100, height: 100, sizeBytes: 1000,
    }));
  });

  test('файл сверх лимита не принимается', async () => {
    await assert.rejects(() => S.media.registerAsset(asManager(), {
      storageKey: 'test/huge.jpg',
      url: 'https://cdn.example/huge.jpg',
      mime: 'image/jpeg',
      width: 5000, height: 5000, sizeBytes: 50 * 1024 * 1024,
    }));
  });

  test('используемый файл нельзя удалить', async () => {
    const image = await db.prisma.listingImage.findFirstOrThrow({ include: { media: true } });
    const err = await S.media.deleteAsset(asManager(), image.mediaId).catch((e) => e);
    assert.ok(err instanceof S.ConflictError);
    assert.equal(err.code, 'MEDIA_IN_USE');
  });

  test('неиспользуемый файл удаляется', async () => {
    const asset = await S.media.registerAsset(asManager(), {
      storageKey: `test/orphan-${Date.now()}.jpg`,
      url: 'https://cdn.example/orphan.jpg',
      mime: 'image/jpeg',
      width: 800, height: 600, sizeBytes: 90_000,
    });
    await S.media.deleteAsset(asManager(), asset.id);
    const found = await db.prisma.mediaAsset.findUnique({ where: { id: asset.id } });
    assert.equal(found, null);
  });
});

describe('Избранное', () => {
  test('добавление повторяемо и не даёт дублей', async () => {
    await S.favorites.addFavorite(asUser(ids.maria), ids.publishedHotel);
    await S.favorites.addFavorite(asUser(ids.maria), ids.publishedHotel);

    const count = await db.prisma.favorite.count({
      where: { userId: ids.maria, listingId: ids.publishedHotel },
    });
    assert.equal(count, 1);
    assert.equal(await S.favorites.isFavorite(asUser(ids.maria), ids.publishedHotel), true);
  });

  test('в избранное нельзя добавить черновик', async () => {
    await assert.rejects(
      () => S.favorites.addFavorite(asUser(ids.maria), ids.draftListing),
      S.NotFoundError,
    );
  });

  test('удаление возвращает список в исходное состояние', async () => {
    await S.favorites.removeFavorite(asUser(ids.maria), ids.publishedHotel);
    assert.equal(await S.favorites.isFavorite(asUser(ids.maria), ids.publishedHotel), false);
  });
});

describe('Роли и права', () => {
  test('менеджер не может менять роли — это право администратора', async () => {
    await assert.rejects(
      () => S.users.setUserRole(asManager(), ids.ivan, 'MANAGER'),
      S.ForbiddenError,
    );
  });

  test('администратор не может изменить собственную роль', async () => {
    await assert.rejects(
      () => S.users.setUserRole(asAdmin(), ids.admin, 'USER'),
      S.ConflictError,
    );
  });

  test('последнего администратора нельзя разжаловать', async () => {
    const promoted = await S.users.setUserRole(asAdmin(), ids.maria, 'ADMIN');
    assert.equal(promoted.role, 'ADMIN');

    // теперь администраторов двое, снятие одного проходит
    await S.users.setUserRole({ id: ids.maria, role: 'ADMIN', status: 'ACTIVE' }, ids.admin, 'MANAGER');

    // maria осталась единственным администратором — её снять нельзя
    await assert.rejects(
      () => S.users.setUserRole({ id: ids.admin, role: 'ADMIN', status: 'ACTIVE' }, ids.maria, 'USER'),
      S.ConflictError,
    );

    // возвращаем исходное состояние для остальных тестов
    await S.users.setUserRole({ id: ids.maria, role: 'ADMIN', status: 'ACTIVE' }, ids.admin, 'ADMIN');
    await S.users.setUserRole(asAdmin(), ids.maria, 'USER');
  });

  test('журнал аудита доступен только администратору', async () => {
    await assert.rejects(() => S.admin.listAuditLog(asManager()), S.ForbiddenError);
    const log = await S.admin.listAuditLog(asAdmin());
    assert.ok(log.meta.total > 0);
  });

  test('дашборд собирает сводку', async () => {
    const stats = await S.admin.getDashboardStats(asManager());
    assert.ok(stats.listings.published > 0);
    assert.ok(stats.requests.total > 0);
    assert.ok(stats.users.total > 0);
  });
});
