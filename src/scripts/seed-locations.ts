import { pool } from '../config/db';

const locations: ReadonlyArray<{ name: string; zone: string }> = [
  // Lecture Theatres & Auditoriums
  { name: '1000 LT', zone: 'LECTURE_THEATRE' },
  { name: 'Oduduwa Hall', zone: 'LECTURE_THEATRE' },
  { name: 'Amphitheatre', zone: 'LECTURE_THEATRE' },
  { name: 'Ajose Lecture Theatre', zone: 'LECTURE_THEATRE' },
  { name: 'BOO Lecture Theatre', zone: 'LECTURE_THEATRE' },
  { name: 'Auditorium 1', zone: 'LECTURE_THEATRE' },
  { name: 'Auditorium 2', zone: 'LECTURE_THEATRE' },
  { name: 'ODLT 1', zone: 'LECTURE_THEATRE' },
  { name: 'ODLT 2', zone: 'LECTURE_THEATRE' },
  { name: 'Health Sciences Lecture Theatre (HSLT)', zone: 'LECTURE_THEATRE' },
  { name: 'Biological Sciences Lecture Theatre (BSLT)', zone: 'LECTURE_THEATRE' },

  // Halls of Residence
  { name: 'Fajuyi Hall', zone: 'HALL_OF_RESIDENCE' },
  { name: 'Awolowo Hall', zone: 'HALL_OF_RESIDENCE' },
  { name: 'Angola Hall', zone: 'HALL_OF_RESIDENCE' },
  { name: 'ETF Hall', zone: 'HALL_OF_RESIDENCE' },
  { name: 'Moremi Hall', zone: 'HALL_OF_RESIDENCE' },
  { name: 'Mozambique Hall', zone: 'HALL_OF_RESIDENCE' },
  { name: 'Akintola Hall', zone: 'HALL_OF_RESIDENCE' },
  { name: 'Alumni Hall', zone: 'HALL_OF_RESIDENCE' },

  // Common Areas & Landmarks
  { name: 'SUB (Student Union Building)', zone: 'COMMON_AREA' },
  { name: 'New Market (New Mak)', zone: 'COMMON_AREA' },
  { name: 'Sports Complex', zone: 'COMMON_AREA' },
  { name: 'Hezekiah Oluwasanmi Library', zone: 'COMMON_AREA' },
  { name: 'Natural History Museum', zone: 'COMMON_AREA' },
  { name: 'Senate Building', zone: 'COMMON_AREA' },
  { name: 'OAU Health Centre', zone: 'COMMON_AREA' },

  // Faculties & Academics
  { name: 'Faculty of computing', zone: 'FACULTY' },
  { name: 'Faculty of Arts', zone: 'FACULTY' },
  { name: 'Faculty of Administration', zone: 'FACULTY' },
  { name: 'Faculty of Social Sciences', zone: 'FACULTY' },
  { name: 'Faculty of Technology', zone: 'FACULTY' },
  { name: 'Faculty of Agriculture', zone: 'FACULTY' },
  { name: 'Faculty of Education', zone: 'FACULTY' },
  { name: 'Faculty of Law', zone: 'FACULTY' },
  { name: 'Faculty of Pharmacy', zone: 'FACULTY' },
  { name: 'Faculty of Science', zone: 'FACULTY' },
  { name: 'Faculty of Environmental Design and Management (EDM)', zone: 'FACULTY' },

  // Transit Routes & Gates
  { name: 'Main Gate', zone: 'TRANSIT_ROUTE' },
  { name: 'Road 1', zone: 'TRANSIT_ROUTE' },
  { name: 'Campus Bus Stop', zone: 'TRANSIT_ROUTE' },
];

async function seed(): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const deleteQuery = 'DELETE FROM locations';
    await client.query(deleteQuery);

    const insertQuery = 'INSERT INTO locations (name, zone) VALUES ($1, $2)';
    for (const location of locations) {
      const values = [location.name, location.zone];
      await client.query(insertQuery, values);
    }

    await client.query('COMMIT');
    console.info(`Seeded ${locations.length} campus locations.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

void seed().catch((error: unknown) => {
  console.error('Location seed failed', error);
  process.exitCode = 1;
}).finally(() => pool.end());
