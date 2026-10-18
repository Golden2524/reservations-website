import type { Client } from 'pg';

export const expireReservations = async (client: Client): Promise<number> => {
  const result = await client.query(
    `UPDATE reservations
     SET status = 'EXPIRED', hold_expires_at = NULL, payment_expires_at = NULL, updated_at = now()
     WHERE (status = 'HOLD' AND hold_expires_at <= now())
        OR (status = 'PENDING_PAYMENT' AND payment_expires_at <= now())
     RETURNING id`,
  );
  return result.rowCount ?? 0;
};

export const expireReservationsForUnit = async (client: Client, unitId: string): Promise<number> => {
  const result = await client.query(
    `UPDATE reservations
     SET status = 'EXPIRED', hold_expires_at = NULL, payment_expires_at = NULL, updated_at = now()
     WHERE unit_id = $1
       AND ((status = 'HOLD' AND hold_expires_at <= now())
         OR (status = 'PENDING_PAYMENT' AND payment_expires_at <= now()))
     RETURNING id`,
    [unitId],
  );
  return result.rowCount ?? 0;
};
