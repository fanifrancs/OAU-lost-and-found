import { pool } from '../../config/db';

export async function getLocations(): Promise<unknown[]> {
  const query = 'SELECT id, name, zone FROM locations ORDER BY zone, name';
  const values: unknown[] = [];
  const result = await pool.query(query, values);
  return result.rows;
}
