import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { createDatabaseClient } from '../../db/client.js';
import { asyncRoute } from '../../http/async-route.js';

const requestSchema = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.string().email().max(254).transform((value) => value.trim().toLowerCase()),
  topic: z.enum(['BOOKING', 'PAYMENT', 'PROPERTY', 'ACCOUNT', 'OTHER']),
  message: z.string().trim().min(10).max(3000),
  reservationReference: z.string().trim().max(80).optional(),
});

export const supportRouter = Router();
supportRouter.post('/requests', asyncRoute(async (request, response) => {
  const input = requestSchema.parse(request.body);
  const reference = `RF-SUP-${randomUUID().replaceAll('-', '').slice(0, 9).toUpperCase()}`;
  const client = createDatabaseClient();
  await client.connect();
  try {
    await client.query(
      `INSERT INTO support_requests (public_reference, name, email, topic, message, reservation_reference)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [reference, input.name, input.email, input.topic, input.message, input.reservationReference || null],
    );
    response.status(201).json({ data: { reference } });
  } finally { await client.end(); }
}));
