import type { RequestHandler } from 'express';
import { ApiError } from '../errors/api-error.js';
import { verifyAccessToken, type AccessTokenClaims } from './tokens.js';

declare global {
  namespace Express {
    interface Request {
      auth?: AccessTokenClaims;
    }
  }
}

export const requireAuth: RequestHandler = async (request, _response, next) => {
  const authorization = request.header('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    next(new ApiError(401, 'A bearer access token is required.', 'AUTHENTICATION_REQUIRED'));
    return;
  }

  try {
    request.auth = await verifyAccessToken(authorization.slice('Bearer '.length));
    next();
  } catch {
    next(new ApiError(401, 'Your access token is invalid or expired.', 'INVALID_ACCESS_TOKEN'));
  }
};
