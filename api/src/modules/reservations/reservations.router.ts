import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../auth/require-auth.js';
import { createDatabaseClient } from '../../db/client.js';
import { ApiError } from '../../errors/api-error.js';
import { asyncRoute } from '../../http/async-route.js';
import { expireReservationsForUnit } from './expire-reservations.js';

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

reservationsRouter.use(requireAuth);

reservationsRouter.get('/mine', asyncRoute(async (request, response) => {
  const client = createDatabaseClient();
  await client.connect();
  try {
    const result = await client.query(
      `SELECT r.id, r.public_reference, r.check_in, r.check_out, r.guest_count, r.status,
        r.total_naira, r.hold_expires_at, r.payment_expires_at, r.cancelled_at, r.cancellation_reason, r.created_at,
        u.name AS unit_name, p.name AS property_name, p.slug AS property_slug, p.area, p.city
       FROM reservations r
       JOIN units u ON u.id = r.unit_id
       JOIN properties p ON p.id = u.property_id
       WHERE r.guest_id = $1
       ORDER BY r.created_at DESC`,
      [request.auth!.userId],
    );
    response.json({ data: result.rows });
  } finally {
    await client.end();
  }
}));

const cancelReservationSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

reservationsRouter.post('/:reservationId/cancel', asyncRoute(async (request, response) => {
  const reservationId = z.string().uuid().parse(request.params.reservationId);
  const input = cancelReservationSchema.parse(request.body);
  const client = createDatabaseClient();
  await client.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE reservations
       SET status = 'CANCELLED', cancelled_at = now(), cancellation_reason = $3,
           hold_expires_at = NULL, payment_expires_at = NULL, updated_at = now()
       WHERE id = $1 AND guest_id = $2 AND status IN ('HOLD', 'PENDING_PAYMENT', 'CONFIRMED')
       RETURNING id, public_reference, status, cancelled_at, cancellation_reason`,
      [reservationId, request.auth!.userId, input.reason],
    );
    if (!result.rowCount) {
      throw new ApiError(409, 'This reservation cannot be cancelled.', 'RESERVATION_NOT_CANCELLABLE');
    }
    await client.query(
      `INSERT INTO reservation_events (reservation_id, actor_id, event_type, metadata)
       VALUES ($1, $2, 'RESERVATION_CANCELLED_BY_GUEST', jsonb_build_object('reason', $3))`,
      [reservationId, request.auth!.userId, input.reason],
    );
    await client.query('COMMIT');
    response.json({ data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}));

reservationsRouter.post('/', asyncRoute(async (request, response) => {
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
       FOR UPDATE`,
      [input.unitId],
    );
    if (!unit.rowCount) throw new ApiError(404, 'Bookable unit not found', 'UNIT_NOT_FOUND');
    await expireReservationsForUnit(client, input.unitId);
    if (input.guestCount > unit.rows[0].max_guests) {
      throw new ApiError(422, 'Guest count exceeds this unit capacity', 'GUEST_CAPACITY_EXCEEDED');
    }

    const blocked = await client.query(
      `SELECT 1 FROM availability_blocks
       WHERE unit_id = $1
         AND daterange(starts_on, ends_on, '[)') && daterange($2::date, $3::date, '[)')
       LIMIT 1`,
      [input.unitId, isoDate(input.checkIn), isoDate(input.checkOut)],
    );
    if (blocked.rowCount) {
      throw new ApiError(409, 'This accommodation is unavailable for those dates.', 'UNIT_UNAVAILABLE');
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
