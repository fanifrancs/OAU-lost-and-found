import { Router } from 'express';
import { pool } from '../../config/db';
import { asyncHandler } from '../../middleware/async-handler';
import { authenticate } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(async (_req, res) => {
  const result = await pool.query('SELECT id, name, zone FROM locations ORDER BY zone, name');
  res.json({ success: true, data: result.rows });
}));

export default router;
