import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { apiRouter } from './routes/index.js';

export const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
app.use(pinoHttp());
app.use(express.json({ limit: '1mb' }));
app.use('/api/v1', apiRouter);

app.use((_request, response) => {
  response.status(404).json({ error: 'Route not found' });
});
