import { RequestHandler } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../utils/errors';

type AuthClaims = JwtPayload & { sub: string; email: string };

export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) return next(new AppError(401, 'UNAUTHORIZED', 'A bearer token is required.'));
  try {
    const claims = jwt.verify(header.slice(7), env.jwtSecret);
    if (typeof claims === 'string' || typeof (claims as AuthClaims).sub !== 'string') throw new Error('Invalid claims');
    const auth = claims as AuthClaims;
    req.user = { id: auth.sub, email: auth.email };
    next();
  } catch {
    next(new AppError(401, 'INVALID_TOKEN', 'The bearer token is invalid or expired.'));
  }
};
