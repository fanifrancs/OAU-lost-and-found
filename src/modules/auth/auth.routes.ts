import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.middleware';
import { loginHandler, logoutHandler, registerHandler, verifyEmailHandler } from './auth.controller';

const router = Router();

router.post('/register', registerHandler);
router.get('/verify-email', verifyEmailHandler);
router.post('/login', loginHandler);
router.post('/logout', authenticateToken, logoutHandler);

export default router;
