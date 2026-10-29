import { Request, Response } from 'express';
import { createItem, getItemDetails, getItems, resolveItem } from './items.service';

const itemTypes = ['LOST', 'FOUND'];
const itemCategories = ['ELECTRONICS', 'ID_CARDS_DOCUMENTS', 'CLOTHING_ACCESSORIES', 'KEYS', 'BOOKS', 'OTHER'];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown, min = 1, max = 10000): value is string {
  return typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;
}

function sendValidationError(res: Response, message: string): void {
  res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message } });
}

export async function getItemsHandler(req: Request, res: Response): Promise<void> {
  try {
    const pageValue = Number(req.query.page ?? 1);
    const limitValue = Number(req.query.limit ?? 20);
    if (!Number.isInteger(pageValue) || pageValue < 1 || !Number.isInteger(limitValue) || limitValue < 1 || limitValue > 100) {
      sendValidationError(res, 'page must be positive and limit must be between 1 and 100.');
      return;
    }

    const type = req.query.type === undefined ? undefined : String(req.query.type).toUpperCase();
    const category = req.query.category === undefined ? undefined : String(req.query.category).toUpperCase();
    const locationId = req.query.location_id === undefined ? undefined : String(req.query.location_id);
    const search = req.query.search === undefined ? undefined : String(req.query.search).trim();
    if (type && !itemTypes.includes(type)) { sendValidationError(res, 'type must be LOST or FOUND.'); return; }
    if (category && !itemCategories.includes(category)) { sendValidationError(res, 'category is not supported.'); return; }
    if (locationId && !uuidPattern.test(locationId)) { sendValidationError(res, 'location_id must be a valid UUID.'); return; }
    if (search !== undefined && (search.length < 1 || search.length > 100)) { sendValidationError(res, 'search must be between 1 and 100 characters.'); return; }

    const result = await getItems({ type, category, locationId, search, page: pageValue, limit: limitValue });
    res.status(200).json({ success: true, data: {
      items: result.items,
      pagination: { total_items: result.totalItems, current_page: pageValue, total_pages: Math.ceil(result.totalItems / limitValue) },
    } });
  } catch (error) {
    console.error('Get items error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to retrieve items right now.' } });
  }
}

export async function createItemHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!isObject(req.body)) { sendValidationError(res, 'Request body must be a JSON object.'); return; }
    const body = req.body;
    const type = typeof body.type === 'string' ? body.type.toUpperCase() : '';
    const category = typeof body.category === 'string' ? body.category.toUpperCase() : '';
    if (!itemTypes.includes(type)) { sendValidationError(res, 'type must be LOST or FOUND.'); return; }
    if (!itemCategories.includes(category)) { sendValidationError(res, 'category is not supported.'); return; }
    if (!isString(body.title, 2, 180) || !isString(body.description, 2, 10000)) {
      sendValidationError(res, 'title and description are required.'); return;
    }

    let locationId: string | null = null;
    if (body.location_id !== undefined && body.location_id !== null && body.location_id !== '') {
      if (!isString(body.location_id, 36, 36) || !uuidPattern.test(body.location_id)) { sendValidationError(res, 'location_id must be a valid UUID.'); return; }
      locationId = body.location_id;
    }
    let customLocation: string | null = null;
    if (body.custom_location !== undefined && body.custom_location !== null && body.custom_location !== '') {
      if (!isString(body.custom_location, 1, 240)) { sendValidationError(res, 'custom_location must be 1 to 240 characters.'); return; }
      customLocation = body.custom_location.trim();
    }
    if (!isString(body.date_event_occurred, 1, 40)) { sendValidationError(res, 'date_event_occurred must be a valid timestamp.'); return; }
    const occurredAt = new Date(body.date_event_occurred);
    if (Number.isNaN(occurredAt.getTime())) { sendValidationError(res, 'date_event_occurred must be a valid timestamp.'); return; }
    if (!Array.isArray(body.image_urls) || body.image_urls.length > 8 || !body.image_urls.every((url) => isString(url, 1, 2048) && /^https:\/\//i.test(url))) {
      sendValidationError(res, 'image_urls must contain up to 8 HTTPS image URLs.'); return;
    }
    if (!req.user?.id) { res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' } }); return; }
    const storageProjectUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
    const storageBucket = process.env.SUPABASE_STORAGE_BUCKET || 'item-images';
    const publicImagePrefix = storageProjectUrl
      ? `${storageProjectUrl}/storage/v1/object/public/${storageBucket}/users/${req.user.id}/`
      : '';
    if (body.image_urls.some((url) => typeof url !== 'string' || !publicImagePrefix || !url.startsWith(publicImagePrefix))) {
      sendValidationError(res, 'Each image URL must point to this user’s uploaded image in the configured Supabase bucket.'); return;
    }

    const item = await createItem({
      reporterId: req.user.id, type, category, title: body.title.trim(), description: body.description.trim(),
      locationId, customLocation, dateEventOccurred: occurredAt, imageUrls: body.image_urls,
    });
    res.status(201).json({ success: true, data: item });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23503') {
      res.status(400).json({ success: false, error: { code: 'INVALID_REFERENCE', message: 'The selected location does not exist.' } });
      return;
    }
    console.error('Create item error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to create the item right now.' } });
  }
}

export async function getItemByIdHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    if (!uuidPattern.test(id)) { sendValidationError(res, 'Item id must be a valid UUID.'); return; }
    if (!req.user?.id) { res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' } }); return; }
    const item = await getItemDetails(id, req.user.id);
    if (!item) { res.status(404).json({ success: false, error: { code: 'ITEM_NOT_FOUND', message: 'Item not found.' } }); return; }
    res.status(200).json({ success: true, data: item });
  } catch (error) {
    console.error('Get item error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to retrieve the item right now.' } });
  }
}

export async function updateItemStatusHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    if (!uuidPattern.test(id)) { sendValidationError(res, 'Item id must be a valid UUID.'); return; }
    if (!isObject(req.body) || req.body.status !== 'RESOLVED') { sendValidationError(res, 'Only status RESOLVED is accepted.'); return; }
    if (!req.user?.id) { res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' } }); return; }

    const result = await resolveItem(id, req.user.id);
    if (result === 'NOT_FOUND') { res.status(404).json({ success: false, error: { code: 'ITEM_NOT_FOUND', message: 'Item not found.' } }); return; }
    if (result === 'FORBIDDEN') { res.status(403).json({ success: false, error: { code: 'NOT_ITEM_REPORTER', message: 'Only the item reporter can resolve it.' } }); return; }
    if (result === 'ALREADY_RESOLVED') { res.status(409).json({ success: false, error: { code: 'ITEM_ALREADY_RESOLVED', message: 'This item is already resolved.' } }); return; }
    res.status(200).json({ success: true, data: { id, status: 'RESOLVED' } });
  } catch (error) {
    console.error('Update item status error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to resolve the item right now.' } });
  }
}
