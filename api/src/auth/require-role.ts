import type { RequestHandler } from 'express';
import type { Role } from '../types/roles.js';
import { ApiError } from '../errors/api-error.js';

export const requireRole = (...allowedRoles: Role[]): RequestHandler => (request, _response, next) => {
  if (!request.auth) {
    next(new ApiError(401, 'A bearer access token is required.', 'AUTHENTICATION_REQUIRED'));
    return;
  }
  if (!allowedRoles.includes(request.auth.role)) {
    next(new ApiError(403, 'You do not have permission for this action.', 'INSUFFICIENT_PERMISSION'));
    return;
  }
  next();
};
