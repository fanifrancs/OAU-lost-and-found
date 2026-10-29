import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.middleware';
import { createItemHandler, getItemByIdHandler, getItemsHandler, updateItemStatusHandler } from './items.controller';

const router = Router();

router.use(authenticateToken);
router.get('/', getItemsHandler);
router.post('/', createItemHandler);
router.get('/:id', getItemByIdHandler);
router.patch('/:id/status', updateItemStatusHandler);

export default router;
