import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.middleware';
import { getLocationsHandler } from './locations.controller';

const router = Router();

router.use(authenticateToken);
router.get('/', getLocationsHandler);

export default router;
