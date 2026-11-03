import { createHash } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db';

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export async function authenticateToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authorization = req.headers.authorization;
    if (!authorization || !authorization.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'A bearer token is required.' } });
      return;
    }

    const token = authorization.slice(7).trim();
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Authentication is not configured.' } });
      return;
    }

    // The middleware first checks that it starts with 'Bearer '. That prefix
    // is 7 characters long (Bearer plus a space), so authorization.slice(7)
    // removes it and returns just the token for jwt.verify(...).
    const decoded = jwt.verify(token, secret);

    // decoded is expected to be a payload object from a valid JWT,
    // roughly like this:

    //    {
        //   email: 'student@oauife.edu.ng',
        //   sub: 'user-id-here',
        //   iat: 1793380000,
        //   exp: 1793984800
    //    }

    // The login code sets email in the payload and the user ID as sub; iat
    // and exp are added by the JWT library. The middleware checks that sub
    // is a string because it uses that ID to look up the user in the database.
    // A token that decodes to a string, or an object without a string sub,
    // is rejected.
    
    if (typeof decoded === 'string' || typeof decoded.sub !== 'string') {
      res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'The bearer token is invalid or expired.' } });
      return;
    }

    const revokedQuery = 'SELECT 1 FROM revoked_tokens WHERE token_hash = $1 AND expires_at > NOW() LIMIT 1';
    const revokedResult = await pool.query(revokedQuery, [hashToken(token)]);
    if (revokedResult.rowCount && revokedResult.rowCount > 0) {
      res.status(401).json({ success: false, error: { code: 'TOKEN_REVOKED', message: 'This session has been logged out.' } });
      return;
    }

    const query = 'SELECT id, email, is_verified FROM users WHERE id = $1';
    const values = [decoded.sub];
    const result = await pool.query<{ id: string; email: string; is_verified: boolean }>(query, values);
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
