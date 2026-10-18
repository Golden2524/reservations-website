import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../auth/require-auth.js';
import { createDatabaseClient } from '../../db/client.js';
import { ApiError } from '../../errors/api-error.js';
import { asyncRoute } from '../../http/async-route.js';

const createReservationSchema = z.object({
  unitId: z.string().uuid(),
  checkIn: z.coerce.date(),
  checkOut: z.coerce.date(),
  guestCount: z.coerce.number().int().min(1).max(20),
  idempotencyKey: z.string().trim().min(16).max(255),
});

const isoDate = (value: Date) => value.toISOString().slice(0, 10);
const publicReference = () => `RF-${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`;

export const reservationsRouter = Router();

reservationsRouter.post('/', requireAuth, asyncRoute(async (request, response) => {
  const input = createReservationSchema.parse(request.body);
  if (input.checkIn >= input.checkOut) {
    throw new ApiError(422, 'checkOut must be after checkIn', 'INVALID_STAY_RANGE');
  }

  const client = createDatabaseClient();
  await client.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT id, public_reference, status, check_in, check_out, total_naira, hold_expires_at
       FROM reservations WHERE idempotency_key = $1`,
      [input.idempotencyKey],
    );
    if (existing.rowCount) {
      await client.query('COMMIT');
      response.status(200).json({ data: existing.rows[0], idempotentReplay: true });
      return;
    }

    const unit = await client.query<{
      max_guests: number;
      base_nightly_rate_naira: number;
      cleaning_fee_naira: number;
    }>(
      `SELECT u.max_guests, u.base_nightly_rate_naira, u.cleaning_fee_naira
       FROM units u JOIN properties p ON p.id = u.property_id
       WHERE u.id = $1 AND u.status = 'ACTIVE' AND p.status = 'ACTIVE'
       FOR SHARE`,
      [input.unitId],
    );
    if (!unit.rowCount) throw new ApiError(404, 'Bookable unit not found', 'UNIT_NOT_FOUND');
    if (input.guestCount > unit.rows[0].max_guests) {
      throw new ApiError(422, 'Guest count exceeds this unit capacity', 'GUEST_CAPACITY_EXCEEDED');
    }

    const nights = Math.round((input.checkOut.getTime() - input.checkIn.getTime()) / 86_400_000);
    const nightlyRate = unit.rows[0].base_nightly_rate_naira;
    const cleaningFee = unit.rows[0].cleaning_fee_naira;
    const serviceFee = Math.round(nights * nightlyRate * 0.08);
    const total = nights * nightlyRate + cleaningFee + serviceFee;
    const result = await client.query(
      `INSERT INTO reservations (
        public_reference, unit_id, guest_id, check_in, check_out, guest_count, status,
        hold_expires_at, nightly_rate_naira, cleaning_fee_naira, service_fee_naira,
        total_naira, idempotency_key
      ) VALUES ($1, $2, $3, $4, $5, $6, 'HOLD', now() + interval '15 minutes',
        $7, $8, $9, $10, $11)
      RETURNING id, public_reference, status, check_in, check_out, total_naira, hold_expires_at`,
      [
        publicReference(), input.unitId, request.auth!.userId, isoDate(input.checkIn), isoDate(input.checkOut),
        input.guestCount, nightlyRate, cleaningFee, serviceFee, total, input.idempotencyKey,
      ],
    );
    await client.query('COMMIT');
    response.status(201).json({ data: result.rows[0], idempotentReplay: false });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}));
