import { SignJWT, jwtVerify } from 'jose';
import { env } from '../config/env.js';
import type { Role } from '../types/roles.js';

export type AccessTokenClaims = {
  userId: string;
  role: Role;
  email: string;
};

const accessTokenSecret = (): Uint8Array => {
  if (!env.JWT_ACCESS_SECRET) {
    throw new Error('JWT_ACCESS_SECRET must be set before using authentication.');
  }
  return new TextEncoder().encode(env.JWT_ACCESS_SECRET);
};

export const signAccessToken = async (claims: AccessTokenClaims): Promise<string> =>
  new SignJWT({ role: claims.role, email: claims.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.userId)
    .setIssuedAt()
    // A checkout plus an external 3-D Secure / bank-auth step can legitimately
    // exceed a short booking hold. Keep the bearer session modest but long enough
    // for the guest to return and privately verify the payment outcome.
    .setExpirationTime('1h')
    .setIssuer('reserveflow-api')
    .setAudience('reserveflow-client')
    .sign(accessTokenSecret());

export const verifyAccessToken = async (token: string): Promise<AccessTokenClaims> => {
  const { payload } = await jwtVerify(token, accessTokenSecret(), {
    issuer: 'reserveflow-api',
    audience: 'reserveflow-client',
  });

  if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
    throw new Error('Invalid access token claims.');
  }
  if (payload.role !== 'GUEST' && payload.role !== 'HOST' && payload.role !== 'ADMIN') {
    throw new Error('Invalid access token role.');
  }

  return { userId: payload.sub, email: payload.email, role: payload.role };
};
