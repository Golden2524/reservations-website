import type { ErrorRequestHandler } from 'express';
import { DatabaseError } from 'pg';
import { ZodError } from 'zod';
import { ApiError } from '../errors/api-error.js';

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  const requestId = response.locals.requestId;
  if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.parse.failed') {
    response.status(400).json({ error: 'Request body must be valid JSON.', code: 'MALFORMED_JSON', requestId });
    return;
  }

  if (error instanceof ZodError) {
    response.status(422).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: error.flatten(), requestId,
    });
    return;
  }

  if (error instanceof ApiError) {
    response.status(error.statusCode).json({ error: error.message, code: error.code, requestId });
    return;
  }

  if (error instanceof DatabaseError && error.code === '23P01') {
    response.status(409).json({
      error: 'This accommodation is no longer available for those dates.',
      code: 'UNIT_UNAVAILABLE', requestId,
    });
    return;
  }

  console.error({ error, requestId }, 'Unhandled API error');
  response.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR', requestId });
};
