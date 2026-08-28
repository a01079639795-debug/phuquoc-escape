/**
 * Прогон сида на настоящем PostgreSQL с проверкой результата.
 *
 * Поднимает локальный сервер из npm-пакета (Docker не нужен), применяет
 * миграцию, запускает prisma/seed.ts и проверяет, что данные соответствуют
 * согласованным объёмам и инвариантам схемы.
 *
 * Запуск:  node prisma/verify-seed.mjs
 */

import EmbeddedPostgres from 'embedded-postgres';
import pgLib from 'pg';
import { spawn } from 'node:child_process';
import { readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const PRISMA_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(PRISMA_DIR, '..');
const MIGRATION = join(PRISMA_DIR, 'migrations', '20260824225039_init', 'migration.sql');

const dataDir = mkdtempSync(join(tmpdir(), 'pq-seed-'));
const port = 5600 + Math.floor(Math.random() * 300);
const DATABASE_URL = `postgresql://postgres:postgres@localhost:${port}/phuquoc?schema=public`;

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port,
  persistent: false,
});

const results = [];
const expect = (ok, msg) => results.push([Boolean(ok), msg]);

let db;

try {
  console.log(`Поднимаю PostgreSQL на порту ${port}...`);
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('phuquoc');

  // Строка подключения задаётся явно: getPgClient() возвращает клиент базы
  // по умолчанию, и присвоение .database после создания не применяется.
  db = new pgLib.Client({ connectionString: DATABASE_URL });
  await db.connect();

  await db.query(readFileSync(MIGRATION, 'utf8'));
  console.log('Миграция применена. Запускаю сид...\n');

  // ── запуск сида ───────────────────────────────────────────────────────────
  const code = await new Promise((res) => {
    const child = spawn('npx', ['--no-install', 'tsx', 'prisma/seed.ts'], {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL },
      stdio: 'inherit',
      shell: true,
    });
    child.on('close', res);
  });

  if (code !== 0) {
    console.error(`\nСид завершился с кодом ${code}`);
    process.exitCode = 1;
    throw new Error('seed failed');
  }

  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  const all = async (sql, params = []) => (await db.query(sql, params)).rows;
  const n = async (sql, params = []) => Number((await one(sql, params)).n);

  console.log('\n── Проверка согласованных объёмов ──');

  const areas = await n(`select count(*)::int n from "Area"`);
  const amenities = await n(`select count(*)::int n from "Amenity"`);
  const hotels = await n(`select count(*)::int n from "Listing" where type='HOTEL'`);
  const bikes = await n(`select count(*)::int n from "Listing" where type='BIKE'`);
  const users = await n(`select count(*)::int n from "User"`);
  const requests = await n(`select count(*)::int n from "Request"`);
  const units = await n(`select count(*)::int n from "ListingUnit"`);
  const images = await n(`select count(*)::int n from "ListingImage"`);

  expect(areas >= 5, `Районов Фукуока: ${areas} (нужно несколько)`);
  expect(hotels >= 15 && hotels <= 20, `Отелей: ${hotels} (согласовано 15–20)`);
  expect(bikes >= 10 && bikes <= 15, `Байков: ${bikes} (согласовано 10–15)`);
  expect(amenities >= 20, `Словарь удобств и опций: ${amenities} записей`);
  expect(units > 0, `Юнитов (типы номеров и тарифы аренды): ${units}`);
  expect(images > 0, `Изображений: ${images}`);
  expect(users >= 5, `Пользователей: ${users}`);
  expect(requests >= 5, `Заявок: ${requests}`);

  // роли и статусы — админке нужны все состояния
  const roles = (await all(`select role, count(*)::int n from "User" group by role order by role`))
    .map((r) => `${r.role}:${r.n}`).join(', ');
  const haveAllRoles = ['ADMIN', 'MANAGER', 'USER'].every((r) => roles.includes(r + ':'));
  expect(haveAllRoles, `Роли представлены — ${roles}`);

  const statuses = (await all(`select status, count(*)::int n from "Listing" group by status order by status`))
    .map((r) => `${r.status}:${r.n}`).join(', ');
  expect(statuses.includes('PUBLISHED') && statuses.includes('DRAFT') && statuses.includes('ARCHIVED'),
    `Статусы объектов покрыты — ${statuses}`);

  const rStatuses = (await all(`select status, count(*)::int n from "Request" group by status order by status`))
    .map((r) => `${r.status}:${r.n}`).join(', ');
  expect(rStatuses.split(',').length >= 4, `Статусы заявок покрыты — ${rStatuses}`);

  console.log('\n── Проверка инвариантов данных ──');

  // ровно одна обложка на объект
  const badCovers = await all(`
    select l.slug, count(*) filter (where i."isCover")::int n
    from "Listing" l join "ListingImage" i on i."listingId"=l.id
    group by l.slug having count(*) filter (where i."isCover") <> 1`);
  expect(badCovers.length === 0,
    badCovers.length === 0
      ? 'У каждого объекта ровно одна обложка'
      : `Объекты с неверным числом обложек: ${badCovers.map((r) => `${r.slug}=${r.n}`).join(', ')}`);

  // priceFromAmount = минимум по активным юнитам
  const badPrice = await all(`
    select l.slug, l."priceFromAmount"::text a, min(u."priceAmount")::text b
    from "Listing" l join "ListingUnit" u on u."listingId"=l.id and u."isActive"
    group by l.slug, l."priceFromAmount"
    having l."priceFromAmount" <> min(u."priceAmount")`);
  expect(badPrice.length === 0,
    badPrice.length === 0
      ? 'priceFromAmount везде равен минимальной цене активного юнита'
      : `Расхождение цены «от»: ${badPrice.map((r) => `${r.slug} ${r.a}≠${r.b}`).join(', ')}`);

  // каждый объект имеет перевод, юниты и картинки
  const noTr = await n(`select count(*)::int n from "Listing" l where not exists (select 1 from "ListingTranslation" t where t."listingId"=l.id)`);
  const noUnits = await n(`select count(*)::int n from "Listing" l where not exists (select 1 from "ListingUnit" u where u."listingId"=l.id)`);
  const noImg = await n(`select count(*)::int n from "Listing" l where not exists (select 1 from "ListingImage" i where i."listingId"=l.id)`);
  const noAmen = await n(`select count(*)::int n from "Listing" l where not exists (select 1 from "ListingAmenity" a where a."listingId"=l.id)`);
  expect(noTr === 0, `Все объекты имеют перевод (без перевода: ${noTr})`);
  expect(noUnits === 0, `Все объекты имеют хотя бы один юнит (без юнитов: ${noUnits})`);
  expect(noImg === 0, `Все объекты имеют изображения (без фото: ${noImg})`);
  expect(noAmen === 0, `Все объекты имеют удобства (без удобств: ${noAmen})`);

  // детали типа соответствуют типу объекта
  const wrongDetails = await n(`
    select count(*)::int n from "Listing" l
    where (l.type='HOTEL' and not exists (select 1 from "HotelDetails" d where d."listingId"=l.id))
       or (l.type='BIKE'  and not exists (select 1 from "BikeDetails"  d where d."listingId"=l.id))
       or (l.type='HOTEL' and exists (select 1 from "BikeDetails"  d where d."listingId"=l.id))
       or (l.type='BIKE'  and exists (select 1 from "HotelDetails" d where d."listingId"=l.id))`);
  expect(wrongDetails === 0, `Каждый объект имеет ровно свою таблицу деталей (нарушений: ${wrongDetails})`);

  // единицы тарификации соответствуют типу
  const wrongUnit = await n(`
    select count(*)::int n from "ListingUnit" u join "Listing" l on l.id=u."listingId"
    where (l.type='HOTEL' and u."priceUnit" <> 'NIGHT') or (l.type='BIKE' and u."priceUnit" <> 'DAY')`);
  expect(wrongUnit === 0, `Отели тарифицируются за ночь, байки за сутки (нарушений: ${wrongUnit})`);

  // Депозиты в USD хранятся в центах. Значение 150 вместо 15000 означало бы
  // залог в полтора доллара — именно такая ошибка была допущена и исправлена.
  const usd = await all(`
    select b."depositAmount"::text a, l.slug
    from "BikeDetails" b join "Listing" l on l.id = b."listingId"
    where b."depositCurrency" = 'USD' and b."depositAmount" is not null`);
  const suspicious = usd.filter((r) => Number(r.a) < 1000);
  expect(
    suspicious.length === 0,
    suspicious.length === 0
      ? `Депозиты в USD записаны в центах (${usd.length} шт.)`
      : `Депозиты в USD похожи на доллары, а не на центы: ${suspicious.map((r) => r.slug).join(', ')}`,
  );

  // деньги целые и положительные
  const badMoney = await n(`select count(*)::int n from "ListingUnit" where "priceAmount" <= 0`);
  expect(badMoney === 0, `Все цены положительные (нарушений: ${badMoney})`);

  // контент только на одном языке — как договорились для MVP
  const locales = (await all(`select distinct locale from "ListingTranslation"`)).map((r) => r.locale);
  expect(locales.length === 1 && locales[0] === 'RU',
    `Контент объектов на одном языке: ${locales.join(', ')}`);

  // разброс цен — каталог должен выглядеть живым
  const span = await one(`
    select min("priceFromAmount")::text lo, max("priceFromAmount")::text hi
    from "Listing" where type='HOTEL'`);
  const bikeSpan = await one(`
    select min("priceFromAmount")::text lo, max("priceFromAmount")::text hi
    from "Listing" where type='BIKE'`);
  expect(Number(span.hi) / Number(span.lo) >= 10,
    `Отели: от ${Number(span.lo).toLocaleString('ru')} до ${Number(span.hi).toLocaleString('ru')} VND за ночь`);
  expect(Number(bikeSpan.hi) / Number(bikeSpan.lo) >= 2,
    `Байки: от ${Number(bikeSpan.lo).toLocaleString('ru')} до ${Number(bikeSpan.hi).toLocaleString('ru')} VND за сутки`);

  // заявки с датами — то, что конвертируется в бронь на этапе 2
  const withDates = await n(`select count(*)::int n from "Request" where "dateFrom" is not null and "dateTo" is not null`);
  expect(withDates === requests, `Все заявки содержат даты (${withDates} из ${requests})`);

  const guestReq = await n(`select count(*)::int n from "Request" where "userId" is null`);
  const userReq = await n(`select count(*)::int n from "Request" where "userId" is not null`);
  expect(guestReq > 0 && userReq > 0, `Заявки и от гостей (${guestReq}), и от зарегистрированных (${userReq})`);

  // повторный запуск сида не должен падать на уникальных ключах
  console.log('\n── Идемпотентность: повторный запуск сида ──');
  const code2 = await new Promise((res) => {
    const child = spawn('npx', ['--no-install', 'tsx', 'prisma/seed.ts'], {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL },
      stdio: ['ignore', 'ignore', 'inherit'],
      shell: true,
    });
    child.on('close', res);
  });
  const listingsAfter = await n(`select count(*)::int n from "Listing"`);
  expect(code2 === 0 && listingsAfter === hotels + bikes,
    `Повторный запуск проходит и не дублирует данные (объектов: ${listingsAfter})`);
} finally {
  try { if (db) await db.end(); } catch {}
  try { await pg.stop(); } catch {}
  try { rmSync(dataDir, { recursive: true, force: true }); } catch {}
}

const failed = results.filter(([ok]) => !ok);
console.log('');
for (const [ok, msg] of results) console.log(`  [${ok ? 'OK' : '!!'}] ${msg}`);

if (failed.length) {
  console.log(`\nИтог: ${results.length - failed.length} из ${results.length}, есть провалы.`);
  process.exit(1);
}
console.log(`\nИтог: все ${results.length} проверок пройдены.`);
