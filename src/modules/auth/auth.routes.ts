import { Router } from 'express';
import { loginHandler, registerHandler, verifyEmailHandler } from './auth.controller';

const router = Router();

router.post('/register', registerHandler);
router.get('/verify-email', verifyEmailHandler);
router.post('/login', loginHandler);

export default router;
