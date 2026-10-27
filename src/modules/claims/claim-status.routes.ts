import { Router } from 'express';
import { pool } from '../../config/db';
import { asyncHandler } from '../../middleware/async-handler';
import { authenticate } from '../../middleware/auth';
import { AppError, requestBody, requireString } from '../../utils/errors';

const router = Router();
router.use(authenticate);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

router.patch('/:id/status', asyncHandler(async (req, res) => {
  const claimId = requireString(req.params.id, 'id', 36, 36);
  if (!uuidPattern.test(claimId)) throw new AppError(400, 'VALIDATION_ERROR', 'Claim id must be a valid UUID.');
  const body = requestBody(req.body);
  const status = requireString(body.status, 'status', 1, 20).toUpperCase();
  if (!['APPROVED', 'REJECTED'].includes(status)) throw new AppError(400, 'VALIDATION_ERROR', 'status must be APPROVED or REJECTED.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query<{ id: string; item_id: string; status: string; reporter_id: string }>(
      `SELECT c.id, c.item_id, c.status, i.reporter_id FROM claims c JOIN items i ON i.id = c.item_id WHERE c.id = $1 FOR UPDATE OF c, i`,
      [claimId],
    );
    if (!found.rowCount) throw new AppError(404, 'CLAIM_NOT_FOUND', 'Claim not found.');
    const claim = found.rows[0];
    if (claim.reporter_id !== req.user?.id) throw new AppError(403, 'FORBIDDEN', 'Only the item reporter can review this claim.');
    if (claim.status !== 'PENDING') throw new AppError(409, 'CLAIM_ALREADY_REVIEWED', 'This claim has already been reviewed.');
    if (status === 'APPROVED') {
      await client.query("UPDATE claims SET status = 'REJECTED', reviewed_at = NOW() WHERE item_id = $1 AND id <> $2 AND status = 'PENDING'", [claim.item_id, claimId]);
      await client.query("UPDATE items SET status = 'RESOLVED' WHERE id = $1", [claim.item_id]);
    } else {
      const remaining = await client.query<{ exists: boolean }>("SELECT EXISTS (SELECT 1 FROM claims WHERE item_id = $1 AND id <> $2 AND status = 'PENDING') AS exists", [claim.item_id, claimId]);
      if (!remaining.rows[0].exists) await client.query("UPDATE items SET status = 'OPEN' WHERE id = $1 AND status = 'CLAIM_PENDING'", [claim.item_id]);
    }
    const updated = await client.query<{ id: string; status: string }>(
      'UPDATE claims SET status = $1, reviewed_at = NOW() WHERE id = $2 RETURNING id, status', [status, claimId],
    );
    await client.query('COMMIT');
    res.json({
      success: true,
      message: status === 'APPROVED' ? 'Claim approved. Contact details are available to the approved claimant on the item details endpoint.' : 'Claim rejected.',
      data: { claim_id: updated.rows[0].id, status: updated.rows[0].status },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}));

export default router;
