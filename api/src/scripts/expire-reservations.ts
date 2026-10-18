import { createDatabaseClient } from '../db/client.js';
import { expireReservations } from '../modules/reservations/expire-reservations.js';

const client = createDatabaseClient();
await client.connect();
try {
  await client.query('BEGIN');
  const expiredCount = await expireReservations(client);
  await client.query('COMMIT');
  console.info(`Expired ${expiredCount} stale reservation hold(s).`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
