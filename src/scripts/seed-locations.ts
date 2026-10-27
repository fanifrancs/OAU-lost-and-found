import { pool } from '../config/db';

const locations: ReadonlyArray<{ name: string; zone: string }> = [
  { name: '1000 LT', zone: 'LECTURE_THEATRE' },
  { name: 'Oduduwa Hall', zone: 'HALL_OF_RESIDENCE' },
  { name: 'Fajuyi Hall', zone: 'HALL_OF_RESIDENCE' },
  { name: 'Awolowo Hall', zone: 'HALL_OF_RESIDENCE' },
  { name: 'Angola Hall', zone: 'HALL_OF_RESIDENCE' },
  { name: 'ETF Hall', zone: 'HALL_OF_RESIDENCE' },
  { name: 'Moremi Hall', zone: 'HALL_OF_RESIDENCE' },
  { name: 'Mozambique Hall', zone: 'HALL_OF_RESIDENCE' },
  { name: 'Queen Elizabeth II Hall', zone: 'HALL_OF_RESIDENCE' },
  { name: 'Awo Cafe', zone: 'COMMON_AREA' },
  { name: 'SUB', zone: 'COMMON_AREA' },
  { name: 'ACE Building', zone: 'FACULTY' },
  { name: 'Main Gate', zone: 'TRANSIT_ROUTE' },
];

async function seed(): Promise<void> {
  for (const location of locations) {
    await pool.query('INSERT INTO locations (name, zone) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING', [location.name, location.zone]);
  }
  console.info(`Seeded ${locations.length} campus locations (existing names were preserved).`);
}

void seed().catch((error: unknown) => {
  console.error('Location seed failed', error);
  process.exitCode = 1;
}).finally(() => pool.end());
