import type { ErrorRequestHandler } from 'express';
import { DatabaseError } from 'pg';
import { ZodError } from 'zod';
import { ApiError } from '../errors/api-error.js';

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof ZodError) {
    response.status(422).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: error.flatten(),
    });
    return;
  }

  if (error instanceof ApiError) {
    response.status(error.statusCode).json({ error: error.message, code: error.code });
    return;
  }

  if (error instanceof DatabaseError && error.code === '23P01') {
    response.status(409).json({
      error: 'This accommodation is no longer available for those dates.',
      code: 'UNIT_UNAVAILABLE',
    });
    return;
  }

  console.error(error);
  response.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
};
