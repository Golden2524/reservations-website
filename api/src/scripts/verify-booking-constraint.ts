import { randomUUID } from 'node:crypto';
import { DatabaseError } from 'pg';
import { createDatabaseClient } from '../db/client.js';

const client = createDatabaseClient();
const suffix = randomUUID();

await client.connect();
try {
  await client.query('BEGIN');

  const guest = await client.query<{ id: string }>(
    `INSERT INTO users (email, first_name, last_name)
     VALUES ($1, 'Test', 'Guest') RETURNING id`,
    [`guest-${suffix}@reserveflow.test`],
  );
  const host = await client.query<{ id: string }>(
    `INSERT INTO users (email, first_name, last_name, role)
     VALUES ($1, 'Test', 'Host', 'HOST') RETURNING id`,
    [`host-${suffix}@reserveflow.test`],
  );
  await client.query(
    'INSERT INTO host_profiles (user_id, business_name) VALUES ($1, $2)',
    [host.rows[0].id, `Constraint Test Host ${suffix}`],
  );
  const property = await client.query<{ id: string }>(
    `INSERT INTO properties (host_id, name, slug, description, address_line_1, area)
     VALUES ($1, $2, $3, 'Rollback-only constraint test property', '1 Test Lane', 'Kuje')
     RETURNING id`,
    [host.rows[0].id, `Constraint Test Stay ${suffix}`, `constraint-test-${suffix}`],
  );
  const unit = await client.query<{ id: string }>(
    `INSERT INTO units (property_id, name, unit_type, max_guests, base_nightly_rate_naira)
     VALUES ($1, 'Test Suite', 'Apartment', 2, 25000) RETURNING id`,
    [property.rows[0].id],
  );

  const reservationValues = [
    unit.rows[0].id,
    guest.rows[0].id,
    '2026-12-10',
    '2026-12-14',
    1,
    25000,
    100000,
  ];
  await client.query(
    `INSERT INTO reservations (
      public_reference, unit_id, guest_id, check_in, check_out, guest_count,
      status, nightly_rate_naira, total_naira, idempotency_key
    ) VALUES ($1, $2, $3, $4, $5, $6, 'CONFIRMED', $7, $8, $9)`,
    [`RF-${suffix}`, ...reservationValues, `reservation-${suffix}`],
  );

  let overlapRejected = false;
  try {
    await client.query(
      `INSERT INTO reservations (
        public_reference, unit_id, guest_id, check_in, check_out, guest_count,
        status, nightly_rate_naira, total_naira, idempotency_key
      ) VALUES ($1, $2, $3, '2026-12-12', '2026-12-16', 1, 'CONFIRMED', 25000, 100000, $4)`,
      [`RF-overlap-${suffix}`, unit.rows[0].id, guest.rows[0].id, `overlap-${suffix}`],
    );
  } catch (error) {
    overlapRejected = error instanceof DatabaseError && error.code === '23P01';
  }

  if (!overlapRejected) {
    throw new Error('Overlapping reservation was not rejected by PostgreSQL.');
  }

  console.info('Verified: PostgreSQL rejected an overlapping active reservation.');
} finally {
  await client.query('ROLLBACK');
  await client.end();
}
