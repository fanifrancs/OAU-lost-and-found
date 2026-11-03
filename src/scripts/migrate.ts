import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../config/db';

async function migrate(): Promise<void> {
  const migrationsDir = path.resolve(process.cwd(), 'database/migrations');
  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();

  for (const file of files) {
    const sql = await readFile(path.join(migrationsDir, file), 'utf8');
    await pool.query(sql);
    console.info(`Applied migration: ${file}`);
  }

  console.info('Database migration completed.');
}

void migrate().catch((error: unknown) => {
  console.error('Database migration failed', error);
  process.exitCode = 1;
}).finally(() => pool.end());
