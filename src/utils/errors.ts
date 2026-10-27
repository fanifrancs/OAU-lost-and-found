export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function requireString(value: unknown, field: string, min = 1, max = 10000): string {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw new AppError(400, 'VALIDATION_ERROR', `${field} must be a string between ${min} and ${max} characters.`);
  }
  return value.trim();
}

export function requestBody(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object.');
  }
  return value as Record<string, unknown>;
}
