import { ErrorRequestHandler, RequestHandler } from 'express';

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } });
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = Number((error as { status?: number }).status);
    if (status >= 400 && status < 500) {
      res.status(status).json({ success: false, error: { code: status === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_REQUEST', message: 'The request could not be processed.' } });
      return;
    }
  }
  console.error('Unhandled request error:', error);
  res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
};
