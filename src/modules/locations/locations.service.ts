import { pool } from '../../config/db';

export async function getLocations(): Promise<unknown[]> {
  const result = await pool.query('SELECT id, name, zone FROM locations ORDER BY zone, name');
  return result.rows;
}
