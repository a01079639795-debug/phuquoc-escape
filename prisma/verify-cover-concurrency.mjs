/**
 * Тест на гонку при смене обложки объекта.
 *
 * Единственность обложки (ListingImage.isCover) держит не база, а service layer —
 * Prisma не поддерживает частичные unique-индексы. Значит, корректность зависит
 * от того, КАК именно сервис выполняет смену обложки. Этот тест показывает, что
 * очевидный способ ломается под нагрузкой, а правильный — держит.
 *
 * Нужен настоящий многоконнектный PostgreSQL: PGlite однопользовательский и
 * параллельные транзакции на нём невоспроизводимы. Сервер поднимается локально
 * из npm-пакета, Docker не требуется.
 *
 * Запуск:  node prisma/verify-cover-concurrency.mjs
 */

import EmbeddedPostgres from 'embedded-postgres';
import pgLib from 'pg';
import { readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const PRISMA_DIR = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(PRISMA_DIR, 'migrations', '20260824225039_init', 'migration.sql');

const LISTING = '33333333-3333-3333-3333-333333333333';
const IMG_A = 'aaaaaaaa-0000-0000-0000-000000000001'; // стартовая обложка
const IMG_B = 'bbbbbbbb-0000-0000-0000-000000000002'; // ставит поток 1
const IMG_C = 'cccccccc-0000-0000-0000-000000000003'; // ставит поток 2

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dataDir = mkdtempSync(join(tmpdir(), 'pq-race-'));
const port = 5400 + Math.floor(Math.random() * 500);

const DATABASE_URL = `postgresql://postgres:postgres@localhost:${port}/phuquoc?schema=public`;

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port,
  persistent: false,
});

const results = [];
let c1, c2, admin;

try {
  console.log(`Поднимаю PostgreSQL на порту ${port}...`);
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('phuquoc');

  // Строка подключения задаётся явно: getPgClient() возвращает клиент базы
  // по умолчанию, и присвоение .database после создания не применяется.
  const connect = async () => {
    const c = new pgLib.Client({ connectionString: DATABASE_URL });
    await c.connect();
    return c;
  };

  admin = await connect();
  const version = (await admin.query('select version()')).rows[0].version;
  console.log(version.split(',')[0]);

  await admin.query(readFileSync(MIGRATION, 'utf8'));
  console.log('Миграция применена.\n');

  c1 = await connect();
  c2 = await connect();

  // ── подготовка исходного состояния ────────────────────────────────────────
  const reset = async () => {
    await admin.query(`DELETE FROM "ListingImage"`);
    await admin.query(`DELETE FROM "MediaAsset"`);
    await admin.query(`DELETE FROM "Listing"`);
    await admin.query(
      `INSERT INTO "Listing"(id,type,slug,"updatedAt") VALUES ($1,'HOTEL','villa-sunrise',now())`,
      [LISTING],
    );
    for (const [i, img] of [IMG_A, IMG_B, IMG_C].entries()) {
      const media = `dddddddd-0000-0000-0000-00000000000${i + 1}`;
      await admin.query(
        `INSERT INTO "MediaAsset"(id,"storageKey",url,mime,width,height,"sizeBytes")
         VALUES ($1,$2,'https://cdn.example/x.jpg','image/jpeg',1600,900,240000)`,
        [media, `listings/${i + 1}.jpg`],
      );
      await admin.query(
        `INSERT INTO "ListingImage"(id,"listingId","mediaId","sortOrder","isCover")
         VALUES ($1,$2,$3,$4,$5)`,
        [img, LISTING, media, i, img === IMG_A],
      );
    }
  };

  const coverCount = async () =>
    (await admin.query(`SELECT count(*)::int n FROM "ListingImage" WHERE "isCover"`)).rows[0].n;

  const UNSET = `UPDATE "ListingImage" SET "isCover"=false WHERE "listingId"=$1 AND "isCover"=true`;
  const SET = `UPDATE "ListingImage" SET "isCover"=true WHERE id=$1`;
  const LOCK = `SELECT id FROM "Listing" WHERE id=$1 FOR UPDATE`;

  // ── СЦЕНАРИЙ 1: наивный сервис, без блокировки родителя ──────────────────
  // Два менеджера одновременно назначают обложкой разные фото.
  await reset();

  await c1.query('BEGIN');
  await c2.query('BEGIN');

  await c1.query(UNSET, [LISTING]); // снимает флаг с A, держит блокировку строки A
  const pending2 = c2.query(UNSET, [LISTING]); // упирается в блокировку строки A
  await sleep(150);

  await c1.query(SET, [IMG_B]);
  await c1.query('COMMIT');

  // поток 2 разблокировался: строка A уже isCover=false и под условие не подходит,
  // а строку B он не видел — её снимок на момент старта UPDATE был isCover=false
  await pending2;
  await c2.query(SET, [IMG_C]);
  await c2.query('COMMIT');

  const naive = await coverCount();
  if (naive === 2) {
    results.push([
      true,
      'Наивный сервис (UNSET + SET без блокировки) действительно оставляет ДВЕ обложки',
    ]);
  } else {
    results.push([
      false,
      `Наивный сценарий дал ${naive} обложек вместо 2 — гонка не воспроизвелась, тест не доказателен`,
    ]);
  }

  // ── СЦЕНАРИЙ 2: правильный рецепт — блокировка родительской строки ───────
  // Тот же порядок действий, но каждая транзакция начинается с SELECT ... FOR UPDATE
  // по строке Listing. Это сериализует смену обложки в пределах одного объекта.
  await reset();

  await c1.query('BEGIN');
  await c2.query('BEGIN');

  await c1.query(LOCK, [LISTING]);
  const lock2 = c2.query(LOCK, [LISTING]); // ждёт коммита первой транзакции
  await sleep(150);

  await c1.query(UNSET, [LISTING]);
  await c1.query(SET, [IMG_B]);
  await c1.query('COMMIT');

  await lock2; // получил блокировку, дальше работает с уже актуальными данными
  await c2.query(UNSET, [LISTING]); // снимает флаг с B
  await c2.query(SET, [IMG_C]);
  await c2.query('COMMIT');

  const locked = await coverCount();
  const winner = (
    await admin.query(`SELECT id FROM "ListingImage" WHERE "isCover"`)
  ).rows.map((r) => r.id);

  results.push([
    locked === 1,
    locked === 1
      ? 'С блокировкой строки Listing (SELECT … FOR UPDATE) остаётся ровно ОДНА обложка'
      : `С блокировкой осталось ${locked} обложек — рецепт не работает`,
  ]);
  results.push([
    winner.length === 1 && winner[0] === IMG_C,
    winner.length === 1 && winner[0] === IMG_C
      ? 'Побеждает последняя завершившаяся транзакция — «последний выигрывает», как и ожидает пользователь'
      : `Обложкой оказалось: ${JSON.stringify(winner)}`,
  ]);

  // ── СЦЕНАРИЙ 3: та же блокировка при одновременном старте десяти запросов ─
  await reset();
  const clients = [];
  for (let i = 0; i < 10; i++) clients.push(await connect());

  await Promise.all(
    clients.map(async (c, i) => {
      const target = [IMG_A, IMG_B, IMG_C][i % 3];
      await c.query('BEGIN');
      await c.query(LOCK, [LISTING]);
      await c.query(UNSET, [LISTING]);
      await c.query(SET, [target]);
      await c.query('COMMIT');
    }),
  );
  for (const c of clients) await c.end();

  const stress = await coverCount();
  results.push([
    stress === 1,
    stress === 1
      ? 'Десять одновременных запросов на смену обложки — по-прежнему ровно одна обложка'
      : `Десять одновременных запросов оставили ${stress} обложек`,
  ]);
} finally {
  for (const c of [c1, c2, admin]) {
    try { if (c) await c.end(); } catch {}
  }
  try { await pg.stop(); } catch {}
  try { rmSync(dataDir, { recursive: true, force: true }); } catch {}
}

// ── итог ────────────────────────────────────────────────────────────────────
const failed = results.filter(([ok]) => !ok);
for (const [ok, msg] of results) console.log(`  [${ok ? 'OK' : '!!'}] ${msg}`);

console.log(
  `\nВывод: смена обложки ОБЯЗАНА выполняться в транзакции, начинающейся с\n` +
    `SELECT id FROM "Listing" WHERE id = ? FOR UPDATE. Без этой блокировки\n` +
    `параллельные запросы оставляют две обложки — сценарий 1 это воспроизводит.`,
);

if (failed.length) {
  console.log(`\nИтог: ${results.length - failed.length} из ${results.length} — есть провалы.`);
  process.exit(1);
}
console.log(`\nИтог: все ${results.length} проверок пройдены.`);
