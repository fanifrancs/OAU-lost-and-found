import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.middleware';
import { createSignedUploadHandler } from './uploads.controller';

const router = Router();

router.use(authenticateToken);
router.post('/sign', createSignedUploadHandler);

export default router;
