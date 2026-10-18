import { Router } from 'express';
import { propertiesRouter } from '../modules/properties/properties.router.js';
import { reservationsRouter } from '../modules/reservations/reservations.router.js';
import { healthRouter } from './health.js';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/properties', propertiesRouter);
apiRouter.use('/reservations', reservationsRouter);
