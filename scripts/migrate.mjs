import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.log('[migrate] DATABASE_URL не задан — миграция пропущена.');
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
