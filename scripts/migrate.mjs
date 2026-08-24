import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

function connectionUrl() {
  const direct = process.env.DATABASE_URL?.trim();
  if (direct) return direct;

  const host = process.env.DB_HOST?.trim();
  const name = process.env.DB_NAME?.trim();
  const user = process.env.DB_USER?.trim();
  const password = process.env.DB_PASSWORD ?? '';
  const port = process.env.DB_PORT?.trim() || '5432';

  if (!host || !name || !user || !password) return '';

  const url = new URL('postgres://localhost');
  url.hostname = host;
  url.port = port;
  url.username = user;
  url.password = password;
  url.pathname = `/${name}`;
  url.searchParams.set('sslmode', process.env.DB_SSLMODE?.trim() || 'disable');
  return url.toString();
}

const url = connectionUrl();
if (!url) {
  console.log('[migrate] PostgreSQL не настроен — миграция пропущена.');
  process.exit(0);
}

const sql = postgres(url, {
  max: 1,
  ssl: url.includes('sslmode=disable') ? false : 'require',
});

try {
  const file = path.join(process.cwd(), 'db', 'migrations', '001_init.sql');
  const migration = await fs.readFile(file, 'utf8');
  await sql.unsafe(migration);
  console.log('[migrate] Схема базы готова.');
} finally {
  await sql.end();
}
