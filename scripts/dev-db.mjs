/**
 * Локальная база для разработки без Docker.
 *
 * Поднимает PostgreSQL из npm-пакета в каталоге .devdb, при первом запуске
 * применяет миграцию и сид, дальше просто держит сервер. Нужен, чтобы
 * `next dev` было чем наполнять на машине, где Docker не поставлен.
 *
 * Запуск:  npm run dev:db     (в отдельном окне, оставить работающим)
 * Данные:  postgresql://postgres:postgres@localhost:5433/phuquoc
 */

import EmbeddedPostgres from 'embedded-postgres';
import pgLib from 'pg';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, '.devdb');
const PORT = 5433;
const DATABASE_URL = `postgresql://postgres:postgres@localhost:${PORT}/phuquoc?schema=public`;

const migrationsDir = join(ROOT, 'prisma/migrations');
const migration = join(
  migrationsDir,
  '20260824225039_init',
  'migration.sql',
);

const fresh = !existsSync(DATA_DIR);
if (fresh) mkdirSync(DATA_DIR, { recursive: true });

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: 'postgres',
  password: 'postgres',
  port: PORT,
  persistent: true,
});

if (fresh) {
  console.log('Первый запуск: разворачиваю базу...');
  await pg.initialise();
}

await pg.start();

if (fresh) {
  await pg.createDatabase('phuquoc');

  const client = new pgLib.Client({ connectionString: DATABASE_URL });
  await client.connect();
  await client.query(readFileSync(migration, 'utf8'));
  await client.end();

  console.log('Миграция применена, наполняю демо-данными...');
  await new Promise((done) => {
    const child = spawn('npx', ['--no-install', 'tsx', 'prisma/seed.ts'], {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL },
      stdio: 'inherit',
      shell: true,
    });
    child.on('close', done);
  });
}

console.log(`\nБаза готова: ${DATABASE_URL}`);
console.log('Оставьте это окно открытым. Остановить — Ctrl+C.\n');

const stop = async () => {
  console.log('\nОстанавливаю базу...');
  try {
    await pg.stop();
  } catch {
    // Сервер мог уже завершиться — это не ошибка при выходе.
  }
  process.exit(0);
};

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

// Держим процесс живым.
setInterval(() => {}, 1 << 30);
