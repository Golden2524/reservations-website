import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;
const hostEmail = 'demo-host@reserveflow.test';
const properties = [
  ['Aso View Courtyard', 'aso-view-courtyard', 'Kuje Central', 'Demo address, Kuje Central', 28500, 4500, 2, 'Courtyard Studio', 1, 'A calm, self-contained demo stay close to the centre of Kuje.'],
  ['Maple House Kuje', 'maple-house-kuje', 'Kuje Central', 'Demo address, Kuje Central', 42000, 6000, 4, 'Family Apartment', 2, 'A spacious two-bedroom demo home designed for small groups visiting Kuje.'],
  ['Green Haven Lodge', 'green-haven-lodge', 'Kuje', 'Demo address, Kuje', 22000, 3000, 2, 'Garden Room', 1, 'A simple, comfortable demo overnight stay for guests exploring Kuje.'],
];

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set before seeding demo inventory.');
const databaseUrl = new URL(process.env.DATABASE_URL);
if (databaseUrl.searchParams.get('sslmode') === 'require') databaseUrl.searchParams.set('sslmode', 'verify-full');
const client = new Client({ connectionString: databaseUrl.toString() });
await client.connect();

try {
  await client.query('BEGIN');
  const host = await client.query(
    `INSERT INTO users (email, first_name, last_name, role) VALUES ($1, 'ReserveFlow', 'Demo Host', 'HOST')
     ON CONFLICT (email) DO UPDATE SET role = 'HOST', updated_at = now() RETURNING id`, [hostEmail],
  );
  const hostId = host.rows[0].id;
  await client.query(
    `INSERT INTO host_profiles (user_id, business_name, verified_at) VALUES ($1, 'ReserveFlow Demo Stays', now())
     ON CONFLICT (user_id) DO UPDATE SET verified_at = now(), updated_at = now()`, [hostId],
  );
  for (const [name, slug, area, address, rate, cleaningFee, guests, unit, bedrooms, description] of properties) {
    const property = await client.query(
      `INSERT INTO properties (host_id, name, slug, description, status, address_line_1, area, city, state)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $6, 'Kuje', 'FCT Abuja')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description,
         status = 'ACTIVE', area = EXCLUDED.area, updated_at = now() RETURNING id`,
      [hostId, name, slug, description, address, area],
    );
    await client.query(
      `INSERT INTO units (property_id, name, unit_type, description, max_guests, bedrooms, bathrooms, base_nightly_rate_naira, cleaning_fee_naira, status)
       VALUES ($1, $2, 'Entire place', $3, $4, $5, 1, $6, $7, 'ACTIVE')
       ON CONFLICT (property_id, name) DO UPDATE SET max_guests = EXCLUDED.max_guests, bedrooms = EXCLUDED.bedrooms,
         base_nightly_rate_naira = EXCLUDED.base_nightly_rate_naira, cleaning_fee_naira = EXCLUDED.cleaning_fee_naira,
         status = 'ACTIVE', updated_at = now()`,
      [property.rows[0].id, unit, description, guests, bedrooms, rate, cleaningFee],
    );
  }
  await client.query('COMMIT');
  console.log(`Seeded ${properties.length} clearly labelled demo Kuje properties.`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
