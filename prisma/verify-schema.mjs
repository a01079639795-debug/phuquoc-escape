/**
 * Проверка init-миграции без Docker и без установленного PostgreSQL.
 *
 * Поднимает настоящий движок Postgres в WASM (PGlite), применяет migration.sql
 * и проверяет инварианты, заданные схемой: правила каскадного удаления и
 * ограничения уникальности. Это не тесты приложения — это проверка того, что
 * БД действительно защищает те правила, ради которых они объявлены.
 *
 * Запуск:  node prisma/verify-schema.mjs
 */

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PRISMA_DIR = dirname(fileURLToPath(import.meta.url));

// ── находим последнюю миграцию ───────────────────────────────────────────────
const migrationsDir = join(PRISMA_DIR, 'migrations');
const migrations = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

if (migrations.length === 0) {
  console.error('Миграции не найдены в prisma/migrations');
  process.exit(1);
}

const db = new PGlite();
const passed = [];
const failed = [];

// ── применяем все миграции по порядку ────────────────────────────────────────
for (const name of migrations) {
  const sql = readFileSync(join(migrationsDir, name, 'migration.sql'), 'utf8');
  try {
    await db.exec(sql);
    console.log(`[OK] миграция применена: ${name}`);
  } catch (e) {
    console.error(`[!!] миграция упала: ${name}\n     ${e.message}`);
    process.exit(1);
  }
}

// ── структура ────────────────────────────────────────────────────────────────
const count = async (sql) => (await db.query(sql)).rows[0].n;

const tables = await count(
  `select count(*)::int n from information_schema.tables where table_schema='public'`,
);
const indexes = await count(
  `select count(*)::int n from pg_indexes where schemaname='public'`,
);
const fks = await count(
  `select count(*)::int n from information_schema.table_constraints
   where table_schema='public' and constraint_type='FOREIGN KEY'`,
);

console.log(`\nСтруктура: таблиц ${tables}, индексов ${indexes}, внешних ключей ${fks}\n`);

// ── типы колонок: деньги и даты ──────────────────────────────────────────────
const wrongMoney = await db.query(`
  select table_name||'.'||column_name as c, data_type
  from information_schema.columns
  where table_schema='public'
    and (column_name like '%Amount' or column_name like '%Price%')
    and data_type <> 'bigint'`);

const wrongTs = await db.query(`
  select table_name||'.'||column_name as c, data_type
  from information_schema.columns
  where table_schema='public'
    and column_name in ('createdAt','updatedAt','expiresAt','publishedAt')
    and data_type <> 'timestamp with time zone'`);

const stayDates = await db.query(`
  select table_name||'.'||column_name as c
  from information_schema.columns
  where table_schema='public' and data_type='date'`);

if (wrongMoney.rows.length === 0) passed.push('Все денежные колонки — bigint (целые минорные единицы)');
else failed.push('Денежные колонки не bigint: ' + wrongMoney.rows.map((r) => r.c).join(', '));

if (wrongTs.rows.length === 0) passed.push('Все отметки времени — timestamptz');
else failed.push('Отметки времени без таймзоны: ' + wrongTs.rows.map((r) => r.c).join(', '));

if (stayDates.rows.length === 2) passed.push('Даты аренды — тип date: ' + stayDates.rows.map((r) => r.c).join(', '));
else failed.push('Ожидалось 2 колонки типа date, найдено ' + stayDates.rows.length);

// ── подготовка данных для проверки инвариантов ───────────────────────────────
const AREA = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';
const LISTING = '33333333-3333-3333-3333-333333333333';
const AMENITY = '44444444-4444-4444-4444-444444444444';
const MEDIA = '55555555-5555-5555-5555-555555555555';
const REQUEST = '66666666-6666-6666-6666-666666666666';

await db.exec(`
INSERT INTO "Area"(id,slug,"updatedAt") VALUES ('${AREA}','ong-lang',now());
INSERT INTO "AreaTranslation"(id,"areaId",locale,name) VALUES (gen_random_uuid(),'${AREA}','RU','Онг Ланг');
INSERT INTO "User"(id,email,"passwordHash",name,"updatedAt") VALUES ('${USER}','manager@example.com','argon2-hash','Менеджер',now());
INSERT INTO "Listing"(id,type,slug,"areaId","updatedAt") VALUES ('${LISTING}','HOTEL','villa-sunrise','${AREA}',now());
INSERT INTO "ListingTranslation"(id,"listingId",locale,title) VALUES (gen_random_uuid(),'${LISTING}','RU','Вилла Sunrise');
INSERT INTO "ListingUnit"(id,"listingId","priceAmount","priceUnit","updatedAt") VALUES (gen_random_uuid(),'${LISTING}',1800000,'NIGHT',now());
INSERT INTO "Amenity"(id,code,"updatedAt") VALUES ('${AMENITY}','wifi',now());
INSERT INTO "ListingAmenity"("listingId","amenityId") VALUES ('${LISTING}','${AMENITY}');
INSERT INTO "MediaAsset"(id,"storageKey",url,mime,width,height,"sizeBytes")
  VALUES ('${MEDIA}','listings/1.jpg','https://cdn.example/1.jpg','image/jpeg',1600,900,240000);
INSERT INTO "ListingImage"(id,"listingId","mediaId","isCover") VALUES (gen_random_uuid(),'${LISTING}','${MEDIA}',true);
INSERT INTO "Request"(id,"publicCode",type,"contactName","contactPhone","listingId","userId","dateFrom","dateTo","updatedAt")
  VALUES ('${REQUEST}','PQ-TEST1','HOTEL','Иван Петров','+84900000000','${LISTING}','${USER}','2026-09-10','2026-09-14',now());
`);

/** Ожидаем, что операция будет отклонена базой. */
const mustReject = async (name, sql) => {
  try {
    await db.exec(sql);
    failed.push(`${name} — операция ПРОШЛА, хотя должна была быть отклонена`);
  } catch {
    passed.push(name);
  }
};

await mustReject(
  'Район с объектами нельзя удалить (RESTRICT)',
  `DELETE FROM "Area" WHERE id='${AREA}'`,
);
await mustReject(
  'Используемое медиа нельзя удалить (RESTRICT)',
  `DELETE FROM "MediaAsset" WHERE id='${MEDIA}'`,
);
await mustReject(
  'Автора комментария нельзя удалить, пока есть заметки (RESTRICT)',
  `INSERT INTO "RequestNote"(id,"requestId","authorId",body) VALUES (gen_random_uuid(),'${REQUEST}','${USER}','заметка');
   DELETE FROM "User" WHERE id='${USER}'`,
);
await mustReject(
  'Дубль перевода listing+locale отклонён (UNIQUE)',
  `INSERT INTO "ListingTranslation"(id,"listingId",locale,title) VALUES (gen_random_uuid(),'${LISTING}','RU','Дубль')`,
);
await mustReject(
  'Дубль связи объект+удобство отклонён (составной PK)',
  `INSERT INTO "ListingAmenity"("listingId","amenityId") VALUES ('${LISTING}','${AMENITY}')`,
);
await mustReject(
  'Дубль publicCode заявки отклонён (UNIQUE)',
  `INSERT INTO "Request"(id,"publicCode",type,"contactName","contactPhone","updatedAt")
   VALUES (gen_random_uuid(),'PQ-TEST1','BIKE','Пётр','+8490','now'::timestamptz)`,
);
await mustReject(
  'Дубль email пользователя отклонён (UNIQUE)',
  `INSERT INTO "User"(id,email,"passwordHash",name,"updatedAt")
   VALUES (gen_random_uuid(),'manager@example.com','h','Клон','now'::timestamptz)`,
);

// ── главный инвариант: заявка переживает удаление объекта и аккаунта ─────────
await db.exec(`DELETE FROM "RequestNote"`); // снимаем RESTRICT, проверенный выше
await db.exec(`DELETE FROM "Listing" WHERE id='${LISTING}'`);
await db.exec(`DELETE FROM "User" WHERE id='${USER}'`);

const r = await db.query(
  `SELECT "publicCode","listingId","userId","dateFrom" FROM "Request" WHERE id='${REQUEST}'`,
);
if (r.rows.length === 1 && r.rows[0].listingId === null && r.rows[0].userId === null) {
  passed.push('Заявка пережила удаление объекта и аккаунта, ссылки обнулены (SET NULL)');
} else {
  failed.push('Заявка НЕ пережила удаление объекта/аккаунта: ' + JSON.stringify(r.rows));
}

// ── каскады: части объекта удалились вместе с ним ───────────────────────────
for (const [table, label] of [
  ['ListingTranslation', 'переводы'],
  ['ListingUnit', 'юниты'],
  ['ListingAmenity', 'связи с удобствами'],
  ['ListingImage', 'привязки изображений'],
]) {
  const n = await count(`select count(*)::int n from "${table}"`);
  if (n === 0) passed.push(`Каскад: ${label} удалены вместе с объектом`);
  else failed.push(`Каскад не сработал: в ${table} осталось ${n} строк`);
}

// файл при этом остался в медиатеке — удаление привязки не удаляет MediaAsset
const media = await count(`select count(*)::int n from "MediaAsset"`);
if (media === 1) passed.push('Файл остался в медиатеке после удаления объекта');
else failed.push(`MediaAsset удалён вместе с объектом (осталось ${media})`);

// ── итог ─────────────────────────────────────────────────────────────────────
console.log('ПРОЙДЕНО:');
for (const p of passed) console.log('  [OK] ' + p);

if (failed.length > 0) {
  console.log('\nПРОВАЛЕНО:');
  for (const f of failed) console.log('  [!!] ' + f);
  console.log(`\nИтог: ${passed.length} пройдено, ${failed.length} провалено.`);
  process.exit(1);
}

console.log(`\nИтог: все ${passed.length} проверок пройдены.`);
