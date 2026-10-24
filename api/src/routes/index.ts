import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.router.js';
import { adminRouter } from '../modules/admin/admin.router.js';
import { hostApplicationsRouter } from '../modules/hosts/host-applications.router.js';
import { hostPropertiesRouter } from '../modules/hosts/host-properties.router.js';
import { propertiesRouter } from '../modules/properties/properties.router.js';
import { paymentsRouter } from '../modules/payments/payments.router.js';
import { reservationsRouter } from '../modules/reservations/reservations.router.js';
import { uploadsRouter } from '../modules/uploads/uploads.router.js';
import { supportRouter } from '../modules/support/support.router.js';
import { healthRouter } from './health.js';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/host-applications', hostApplicationsRouter);
apiRouter.use('/host/properties', hostPropertiesRouter);
apiRouter.use('/properties', propertiesRouter);
apiRouter.use('/payments', paymentsRouter);
apiRouter.use('/reservations', reservationsRouter);
apiRouter.use('/uploads', uploadsRouter);
apiRouter.use('/support', supportRouter);
