import { pool } from '../../config/db';

export interface ItemFilters {
  type?: string;
  category?: string;
  locationId?: string;
  search?: string;
  page: number;
  limit: number;
}

export async function getItems(filters: ItemFilters): Promise<{ items: unknown[]; totalItems: number }> {
  const conditions: string[] = ["i.status <> 'RESOLVED'"];
  const values: unknown[] = [];
  const addValue = (condition: (index: number) => string, value: unknown): void => {
    values.push(value);
    conditions.push(condition(values.length));
  };

  if (filters.type) addValue((index) => `i.type = $${index}`, filters.type);
  if (filters.category) addValue((index) => `i.category = $${index}`, filters.category);
  if (filters.locationId) addValue((index) => `i.location_id = $${index}`, filters.locationId);
  if (filters.search) addValue((index) => `(i.title ILIKE '%' || $${index} || '%' OR i.description ILIKE '%' || $${index} || '%')`, filters.search);

  const where = `WHERE ${conditions.join(' AND ')}`;
  const countResult = await pool.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM items i ${where}`,
    values,
  );
  const totalItems = Number(countResult.rows[0].total);
  const result = await pool.query(
    `SELECT i.id, i.type, i.category, i.title, i.description,
            CASE WHEN l.id IS NULL THEN NULL ELSE json_build_object('id', l.id, 'name', l.name, 'zone', l.zone) END AS location,
            i.custom_location, i.date_event_occurred, i.image_urls, i.status, i.created_at
     FROM items i
     LEFT JOIN locations l ON l.id = i.location_id
     ${where}
     ORDER BY i.created_at DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, filters.limit, (filters.page - 1) * filters.limit],
  );

  return { items: result.rows, totalItems };
}

export interface CreateItemInput {
  reporterId: string;
  type: string;
  category: string;
  title: string;
  description: string;
  locationId: string | null;
  customLocation: string | null;
  dateEventOccurred: Date;
  imageUrls: string[];
}

export async function createItem(input: CreateItemInput): Promise<unknown> {
  const result = await pool.query(
    `INSERT INTO items
      (reporter_id, type, category, title, description, location_id, custom_location, date_event_occurred, image_urls)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, type, category, title, description, location_id, custom_location,
               date_event_occurred, image_urls, status, created_at`,
    [input.reporterId, input.type, input.category, input.title, input.description, input.locationId,
      input.customLocation, input.dateEventOccurred, input.imageUrls],
  );
  return result.rows[0];
}

export async function getItemDetails(itemId: string, userId: string): Promise<unknown | null> {
  const result = await pool.query(
    `SELECT i.id, i.type, i.category, i.title, i.description,
            CASE WHEN l.id IS NULL THEN NULL ELSE json_build_object('id', l.id, 'name', l.name, 'zone', l.zone) END AS location,
            i.custom_location, i.date_event_occurred, i.image_urls, i.status, i.created_at,
            CASE WHEN EXISTS (
              SELECT 1 FROM claims c WHERE c.item_id = i.id AND c.claimant_id = $2 AND c.status = 'APPROVED'
            ) THEN json_build_object(
              'phone_number', u.phone_number,
              'whatsapp_number', u.whatsapp_number,
              'whatsapp_link', 'https://wa.me/234' || regexp_replace(u.whatsapp_number, '^0', '') || '?text=Hello%20I%20am%20contacting%20you%20regarding%20the%20lost%20item'
            ) ELSE NULL END AS contact_details
     FROM items i
     LEFT JOIN locations l ON l.id = i.location_id
     JOIN users u ON u.id = i.reporter_id
     WHERE i.id = $1`,
    [itemId, userId],
  );
  return result.rows[0] ?? null;
}

export async function resolveItem(itemId: string, reporterId: string): Promise<'NOT_FOUND' | 'FORBIDDEN' | 'ALREADY_RESOLVED' | 'UPDATED'> {
  const updated = await pool.query(
    `UPDATE items SET status = 'RESOLVED', updated_at = NOW()
     WHERE id = $1 AND reporter_id = $2 AND status <> 'RESOLVED'
     RETURNING id`,
    [itemId, reporterId],
  );
  if (updated.rowCount) return 'UPDATED';

  const item = await pool.query<{ status: string; reporter_id: string }>(
    'SELECT status, reporter_id FROM items WHERE id = $1',
    [itemId],
  );
  if (!item.rowCount) return 'NOT_FOUND';
  if (item.rows[0].reporter_id !== reporterId) return 'FORBIDDEN';
  return 'ALREADY_RESOLVED';
}
