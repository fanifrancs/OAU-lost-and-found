import { Router } from 'express';
import { pool } from '../../config/db';
import { asyncHandler } from '../../middleware/async-handler';
import { authenticate } from '../../middleware/auth';
import { AppError, requestBody, requireString } from '../../utils/errors';
import { sendClaimNotification } from '../../utils/email';

const router = Router();
router.use(authenticate);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

router.post('/items/:id/claim', asyncHandler(async (req, res) => {
  const itemId = requireString(req.params.id, 'id', 36, 36);
  if (!uuidPattern.test(itemId)) throw new AppError(400, 'VALIDATION_ERROR', 'Item id must be a valid UUID.');
  const body = requestBody(req.body);
  const proof = requireString(body.proof_of_ownership, 'proof_of_ownership', 10, 5000);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const item = await client.query<{ reporter_id: string; status: string; reporter_email: string; title: string }>(
      'SELECT i.reporter_id, i.status, u.email AS reporter_email, i.title FROM items i JOIN users u ON u.id = i.reporter_id WHERE i.id = $1 FOR UPDATE OF i', [itemId],
    );
    if (!item.rowCount) throw new AppError(404, 'ITEM_NOT_FOUND', 'Item not found.');
    if (item.rows[0].reporter_id === req.user?.id) throw new AppError(403, 'CANNOT_CLAIM_OWN_ITEM', 'You cannot submit a claim for your own item.');
    if (item.rows[0].status === 'RESOLVED') throw new AppError(409, 'ITEM_RESOLVED', 'This item has already been resolved.');
    const claim = await client.query<{ id: string; status: string }>(
      `INSERT INTO claims (item_id, claimant_id, proof_of_ownership) VALUES ($1,$2,$3) RETURNING id, status`,
      [itemId, req.user?.id, proof],
    );
    await client.query("UPDATE items SET status = 'CLAIM_PENDING' WHERE id = $1", [itemId]);
    await client.query('COMMIT');
    try {
      await sendClaimNotification(item.rows[0].reporter_email, item.rows[0].title);
    } catch (notificationError) {
      console.error('Claim was recorded but finder notification failed', notificationError);
    }
    res.status(201).json({ success: true, message: 'Claim request submitted successfully.', data: { claim_id: claim.rows[0].id, status: claim.rows[0].status } });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}));

export default router;
