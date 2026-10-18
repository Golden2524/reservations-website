import { signAccessToken, verifyAccessToken } from './tokens.js';

const claims = { userId: '00000000-0000-0000-0000-000000000001', email: 'guest@reserveflow.test', role: 'GUEST' as const };
const token = await signAccessToken(claims);
const verified = await verifyAccessToken(token);

if (verified.userId !== claims.userId || verified.email !== claims.email || verified.role !== claims.role) {
  throw new Error('Access token claims did not round-trip correctly.');
}
