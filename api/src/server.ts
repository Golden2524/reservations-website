import { app } from './app.js';
import { env } from './config/env.js';

const server = app.listen(env.PORT, () => {
  console.info(`ReserveFlow API listening on port ${env.PORT}`);
});

const shutdown = (signal: string) => {
  console.info(`${signal} received; closing API server.`);
  server.close(() => process.exit(0));
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
