import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.router.js';
import { propertiesRouter } from '../modules/properties/properties.router.js';
import { reservationsRouter } from '../modules/reservations/reservations.router.js';
import { healthRouter } from './health.js';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/properties', propertiesRouter);
apiRouter.use('/reservations', reservationsRouter);
