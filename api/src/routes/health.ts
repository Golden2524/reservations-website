import { Router } from 'express';
import { env } from '../config/env.js';
import { createDatabaseClient } from '../db/client.js';

export const healthRouter = Router();

healthRouter.get('/', (_request, response) => {
  response.status(200).json({
    status: 'ok',
    service: 'reserveflow-api',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Readiness is intentionally separate from liveness. Render can use `/health`
 * to decide whether the process is alive, while an external monitor can use
 * this endpoint to alert when the booking database is unavailable.
 */
healthRouter.get('/readiness', async (_request, response) => {
  try {
    const client = createDatabaseClient();
    await client.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      await client.end();
    }
    response.status(200).json({
      status: 'ready',
      service: 'reserveflow-api',
      database: 'reachable',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error({ error }, 'Readiness check failed');
    response.status(503).json({
      status: 'unavailable',
      service: 'reserveflow-api',
      database: 'unreachable',
    });
  }
});
