import { Router } from 'express';
import { pool } from '../../config/db';
import { asyncHandler } from '../../middleware/async-handler';
import { authenticate } from '../../middleware/auth';
import { AppError, requestBody, requireString } from '../../utils/errors';

const router = Router();
router.use(authenticate);

const validTypes = ['LOST', 'FOUND'];
const validCategories = ['ELECTRONICS', 'ID_CARDS_DOCUMENTS', 'CLOTHING_ACCESSORIES', 'KEYS', 'BOOKS', 'OTHER'];
const validStatuses = ['OPEN', 'CLAIM_PENDING', 'RESOLVED'];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

router.get('/', asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit ?? '20'), 10) || 20));
  const filters: string[] = [];
  const values: unknown[] = [];
  const add = (sql: string, value: unknown): void => { values.push(value); filters.push(sql.replace('?', `$${values.length}`)); };

  if (req.query.type !== undefined) {
    const type = requireString(req.query.type, 'type', 1, 20).toUpperCase();
    if (!validTypes.includes(type)) throw new AppError(400, 'VALIDATION_ERROR', 'type must be LOST or FOUND.');
    add('i.type = ?', type);
  }
  if (req.query.category !== undefined) {
    const category = requireString(req.query.category, 'category', 1, 40).toUpperCase();
    if (!validCategories.includes(category)) throw new AppError(400, 'VALIDATION_ERROR', 'category is not supported.');
    add('i.category = ?', category);
  }
  if (req.query.location_id !== undefined) {
    const locationId = requireString(req.query.location_id, 'location_id', 36, 36);
    if (!uuidPattern.test(locationId)) throw new AppError(400, 'VALIDATION_ERROR', 'location_id must be a valid UUID.');
    add('i.location_id = ?', locationId);
  }
  if (req.query.status !== undefined) {
    const status = requireString(req.query.status, 'status', 1, 20).toUpperCase();
    if (!validStatuses.includes(status)) throw new AppError(400, 'VALIDATION_ERROR', 'status is not supported.');
    add('i.status = ?', status);
  } else {
    filters.push("i.status <> 'RESOLVED'");
  }
  if (req.query.search !== undefined) {
    const search = requireString(req.query.search, 'search', 1, 100);
    add("(i.title ILIKE '%' || ? || '%' OR i.description ILIKE '%' || ? || '%' OR COALESCE(i.custom_location, '') ILIKE '%' || ? || '%' )", search);
    // Repeat the parameter safely for the three search expressions.
    const param = `$${values.length}`;
    filters[filters.length - 1] = `(i.title ILIKE '%' || ${param} || '%' OR i.description ILIKE '%' || ${param} || '%' OR COALESCE(i.custom_location, '') ILIKE '%' || ${param} || '%')`;
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const count = await pool.query<{ total: string }>(`SELECT COUNT(*)::text AS total FROM items i ${where}`, values);
  const totalItems = Number(count.rows[0].total);
  const pageValues = [...values, limit, (page - 1) * limit];
  const result = await pool.query(
    `SELECT i.id, i.type, i.category, i.title, i.description,
            CASE WHEN l.id IS NULL THEN NULL ELSE json_build_object('id', l.id, 'name', l.name, 'zone', l.zone) END AS location,
            i.custom_location, i.date_event_occurred, i.image_urls, i.status, i.created_at
     FROM items i LEFT JOIN locations l ON l.id = i.location_id ${where}
     ORDER BY i.created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    pageValues,
  );
  res.json({ success: true, data: { items: result.rows, pagination: { total_items: totalItems, current_page: page, total_pages: Math.ceil(totalItems / limit) } } });
}));

router.post('/', asyncHandler(async (req, res) => {
  const body = requestBody(req.body);
  const type = requireString(body.type, 'type', 1, 20).toUpperCase();
  const category = requireString(body.category, 'category', 1, 40).toUpperCase();
  const title = requireString(body.title, 'title', 2, 180);
  const description = requireString(body.description, 'description', 2, 10000);
  if (!validTypes.includes(type)) throw new AppError(400, 'VALIDATION_ERROR', 'type must be LOST or FOUND.');
  if (!validCategories.includes(category)) throw new AppError(400, 'VALIDATION_ERROR', 'category is not supported.');
  const locationIdValue = body.location_id;
  const locationId = locationIdValue === undefined || locationIdValue === null || locationIdValue === ''
    ? null : requireString(locationIdValue, 'location_id', 36, 36);
  if (locationId && !uuidPattern.test(locationId)) throw new AppError(400, 'VALIDATION_ERROR', 'location_id must be a valid UUID.');
  const customLocation = body.custom_location === undefined || body.custom_location === null || body.custom_location === ''
    ? null : requireString(body.custom_location, 'custom_location', 1, 240);
  const dateValue = requireString(body.date_event_occurred, 'date_event_occurred', 1, 40);
  const occurredAt = new Date(dateValue);
  if (Number.isNaN(occurredAt.getTime())) throw new AppError(400, 'VALIDATION_ERROR', 'date_event_occurred must be a valid date.');
  if (!Array.isArray(body.image_urls) || body.image_urls.length > 8 || !body.image_urls.every((url) => typeof url === 'string' && url.length <= 2048)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'image_urls must be an array of up to 8 URL strings.');
  }
  const images = body.image_urls as string[];
  if (images.some((url) => !/^https?:\/\//i.test(url))) throw new AppError(400, 'VALIDATION_ERROR', 'Each image URL must use http or https.');
  const result = await pool.query(
    `INSERT INTO items (reporter_id, type, category, title, description, location_id, custom_location, date_event_occurred, image_urls)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, type, category, title, description, location_id, custom_location, date_event_occurred, image_urls, status, created_at`,
    [req.user?.id, type, category, title, description, locationId, customLocation, occurredAt, images],
  );
  res.status(201).json({ success: true, data: result.rows[0] });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const itemId = requireString(req.params.id, 'id', 36, 36);
  if (!uuidPattern.test(itemId)) throw new AppError(400, 'VALIDATION_ERROR', 'Item id must be a valid UUID.');
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
     FROM items i LEFT JOIN locations l ON l.id = i.location_id JOIN users u ON u.id = i.reporter_id
     WHERE i.id = $1`, [itemId, req.user?.id],
  );
  if (!result.rowCount) throw new AppError(404, 'ITEM_NOT_FOUND', 'Item not found.');
  res.json({ success: true, data: result.rows[0] });
}));

export default router;
