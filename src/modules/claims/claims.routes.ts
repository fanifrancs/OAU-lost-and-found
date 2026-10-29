import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.middleware';
import {
  getClaimHandler,
  listItemClaimsHandler,
  reviewClaimHandler,
  submitClaimHandler,
} from './claims.controller';

const router = Router();

router.use(authenticateToken);
router.post('/items/:id/claim', submitClaimHandler);
router.get('/items/:id/claims', listItemClaimsHandler);
router.get('/claims/:id', getClaimHandler);
router.patch('/claims/:id/status', reviewClaimHandler);

export default router;
