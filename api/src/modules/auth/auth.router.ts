import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { DatabaseError } from 'pg';
import { z } from 'zod';
import { signAccessToken } from '../../auth/tokens.js';
import { createDatabaseClient } from '../../db/client.js';
import { ApiError } from '../../errors/api-error.js';
import { asyncRoute } from '../../http/async-route.js';

const password = z.string().min(12).max(128)
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[0-9]/, 'Password must include a number');

const registerSchema = z.object({
  email: z.string().email().max(254).transform((value) => value.trim().toLowerCase()),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(7).max(20).optional(),
  password,
});

const loginSchema = z.object({
  email: z.string().email().max(254).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1).max(128),
});

const toAccountResponse = async (user: {
  id: string; email: string; first_name: string; last_name: string; role: 'GUEST' | 'HOST' | 'ADMIN';
}) => ({
  accessToken: await signAccessToken({ userId: user.id, email: user.email, role: user.role }),
  tokenType: 'Bearer',
  expiresInSeconds: 900,
  user: {
    id: user.id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    role: user.role,
  },
});

export const authRouter = Router();

authRouter.post('/register', asyncRoute(async (request, response) => {
  const input = registerSchema.parse(request.body);
  const client = createDatabaseClient();
  await client.connect();
  try {
    await client.query('BEGIN');
    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await client.query<{
      id: string; email: string; first_name: string; last_name: string; role: 'GUEST';
    }>(
      `INSERT INTO users (email, first_name, last_name, phone_e164, role)
       VALUES ($1, $2, $3, $4, 'GUEST')
       RETURNING id, email, first_name, last_name, role`,
      [input.email, input.firstName, input.lastName, input.phone ?? null],
    );
    await client.query('INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)', [
      user.rows[0].id,
      passwordHash,
    ]);
    await client.query('COMMIT');
    response.status(201).json({ data: await toAccountResponse(user.rows[0]) });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof DatabaseError && error.code === '23505') {
      throw new ApiError(409, 'An account with that email or phone already exists.', 'ACCOUNT_EXISTS');
    }
    throw error;
  } finally {
    await client.end();
  }
}));

authRouter.post('/login', asyncRoute(async (request, response) => {
  const input = loginSchema.parse(request.body);
  const client = createDatabaseClient();
  await client.connect();
  try {
    const result = await client.query<{
      id: string; email: string; first_name: string; last_name: string;
      role: 'GUEST' | 'HOST' | 'ADMIN'; password_hash: string;
    }>(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.role, c.password_hash
       FROM users u JOIN user_credentials c ON c.user_id = u.id
       WHERE u.email = $1`,
      [input.email],
    );
    const account = result.rows[0];
    if (!account || !(await bcrypt.compare(input.password, account.password_hash))) {
      throw new ApiError(401, 'Email or password is incorrect.', 'INVALID_CREDENTIALS');
    }
    response.json({ data: await toAccountResponse(account) });
  } finally {
    await client.end();
  }
}));
