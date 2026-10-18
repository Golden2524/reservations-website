import { Router } from 'express';
import { createDatabaseClient } from '../../db/client.js';
import { verifyPaystackSignature, type PaystackEvent } from './paystack.js';

export const paystackWebhookRouter = Router();

paystackWebhookRouter.post('/', async (request, response, next) => {
  try {
    const rawBody = request.body as Buffer;
    const signature = request.header('x-paystack-signature');
    if (!Buffer.isBuffer(rawBody) || !verifyPaystackSignature(rawBody, signature)) {
      response.status(401).json({ error: 'Invalid webhook signature.' });
      return;
    }
    const event = JSON.parse(rawBody.toString('utf8')) as PaystackEvent;
    const reference = event.data?.reference;
    if (!reference || typeof reference !== 'string') {
      response.status(200).json({ received: true });
      return;
    }

    const client = createDatabaseClient();
    await client.connect();
    try {
      await client.query('BEGIN');
      const eventId = `${event.event}:${reference}`;
      const recorded = await client.query(
        `INSERT INTO payment_webhook_events (provider, provider_event_id, payload, processed_at)
         VALUES ('PAYSTACK', $1, $2::jsonb, now())
         ON CONFLICT (provider, provider_event_id) DO NOTHING
         RETURNING id`,
        [eventId, rawBody.toString('utf8')],
      );
      if (recorded.rowCount && event.event === 'charge.success' && event.data.status === 'success') {
        const payment = await client.query<{ reservation_id: string }>(
          `UPDATE payments SET status = 'PAID', updated_at = now()
           WHERE provider = 'PAYSTACK' AND provider_reference = $1 AND status <> 'PAID'
           RETURNING reservation_id`,
          [reference],
        );
        if (payment.rowCount) {
          await client.query(
            `UPDATE reservations SET status = 'CONFIRMED', updated_at = now()
             WHERE id = $1 AND status = 'PENDING_PAYMENT'`,
            [payment.rows[0].reservation_id],
          );
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      await client.end();
    }
    response.status(200).json({ received: true });
  } catch (error) {
    next(error);
  }
});
