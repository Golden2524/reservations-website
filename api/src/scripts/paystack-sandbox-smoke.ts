import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { app } from '../app.js';
import { signAccessToken } from '../auth/tokens.js';
import { env } from '../config/env.js';
import { createDatabaseClient } from '../db/client.js';

if (!env.PAYSTACK_SECRET_KEY?.startsWith('sk_test_')) {
  throw new Error('This smoke test runs only with a Paystack sk_test_ key.');
}

const suffix = randomUUID();
const guestEmail = `sandbox-guest-${suffix}@example.com`;
const hostEmail = `sandbox-host-${suffix}@example.com`;
let guestId = '';
let hostId = '';
let propertyId = '';
let reservationId = '';

const cleanup = async () => {
  const client = createDatabaseClient();
  await client.connect();
  try {
    await client.query('BEGIN');
    if (reservationId) {
      await client.query('DELETE FROM payments WHERE reservation_id = $1', [reservationId]);
      await client.query('DELETE FROM reservation_events WHERE reservation_id = $1', [reservationId]);
      await client.query('DELETE FROM reservations WHERE id = $1', [reservationId]);
    }
    if (propertyId) await client.query('DELETE FROM properties WHERE id = $1', [propertyId]);
    if (hostId) await client.query('DELETE FROM host_profiles WHERE user_id = $1', [hostId]);
    if (guestId) await client.query('DELETE FROM users WHERE id = $1', [guestId]);
    if (hostId) await client.query('DELETE FROM users WHERE id = $1', [hostId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
};

const client = createDatabaseClient();
await client.connect();
try {
  await client.query('BEGIN');
  guestId = (await client.query<{ id: string }>(
    `INSERT INTO users (email, first_name, last_name) VALUES ($1, 'Sandbox', 'Guest') RETURNING id`,
    [guestEmail],
  )).rows[0].id;
  hostId = (await client.query<{ id: string }>(
    `INSERT INTO users (email, first_name, last_name, role) VALUES ($1, 'Sandbox', 'Host', 'HOST') RETURNING id`,
    [hostEmail],
  )).rows[0].id;
  await client.query('INSERT INTO host_profiles (user_id, business_name, verified_at) VALUES ($1, $2, now())', [
    hostId,
    `Sandbox Host ${suffix}`,
  ]);
  propertyId = (await client.query<{ id: string }>(
    `INSERT INTO properties (host_id, name, slug, description, status, address_line_1, area)
     VALUES ($1, $2, $3, 'Temporary sandbox checkout property.', 'ACTIVE', '1 Test Lane', 'Kuje') RETURNING id`,
    [hostId, `Sandbox Stay ${suffix}`, `sandbox-${suffix}`],
  )).rows[0].id;
  const unitId = (await client.query<{ id: string }>(
    `INSERT INTO units (property_id, name, unit_type, max_guests, base_nightly_rate_naira)
     VALUES ($1, 'Sandbox Suite', 'Apartment', 2, 25000) RETURNING id`,
    [propertyId],
  )).rows[0].id;
  reservationId = (await client.query<{ id: string }>(
    `INSERT INTO reservations (
      public_reference, unit_id, guest_id, check_in, check_out, guest_count, status,
      hold_expires_at, nightly_rate_naira, total_naira, idempotency_key
    ) VALUES ($1, $2, $3, '2027-02-10', '2027-02-12', 1, 'HOLD', now() + interval '15 minutes', 25000, 50000, $4)
    RETURNING id`,
    [`RF-SANDBOX-${suffix.slice(0, 8)}`, unitId, guestId, `reservation-${suffix}`],
  )).rows[0].id;
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}

const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
let checkoutVerified = false;
try {
  const port = (server.address() as { port: number }).port;
  const token = await signAccessToken({ userId: guestId, email: guestEmail, role: 'GUEST' });
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/payments/checkout`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ reservationId, idempotencyKey: `checkout-${suffix}` }),
  });
  const body = await response.json() as {
    data?: { checkoutUrl?: string; reference?: string };
    error?: string;
    code?: string;
  };
  if (response.status !== 201 || !body.data?.checkoutUrl?.startsWith('https://checkout.paystack.com/') || !body.data.reference) {
    throw new Error(`Paystack sandbox initialization failed: ${body.code ?? 'UNKNOWN'} — ${body.error ?? `HTTP ${response.status}`}.`);
  }
  checkoutVerified = true;
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await cleanup();
}

if (!checkoutVerified) throw new Error('Paystack sandbox checkout was not verified.');

const verificationClient = createDatabaseClient();
await verificationClient.connect();
try {
  const verification = await verificationClient.query<{ remaining_records: number }>(
    `SELECT (
      (SELECT count(*) FROM users WHERE email IN ($1, $2))
      + (SELECT count(*) FROM properties WHERE id = $3)
      + (SELECT count(*) FROM reservations WHERE id = $4)
    )::int AS remaining_records`,
    [guestEmail, hostEmail, propertyId, reservationId],
  );
  if (verification.rows[0].remaining_records !== 0) {
    throw new Error('Sandbox cleanup did not remove all temporary database records.');
  }
} finally {
  await verificationClient.end();
}

process.stdout.write('Verified: Paystack test checkout initialized and temporary Neon records were removed.\n');
