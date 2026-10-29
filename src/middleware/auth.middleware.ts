import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db';

export async function authenticateToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authorization = req.headers.authorization;
    if (!authorization || !authorization.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'A bearer token is required.' } });
      return;
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Authentication is not configured.' } });
      return;
    }

    const decoded = jwt.verify(authorization.slice(7), secret);
    if (typeof decoded === 'string' || typeof decoded.sub !== 'string') {
      res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'The bearer token is invalid or expired.' } });
      return;
    }

    const result = await pool.query<{ id: string; email: string; is_verified: boolean }>(
      'SELECT id, email, is_verified FROM users WHERE id = $1',
      [decoded.sub],
    );
    const user = result.rows[0];
    if (!user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'The account for this token no longer exists.' } });
      return;
    }
    if (!user.is_verified) {
      res.status(403).json({ success: false, error: { code: 'ACCOUNT_UNVERIFIED', message: 'Verify your OAU email before accessing this endpoint.' } });
      return;
    }

    req.user = { id: user.id, email: user.email };
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'The bearer token is invalid or expired.' } });
      return;
    }
    console.error('Authentication middleware error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
  }
}
