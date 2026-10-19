import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { clientOrigins } from './config/env.js';
import { errorHandler } from './http/error-handler.js';
import { paystackWebhookRouter } from './modules/payments/paystack-webhook.router.js';
import { apiRouter } from './routes/index.js';

export const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || clientOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS.'));
  },
  credentials: true,
}));
app.use(pinoHttp({ redact: ['req.headers.authorization', 'req.headers.cookie'] }));
app.use('/api/v1/payments/paystack/webhook', express.raw({ type: 'application/json', limit: '1mb' }), paystackWebhookRouter);
app.use(express.json({ limit: '1mb' }));
app.use('/api/v1', apiRouter);

app.use((_request, response) => {
  response.status(404).json({ error: 'Route not found' });
});

app.use(errorHandler);
