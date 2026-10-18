import { Client } from 'pg';
import { env } from '../config/env.js';

export const createDatabaseClient = (): Client => {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set before accessing the database.');
  }

  const connectionUrl = new URL(env.DATABASE_URL);
  if (connectionUrl.searchParams.get('sslmode') === 'require') {
    connectionUrl.searchParams.set('sslmode', 'verify-full');
  }

  return new Client({ connectionString: connectionUrl.toString() });
};
