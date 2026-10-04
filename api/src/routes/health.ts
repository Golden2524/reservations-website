import { Router } from 'express';
import { env } from '../config/env.js';

export const healthRouter = Router();

healthRouter.get('/', (_request, response) => {
  response.status(200).json({
    status: 'ok',
    service: 'reserveflow-api',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});
