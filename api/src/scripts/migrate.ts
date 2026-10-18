import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabaseClient } from '../db/client.js';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = join(scriptDirectory, '../../db/migrations');

const client = createDatabaseClient();

const migrationFiles = (await readdir(migrationsDirectory))
  .filter((file) => file.endsWith('.sql'))
  .sort();

await client.connect();

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  for (const fileName of migrationFiles) {
    const sql = await readFile(join(migrationsDirectory, fileName), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const result = await client.query<{ checksum: string }>(
      'SELECT checksum FROM schema_migrations WHERE name = $1',
      [fileName],
    );

    if (result.rowCount === 1) {
      if (result.rows[0].checksum !== checksum) {
        throw new Error(`Migration ${fileName} was changed after it was applied.`);
      }
      console.info(`Skipped ${fileName}; already applied.`);
      continue;
    }

    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
        [fileName, checksum],
      );
      await client.query('COMMIT');
      console.info(`Applied ${fileName}.`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  await client.end();
}
