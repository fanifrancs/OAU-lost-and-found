import { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../utils/errors';

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } });
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({ success: false, error: { code: error.code, message: error.message } });
    return;
  }
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
    res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'A record with these details already exists.' } });
    return;
  }
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23503') {
    res.status(400).json({ success: false, error: { code: 'INVALID_REFERENCE', message: 'A referenced record does not exist.' } });
    return;
  }
  console.error(error);
  res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
};
