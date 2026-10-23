import { createDatabaseClient } from '../db/client.js';

const email = process.argv[2]?.trim().toLowerCase();
if (!email) throw new Error('Usage: npm run admin:promote -- owner@example.com');

const client = createDatabaseClient();
await client.connect();
try {
  const result = await client.query<{ email: string; role: string }>(
    `UPDATE users SET role = 'ADMIN', updated_at = now() WHERE email = $1 RETURNING email, role`,
    [email],
  );
  if (!result.rowCount) throw new Error(`No ReserveFlow account exists for ${email}. Create the account first.`);
  console.info(`Promoted ${result.rows[0].email} to ${result.rows[0].role}. Sign out and sign in again to receive an admin token.`);
} finally { await client.end(); }
