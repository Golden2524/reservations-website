import { createHash } from 'node:crypto';
import { Router } from 'express';
import { requireAuth } from '../../auth/require-auth.js';
import { requireRole } from '../../auth/require-role.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../errors/api-error.js';
import { asyncRoute } from '../../http/async-route.js';

export const uploadsRouter = Router();
uploadsRouter.use(requireAuth, requireRole('HOST'));

uploadsRouter.post('/property-image-signature', asyncRoute(async (request, response) => {
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    throw new ApiError(503, 'Image uploads are not configured yet. Please contact ReserveFlow support.', 'IMAGE_UPLOADS_UNAVAILABLE');
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `reserveflow/properties/${request.auth!.userId}`;
  const signature = createHash('sha1')
    .update(`folder=${folder}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`)
    .digest('hex');
  response.json({ data: { cloudName: env.CLOUDINARY_CLOUD_NAME, apiKey: env.CLOUDINARY_API_KEY, timestamp, folder, signature } });
}));
