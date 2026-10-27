import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../config/db';

async function migrate(): Promise<void> {
  const sql = await readFile(path.resolve(process.cwd(), 'database/migrations/001_initial.sql'), 'utf8');
  await pool.query(sql);
  console.info('Database migration completed.');
}

void migrate().catch((error: unknown) => {
  console.error('Database migration failed', error);
  process.exitCode = 1;
}).finally(() => pool.end());
