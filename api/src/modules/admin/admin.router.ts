import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../auth/require-auth.js';
import { requireRole } from '../../auth/require-role.js';
import { createDatabaseClient } from '../../db/client.js';
import { ApiError } from '../../errors/api-error.js';
import { asyncRoute } from '../../http/async-route.js';

const applicationIdSchema = z.string().uuid();
const reviewSchema = z.object({ reviewNote: z.string().trim().max(2000).optional() });

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('ADMIN'));

adminRouter.get('/host-applications', asyncRoute(async (_request, response) => {
  const client = createDatabaseClient();
  await client.connect();
  try {
    const result = await client.query(
      `SELECT a.id, a.business_name, a.business_phone, a.notes, a.status, a.created_at,
        u.id AS applicant_id, u.email, u.first_name, u.last_name
       FROM host_applications a JOIN users u ON u.id = a.applicant_id
       WHERE a.status IN ('SUBMITTED', 'UNDER_REVIEW')
       ORDER BY a.created_at ASC`,
    );
    response.json({ data: result.rows });
  } finally {
    await client.end();
  }
}));

adminRouter.post('/host-applications/:applicationId/approve', asyncRoute(async (request, response) => {
  const applicationId = applicationIdSchema.parse(request.params.applicationId);
  const input = reviewSchema.parse(request.body);
  const client = createDatabaseClient();
  await client.connect();
  try {
    await client.query('BEGIN');
    const application = await client.query<{ applicant_id: string; business_name: string }>(
      `SELECT applicant_id, business_name FROM host_applications
       WHERE id = $1 AND status IN ('SUBMITTED', 'UNDER_REVIEW') FOR UPDATE`,
      [applicationId],
    );
    if (!application.rowCount) throw new ApiError(404, 'Host application not found or cannot be approved.', 'HOST_APPLICATION_NOT_FOUND');

    const applicant = application.rows[0];
    await client.query(`UPDATE users SET role = 'HOST', updated_at = now() WHERE id = $1`, [applicant.applicant_id]);
    await client.query(
      `INSERT INTO host_profiles (user_id, business_name, verified_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id) DO UPDATE SET business_name = EXCLUDED.business_name, verified_at = now(), updated_at = now()`,
      [applicant.applicant_id, applicant.business_name],
    );
    const result = await client.query(
      `UPDATE host_applications
       SET status = 'APPROVED', reviewed_by = $2, reviewed_at = now(), review_note = $3, updated_at = now()
       WHERE id = $1
       RETURNING id, status, applicant_id, reviewed_at`,
      [applicationId, request.auth!.userId, input.reviewNote ?? null],
    );
    await client.query('COMMIT');
    response.json({ data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}));

adminRouter.post('/host-applications/:applicationId/reject', asyncRoute(async (request, response) => {
  const applicationId = applicationIdSchema.parse(request.params.applicationId);
  const input = reviewSchema.parse(request.body);
  const client = createDatabaseClient();
  await client.connect();
  try {
    const result = await client.query(
      `UPDATE host_applications
       SET status = 'REJECTED', reviewed_by = $2, reviewed_at = now(), review_note = $3, updated_at = now()
       WHERE id = $1 AND status IN ('SUBMITTED', 'UNDER_REVIEW')
       RETURNING id, status, applicant_id, reviewed_at`,
      [applicationId, request.auth!.userId, input.reviewNote ?? null],
    );
    if (!result.rowCount) throw new ApiError(404, 'Host application not found or cannot be rejected.', 'HOST_APPLICATION_NOT_FOUND');
    response.json({ data: result.rows[0] });
  } finally {
    await client.end();
  }
}));
