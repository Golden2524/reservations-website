import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../auth/require-auth.js';
import { createDatabaseClient } from '../../db/client.js';
import { ApiError } from '../../errors/api-error.js';
import { asyncRoute } from '../../http/async-route.js';

const applicationSchema = z.object({
  businessName: z.string().trim().min(2).max(160),
  businessPhone: z.string().trim().min(7).max(20),
  notes: z.string().trim().max(2000).optional(),
});

export const hostApplicationsRouter = Router();

hostApplicationsRouter.post('/', requireAuth, asyncRoute(async (request, response) => {
  const input = applicationSchema.parse(request.body);
  if (request.auth!.role !== 'GUEST') {
    throw new ApiError(409, 'Only guest accounts can submit a new host application.', 'HOST_APPLICATION_NOT_ALLOWED');
  }

  const client = createDatabaseClient();
  await client.connect();
  try {
    const result = await client.query(
      `INSERT INTO host_applications (applicant_id, business_name, business_phone, notes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (applicant_id) DO UPDATE
         SET business_name = EXCLUDED.business_name,
             business_phone = EXCLUDED.business_phone,
             notes = EXCLUDED.notes,
             status = 'SUBMITTED',
             reviewed_by = NULL,
             reviewed_at = NULL,
             review_note = NULL,
             updated_at = now()
         WHERE host_applications.status IN ('SUBMITTED', 'REJECTED')
       RETURNING id, status, business_name, business_phone, created_at, updated_at`,
      [request.auth!.userId, input.businessName, input.businessPhone, input.notes ?? null],
    );
    if (!result.rowCount) {
      throw new ApiError(409, 'Your host application is already under review or approved.', 'HOST_APPLICATION_LOCKED');
    }
    response.status(201).json({ data: result.rows[0] });
  } finally {
    await client.end();
  }
}));
