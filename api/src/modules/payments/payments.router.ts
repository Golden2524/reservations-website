import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../auth/require-auth.js';
import { createDatabaseClient } from '../../db/client.js';
import { ApiError } from '../../errors/api-error.js';
import { asyncRoute } from '../../http/async-route.js';
import { assertPaystackConfigured, initializePaystackTransaction } from './paystack.js';

const checkoutSchema = z.object({
  reservationId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(16).max(255),
});

const paymentReference = () => `RF-PAY-${randomUUID().replaceAll('-', '').slice(0, 18).toUpperCase()}`;

export const paymentsRouter = Router();
paymentsRouter.use(requireAuth);

paymentsRouter.get('/:reference', asyncRoute(async (request, response) => {
  const reference = z.string().trim().regex(/^RF-PAY-[A-Z0-9]+$/).parse(request.params.reference);
  const client = createDatabaseClient();
  await client.connect();
  try {
    const result = await client.query<{
      payment_status: string; reservation_status: string; public_reference: string; property_name: string;
    }>(
      `SELECT pay.status AS payment_status, r.status AS reservation_status, r.public_reference, p.name AS property_name
       FROM payments pay
       JOIN reservations r ON r.id = pay.reservation_id
       JOIN units u ON u.id = r.unit_id
       JOIN properties p ON p.id = u.property_id
       WHERE pay.provider = 'PAYSTACK' AND pay.provider_reference = $1 AND r.guest_id = $2`,
      [reference, request.auth!.userId],
    );
    if (!result.rowCount) throw new ApiError(404, 'Payment not found.', 'PAYMENT_NOT_FOUND');
    response.json({ data: result.rows[0] });
  } finally {
    await client.end();
  }
}));

paymentsRouter.post('/credits-checkout', asyncRoute(async (request, response) => {
  const input = checkoutSchema.parse(request.body);
  const client = createDatabaseClient();
  await client.connect();
  try {
    await client.query('BEGIN');
    const replay = await client.query<{ reservation_id: string; public_reference: string; credits_used_naira: number }>(
      `SELECT r.id AS reservation_id, r.public_reference, -w.amount_naira AS credits_used_naira
       FROM wallet_ledger_entries w
       JOIN reservations r ON r.id = w.reservation_id
       WHERE w.idempotency_key = $1
         AND w.wallet_account_id = (SELECT id FROM wallet_accounts WHERE user_id = $2)
         AND w.entry_type = 'BOOKING_REDEMPTION'`,
      [input.idempotencyKey, request.auth!.userId],
    );
    if (replay.rowCount) {
      if (replay.rows[0].reservation_id !== input.reservationId) {
        throw new ApiError(409, 'This idempotency key belongs to a different reservation.', 'IDEMPOTENCY_KEY_REUSED');
      }
      await client.query('COMMIT');
      response.json({ data: { publicReference: replay.rows[0].public_reference, creditsUsedNaira: replay.rows[0].credits_used_naira }, idempotentReplay: true });
      return;
    }
    const reservation = await client.query<{ id: string; public_reference: string; total_naira: number }>(
      `SELECT id, public_reference, total_naira FROM reservations
       WHERE id = $1 AND guest_id = $2 AND status = 'HOLD' AND hold_expires_at > now()
       FOR UPDATE`,
      [input.reservationId, request.auth!.userId],
    );
    if (!reservation.rowCount) throw new ApiError(409, 'This reservation is not eligible for credit payment.', 'RESERVATION_NOT_PAYABLE');
    const current = reservation.rows[0];
    await client.query(`INSERT INTO wallet_accounts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [request.auth!.userId]);
    const wallet = await client.query<{ id: string; credits_balance_naira: number }>(
      `SELECT id, credits_balance_naira FROM wallet_accounts WHERE user_id = $1 FOR UPDATE`,
      [request.auth!.userId],
    );
    if (wallet.rows[0].credits_balance_naira < current.total_naira) {
      throw new ApiError(422, 'Your ReserveFlow Credits do not fully cover this booking total.', 'INSUFFICIENT_BOOKING_CREDITS');
    }
    await client.query(
      `UPDATE wallet_accounts SET credits_balance_naira = credits_balance_naira - $2, updated_at = now() WHERE id = $1`,
      [wallet.rows[0].id, current.total_naira],
    );
    await client.query(
      `INSERT INTO wallet_ledger_entries (wallet_account_id, reservation_id, balance_type, entry_type, amount_naira, reason, idempotency_key)
       VALUES ($1, $2, 'CREDITS', 'BOOKING_REDEMPTION', $3, $4, $5)`,
      [wallet.rows[0].id, current.id, -current.total_naira, `Full booking payment for ${current.public_reference}`, input.idempotencyKey],
    );
    await client.query(
      `UPDATE reservations SET status = 'CONFIRMED', hold_expires_at = NULL, updated_at = now() WHERE id = $1`,
      [current.id],
    );
    await client.query(
      `INSERT INTO reservation_events (reservation_id, actor_id, event_type, metadata)
       VALUES ($1, $2, 'RESERVATION_CONFIRMED_WITH_CREDITS', jsonb_build_object('creditsUsedNaira', $3))`,
      [current.id, request.auth!.userId, current.total_naira],
    );
    await client.query('COMMIT');
    response.status(201).json({ data: { publicReference: current.public_reference, creditsUsedNaira: current.total_naira }, idempotentReplay: false });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { await client.end(); }
}));

paymentsRouter.post('/checkout', asyncRoute(async (request, response) => {
  const input = checkoutSchema.parse(request.body);
  assertPaystackConfigured();
  const client = createDatabaseClient();
  await client.connect();
  let payment: {
    id: string; reservation_id: string; provider_reference: string; amount_naira: number; checkout_url: string | null; email: string;
  };
  try {
    await client.query('BEGIN');
    const existingByKey = await client.query<{
      id: string; reservation_id: string; provider_reference: string; amount_naira: number; checkout_url: string | null; email: string;
    }>(
      `SELECT pay.id, pay.reservation_id, pay.provider_reference, pay.amount_naira, pay.checkout_url, u.email
       FROM payments pay
       JOIN reservations r ON r.id = pay.reservation_id
       JOIN users u ON u.id = r.guest_id
       WHERE pay.idempotency_key = $1 AND r.guest_id = $2`,
      [input.idempotencyKey, request.auth!.userId],
    );
    if (existingByKey.rowCount) {
      payment = existingByKey.rows[0];
      if (payment.reservation_id !== input.reservationId) {
        throw new ApiError(409, 'This idempotency key belongs to a different reservation.', 'IDEMPOTENCY_KEY_REUSED');
      }
      await client.query('COMMIT');
    } else {
      const existingForReservation = await client.query<{
        id: string; reservation_id: string; provider_reference: string; amount_naira: number; checkout_url: string | null; email: string;
      }>(
        `SELECT pay.id, pay.reservation_id, pay.provider_reference, pay.amount_naira, pay.checkout_url, u.email
         FROM payments pay
         JOIN reservations r ON r.id = pay.reservation_id
         JOIN users u ON u.id = r.guest_id
         WHERE pay.reservation_id = $1 AND r.guest_id = $2 AND pay.status = 'PENDING'
         ORDER BY pay.created_at DESC LIMIT 1`,
        [input.reservationId, request.auth!.userId],
      );
      if (existingForReservation.rowCount) {
        payment = existingForReservation.rows[0];
        await client.query('COMMIT');
      } else {
      const reservation = await client.query<{ id: string; total_naira: number; email: string }>(
        `SELECT r.id, r.total_naira, u.email
         FROM reservations r JOIN users u ON u.id = r.guest_id
         WHERE r.id = $1
           AND r.guest_id = $2
           AND r.status = 'HOLD'
           AND r.hold_expires_at > now()
         FOR UPDATE`,
        [input.reservationId, request.auth!.userId],
      );
      if (!reservation.rowCount) {
        throw new ApiError(409, 'This reservation is not eligible for payment.', 'RESERVATION_NOT_PAYABLE');
      }
      const current = reservation.rows[0];
      const reference = paymentReference();
      const created = await client.query<{
        id: string; reservation_id: string; provider_reference: string; amount_naira: number; checkout_url: string | null;
      }>(
        `INSERT INTO payments (reservation_id, provider, provider_reference, amount_naira, status, idempotency_key)
         VALUES ($1, 'PAYSTACK', $2, $3, 'PENDING', $4)
         RETURNING id, reservation_id, provider_reference, amount_naira, checkout_url`,
        [current.id, reference, current.total_naira, input.idempotencyKey],
      );
      await client.query(
        `UPDATE reservations
         SET status = 'PENDING_PAYMENT', hold_expires_at = NULL,
             payment_expires_at = now() + interval '15 minutes', updated_at = now()
         WHERE id = $1`,
        [current.id],
      );
      await client.query('COMMIT');
      payment = { ...created.rows[0], email: current.email };
      }
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }

  if (payment.checkout_url) {
    response.json({ data: { checkoutUrl: payment.checkout_url, reference: payment.provider_reference }, idempotentReplay: true });
    return;
  }

  const checkout = await initializePaystackTransaction({
    email: payment.email,
    amountKobo: payment.amount_naira * 100,
    reference: payment.provider_reference,
    metadata: { paymentId: payment.id, reservationId: payment.reservation_id },
  });
  const updateClient = createDatabaseClient();
  await updateClient.connect();
  try {
    await updateClient.query(
      `UPDATE payments SET checkout_url = $2, checkout_access_code = $3, initialized_at = now(), updated_at = now()
       WHERE id = $1`,
      [payment.id, checkout.authorizationUrl, checkout.accessCode],
    );
  } finally {
    await updateClient.end();
  }
  response.status(201).json({ data: { checkoutUrl: checkout.authorizationUrl, reference: checkout.reference }, idempotentReplay: false });
}));
