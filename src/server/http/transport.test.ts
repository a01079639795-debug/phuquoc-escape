/**
 * Тесты транспортного слоя.
 *
 * Route handler'ы вызываются напрямую, без поднятия HTTP-сервера: проверяется
 * именно новый код — разбор сессии, CSRF, конверт ответа и перевод доменных
 * ошибок в коды состояния. Само дерево маршрутов проверяет `next build`.
 *
 * Запуск:  npm run test:http
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

const dataDir = mkdtempSync(join(tmpdir(), 'pq-http-'));
const port = 5900 + Math.floor(Math.random() * 90);
const DATABASE_URL = `postgresql://postgres:postgres@localhost:${port}/phuquoc?schema=public`;

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port,
  persistent: false,
});

let rateLimit: typeof import('../lib/rate-limit');
let db: typeof import('../db');

const ids = { manager: '', ivan: '', publishedSlug: '', publishedId: '' };

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
  rateLimit = await import('../lib/rate-limit');
  db = await import('../db');

  const manager = await db.prisma.user.findUniqueOrThrow({ where: { email: 'manager@phuquoc.demo' } });
  const ivan = await db.prisma.user.findUniqueOrThrow({ where: { email: 'ivan@example.com' } });
  const listing = await db.prisma.listing.findFirstOrThrow({ where: { slug: 'sunset-sands-resort' } });

  ids.manager = manager.id;
  ids.ivan = ivan.id;
  ids.publishedSlug = listing.slug;
  ids.publishedId = listing.id;
});

after(async () => {
  try { await db?.prisma.$disconnect(); } catch { /* уже закрыто */ }
  try { await pg.stop(); } catch { /* уже остановлен */ }
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* каталог занят */ }
});

// ── вызов маршрута ──────────────────────────────────────────────────────────

type RouteModule = Record<string, (req: Request, segment: { params: Promise<never> }) => Promise<Response>>;

type CallOptions = {
  params?: Record<string, string>;
  query?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Простая «банка» cookie, имитирующая браузер между запросами. */
  jar?: Map<string, string>;
};

type CallResult = {
  status: number;
  body: { data?: unknown; meta?: unknown; error?: { code: string; message: string; details?: unknown } };
  setCookies: string[];
};

/** Разбирает Set-Cookie и складывает значения в банку. */
function absorb(jar: Map<string, string> | undefined, setCookies: string[]) {
  if (!jar) return;
  for (const cookie of setCookies) {
    const [pair = ''] = cookie.split(';');
    const index = pair.indexOf('=');
    if (index === -1) continue;
    const name = pair.slice(0, index).trim();
    const value = decodeURIComponent(pair.slice(index + 1).trim());
    if (value === '') jar.delete(name);
    else jar.set(name, value);
  }
}

async function call(routePath: string, method: string, options: CallOptions = {}): Promise<CallResult> {
  const mod = (await import(`../../app/api/v1/${routePath}/route`)) as RouteModule;
  const handler = mod[method];
  assert.ok(handler, `маршрут ${routePath} не экспортирует ${method}`);

  const headers = new Headers(options.headers ?? {});
  if (options.jar && options.jar.size > 0) {
    headers.set('cookie', [...options.jar].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; '));
  }

  const init: RequestInit = { method, headers };
  if (options.body !== undefined) {
    headers.set('content-type', 'application/json');
    init.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }

  const url = `http://localhost/api/v1/${routePath}${options.query ?? ''}`;
  const response = await handler!(new Request(url, init), {
    params: Promise.resolve((options.params ?? {}) as never),
  });

  const setCookies = response.headers.getSetCookie?.() ?? [];
  absorb(options.jar, setCookies);

  return { status: response.status, body: (await response.json()) as CallResult['body'], setCookies };
}

/** Вход с сохранением cookie и подстановкой CSRF-заголовка в дальнейшие вызовы. */
async function loginAs(email: string, password = 'demo1234') {
  rateLimit.clearAllRateLimits();
  const jar = new Map<string, string>();
  const result = await call('auth/login', 'POST', { body: { email, password }, jar });
  assert.equal(result.status, 200, `вход ${email}: ${JSON.stringify(result.body)}`);
  const csrf = jar.get('pq_csrf');
  assert.ok(csrf, 'вход должен выдать CSRF-токен');
  return { jar, headers: { 'x-csrf-token': csrf! } };
}

// ═══════════════════════════════════════════════════════════════════════════

describe('Конверт ответа и публичные маршруты', () => {
  test('health отвечает 200', async () => {
    const res = await call('health', 'GET');
    assert.equal(res.status, 200);
    assert.equal((res.body.data as { status: string }).status, 'ok');
  });

  test('список объектов приходит с метаданными постраничной выдачи', async () => {
    const res = await call('listings', 'GET');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.meta, 'ожидали meta рядом с data');
  });

  test('карточка объекта доступна без входа', async () => {
    const res = await call('listings/[slug]', 'GET', { params: { slug: ids.publishedSlug } });
    assert.equal(res.status, 200);
    assert.equal((res.body.data as { slug: string }).slug, ids.publishedSlug);
  });

  test('несуществующий объект даёт 404 с кодом ошибки', async () => {
    const res = await call('listings/[slug]', 'GET', { params: { slug: 'no-such-hotel' } });
    assert.equal(res.status, 404);
    assert.equal(res.body.error?.code, 'LISTING_NOT_FOUND');
  });

  test('справочники отдаются локализованными', async () => {
    const res = await call('areas', 'GET');
    assert.equal(res.status, 200);
    const areas = res.body.data as { slug: string; name: string }[];
    assert.ok(areas.some((a) => a.slug === 'ong-lang' && a.name.length > 0));
  });
});

describe('Разбор строки запроса', () => {
  test('числовые параметры приводятся из строк', async () => {
    const res = await call('listings', 'GET', { query: '?page=2&perPage=5' });
    assert.equal(res.status, 200);
    const meta = res.body.meta as { page: number; perPage: number };
    assert.equal(meta.page, 2);
    assert.equal(meta.perPage, 5);
  });

  test('потолок perPage не обходится через строку запроса', async () => {
    const res = await call('listings', 'GET', { query: '?perPage=10000' });
    assert.equal((res.body.meta as { perPage: number }).perPage, 50);
  });

  test('повторяющийся параметр собирается в массив', async () => {
    const res = await call('listings', 'GET', { query: '?amenities=pool&amenities=spa&perPage=50' });
    assert.equal(res.status, 200);
    const single = await call('listings', 'GET', { query: '?amenities=pool&perPage=50' });
    const both = (res.body.meta as { total: number }).total;
    const one = (single.body.meta as { total: number }).total;
    assert.ok(one >= both, `по И должно быть не больше: ${both} против ${one}`);
  });

  test('фильтр по типу работает через строку запроса', async () => {
    const res = await call('listings', 'GET', { query: '?type=BIKE&perPage=50' });
    const rows = res.body.data as { type: string }[];
    assert.ok(rows.length > 0);
    assert.ok(rows.every((r) => r.type === 'BIKE'));
  });
});

describe('Сессия в cookie', () => {
  test('гость получает 401 на защищённом маршруте', async () => {
    const res = await call('me', 'GET');
    assert.equal(res.status, 401);
    assert.equal(res.body.error?.code, 'UNAUTHORIZED');
  });

  test('неверный пароль — 401, токен не выдаётся', async () => {
    rateLimit.clearAllRateLimits();
    const res = await call('auth/login', 'POST', { body: { email: 'ivan@example.com', password: 'nope-nope' } });
    assert.equal(res.status, 401);
    assert.equal(res.setCookies.length, 0);
  });

  test('вход выдаёт httpOnly-сессию и читаемый CSRF-токен', async () => {
    rateLimit.clearAllRateLimits();
    const jar = new Map<string, string>();
    const res = await call('auth/login', 'POST', { body: { email: 'ivan@example.com', password: 'demo1234' }, jar });

    assert.equal(res.status, 200);
    const session = res.setCookies.find((c) => c.startsWith('pq_session='));
    const csrf = res.setCookies.find((c) => c.startsWith('pq_csrf='));

    assert.ok(session?.includes('HttpOnly'), 'сессия обязана быть HttpOnly');
    assert.ok(session?.includes('SameSite=Lax'), 'сессия обязана быть SameSite=Lax');
    assert.ok(csrf && !csrf.includes('HttpOnly'), 'CSRF-токен обязан читаться скриптом');

    // токен сессии не должен попадать в тело ответа
    assert.ok(!JSON.stringify(res.body).includes(jar.get('pq_session')!));
  });

  test('с сессией профиль доступен', async () => {
    const { jar } = await loginAs('ivan@example.com');
    const res = await call('auth/me', 'GET', { jar });
    assert.equal(res.status, 200);
    assert.equal((res.body.data as { user: { id: string } }).user.id, ids.ivan);
  });

  test('выход снимает cookie и обрывает сессию', async () => {
    const { jar, headers } = await loginAs('ivan@example.com');
    const out = await call('auth/logout', 'POST', { jar, headers });
    assert.equal(out.status, 200);
    assert.equal(jar.get('pq_session'), undefined, 'cookie сессии должна быть удалена');

    const after = await call('me', 'GET', { jar });
    assert.equal(after.status, 401);
  });
});

describe('Защита CSRF', () => {
  test('изменяющий запрос с сессией, но без заголовка — 403', async () => {
    const { jar } = await loginAs('ivan@example.com');
    const res = await call('me', 'PATCH', { jar, body: { name: 'Новое Имя' } });
    assert.equal(res.status, 403);
    assert.equal(res.body.error?.code, 'FORBIDDEN');
  });

  test('изменяющий запрос с неверным токеном — 403', async () => {
    const { jar } = await loginAs('ivan@example.com');
    const res = await call('me', 'PATCH', {
      jar,
      headers: { 'x-csrf-token': 'forged-token' },
      body: { name: 'Новое Имя' },
    });
    assert.equal(res.status, 403);
  });

  test('с верным токеном запрос проходит', async () => {
    const { jar, headers } = await loginAs('ivan@example.com');
    const res = await call('me', 'PATCH', { jar, headers, body: { name: 'Иван Петрович' } });
    assert.equal(res.status, 200);
    assert.equal((res.body.data as { name: string }).name, 'Иван Петрович');
  });

  test('чтение с сессией токена не требует', async () => {
    const { jar } = await loginAs('ivan@example.com');
    const res = await call('me/requests', 'GET', { jar });
    assert.equal(res.status, 200);
  });

  test('гостевая заявка проходит без токена — подделывать нечего', async () => {
    rateLimit.clearAllRateLimits();
    const res = await call('requests', 'POST', {
      body: {
        type: 'HOTEL',
        listingId: ids.publishedId,
        contactName: 'Гость Транспортный',
        contactPhone: '+79990007766',
      },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.match((res.body.data as { publicCode: string }).publicCode, /^PQ-/);
  });
});

describe('Перевод доменных ошибок в коды состояния', () => {
  test('ошибка валидации — 422 с разбором по полям', async () => {
    rateLimit.clearAllRateLimits();
    const res = await call('auth/register', 'POST', {
      body: { email: 'not-an-email', password: 'xx', name: 'А' },
    });
    assert.equal(res.status, 422);
    assert.equal(res.body.error?.code, 'VALIDATION_FAILED');
    const details = res.body.error?.details as Record<string, string[]>;
    assert.ok(details.email && details.password, `ожидали разбор по полям: ${JSON.stringify(details)}`);
  });

  test('конфликт — 409', async () => {
    rateLimit.clearAllRateLimits();
    const res = await call('auth/register', 'POST', {
      body: { email: 'ivan@example.com', password: 'sup3r-secret', name: 'Дубль Иванов' },
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error?.code, 'EMAIL_ALREADY_REGISTERED');
  });

  test('нехватка прав — 403', async () => {
    const { jar } = await loginAs('ivan@example.com');
    const res = await call('admin/listings', 'GET', { jar });
    assert.equal(res.status, 403);
    assert.equal(res.body.error?.code, 'FORBIDDEN');
  });

  test('менеджеру админский список доступен', async () => {
    const { jar } = await loginAs('manager@phuquoc.demo');
    const res = await call('admin/listings', 'GET', { jar });
    assert.equal(res.status, 200);
    assert.ok((res.body.meta as { total: number }).total > 0);
  });

  test('некорректный UUID в пути — 400, а не 500', async () => {
    const { jar } = await loginAs('manager@phuquoc.demo');
    const res = await call('admin/listings/[id]', 'GET', { jar, params: { id: 'не-uuid' } });
    assert.equal(res.status, 400);
    assert.equal(res.body.error?.code, 'INVALID_IDENTIFIER');
  });

  test('битый JSON — 422, а не падение', async () => {
    rateLimit.clearAllRateLimits();
    const res = await call('requests', 'POST', { body: '{ это не json' });
    assert.equal(res.status, 422);
    assert.equal(res.body.error?.code, 'VALIDATION_FAILED');
  });

  test('превышение частоты — 429', async () => {
    rateLimit.clearAllRateLimits();
    let status = 0;
    for (let i = 0; i < 20; i++) {
      const res = await call('auth/login', 'POST', {
        body: { email: 'maria@example.com', password: 'wrong-one' },
        headers: { 'x-forwarded-for': '203.0.113.9' },
      });
      status = res.status;
      if (status === 429) break;
    }
    assert.equal(status, 429);
  });
});

describe('Идемпотентность через заголовок', () => {
  test('повтор с тем же ключом не создаёт вторую заявку', async () => {
    rateLimit.clearAllRateLimits();
    const body = {
      type: 'BIKE',
      contactName: 'Повторная Отправка',
      contactPhone: '+79990008877',
    };
    const headers = { 'idempotency-key': 'http-test-key-1' };

    const first = await call('requests', 'POST', { body, headers });
    const second = await call('requests', 'POST', { body, headers });

    assert.equal(first.status, 201);
    assert.equal(
      (first.body.data as { publicCode: string }).publicCode,
      (second.body.data as { publicCode: string }).publicCode,
    );

    const count = await db.prisma.request.count({ where: { contactPhone: '+79990008877' } });
    assert.equal(count, 1);
  });
});

describe('Права в админских маршрутах', () => {
  test('менеджер не может менять роли — это право администратора', async () => {
    const { jar, headers } = await loginAs('manager@phuquoc.demo');
    const res = await call('admin/users/[id]/role', 'PUT', {
      jar, headers, params: { id: ids.ivan }, body: { role: 'ADMIN' },
    });
    assert.equal(res.status, 403);
  });

  test('неизвестное значение роли — 422, а не сбой базы', async () => {
    const { jar, headers } = await loginAs('admin@phuquoc.demo');
    const res = await call('admin/users/[id]/role', 'PUT', {
      jar, headers, params: { id: ids.ivan }, body: { role: 'SUPERUSER' },
    });
    assert.equal(res.status, 422);
  });

  test('администратор видит журнал аудита, менеджер — нет', async () => {
    const admin = await loginAs('admin@phuquoc.demo');
    const okRes = await call('admin/audit', 'GET', { jar: admin.jar });
    assert.equal(okRes.status, 200);

    const manager = await loginAs('manager@phuquoc.demo');
    const denied = await call('admin/audit', 'GET', { jar: manager.jar });
    assert.equal(denied.status, 403);
  });
});
