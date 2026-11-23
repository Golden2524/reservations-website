import cors from 'cors';
import { randomUUID } from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { clientOrigins } from './config/env.js';
import { errorHandler } from './http/error-handler.js';
import { paystackWebhookRouter } from './modules/payments/paystack-webhook.router.js';
import { apiRouter } from './routes/index.js';

export const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || clientOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS.'));
  },
  credentials: true,
}));
app.use((request, response, next) => {
  const supplied = request.header('x-request-id')?.trim();
  const requestId = supplied && /^[a-zA-Z0-9_-]{8,100}$/.test(supplied) ? supplied : randomUUID();
  response.locals.requestId = requestId;
  response.setHeader('X-Request-Id', requestId);
  next();
});
app.use(pinoHttp({ redact: ['req.headers.authorization', 'req.headers.cookie'], customProps: (_request, response) => ({ requestId: response.locals.requestId }) }));
app.use('/api/v1/payments/paystack/webhook', express.raw({ type: 'application/json', limit: '1mb' }), paystackWebhookRouter);
app.use(express.json({ limit: '1mb' }));
app.use('/api/v1', apiRouter);

app.use((_request, response) => {
  response.status(404).json({ error: 'Route not found', requestId: response.locals.requestId });
});

app.use(errorHandler);
