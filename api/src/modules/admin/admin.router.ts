import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../auth/require-auth.js';
import { requireRole } from '../../auth/require-role.js';
import { createDatabaseClient } from '../../db/client.js';
import { ApiError } from '../../errors/api-error.js';
import { asyncRoute } from '../../http/async-route.js';

const applicationIdSchema = z.string().uuid();
const propertyIdSchema = z.string().uuid();
const reviewSchema = z.object({ reviewNote: z.string().trim().max(2000).optional() });
const supportRequestIdSchema = z.string().uuid();
const supportStatusSchema = z.object({
  status: z.enum(['IN_PROGRESS', 'RESOLVED']),
  internalNote: z.string().trim().min(2).max(2000).optional(),
});
const creditGrantSchema = z.object({
  email: z.string().trim().email(),
  amountNaira: z.coerce.number().int().min(100).max(1_000_000),
  reason: z.string().trim().min(3).max(300),
  idempotencyKey: z.string().trim().min(16).max(255),
});

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('ADMIN'));

adminRouter.get('/overview', asyncRoute(async (_request, response) => {
  const client = createDatabaseClient();
  await client.connect();
  try {
    const result = await client.query<{
      active_properties: number; pending_host_applications: number; pending_property_reviews: number;
      open_support_cases: number; confirmed_bookings: number; bookings_last_30_days: number; confirmed_booking_value_naira: string;
    }>(
      `SELECT
        (SELECT COUNT(*)::int FROM properties WHERE status = 'ACTIVE') AS active_properties,
        (SELECT COUNT(*)::int FROM host_applications WHERE status IN ('SUBMITTED', 'UNDER_REVIEW')) AS pending_host_applications,
        (SELECT COUNT(*)::int FROM properties WHERE status = 'PENDING_REVIEW') AS pending_property_reviews,
        (SELECT COUNT(*)::int FROM support_requests WHERE status IN ('OPEN', 'IN_PROGRESS')) AS open_support_cases,
        (SELECT COUNT(*)::int FROM reservations WHERE status IN ('CONFIRMED', 'CHECKED_IN', 'COMPLETED')) AS confirmed_bookings,
        (SELECT COUNT(*)::int FROM reservations WHERE created_at >= now() - interval '30 days') AS bookings_last_30_days,
        (SELECT COALESCE(SUM(total_naira), 0)::bigint FROM reservations WHERE status IN ('CONFIRMED', 'CHECKED_IN', 'COMPLETED')) AS confirmed_booking_value_naira`,
    );
    response.json({ data: result.rows[0] });
  } finally { await client.end(); }
}));

adminRouter.get('/support-requests', asyncRoute(async (_request, response) => {
  const client = createDatabaseClient();
  await client.connect();
  try {
    const result = await client.query(
      `SELECT id, public_reference, name, email, topic, message, reservation_reference,
        status, created_at, updated_at, handled_at, internal_note
       FROM support_requests
       WHERE status IN ('OPEN', 'IN_PROGRESS')
       ORDER BY CASE status WHEN 'OPEN' THEN 0 ELSE 1 END, created_at ASC`,
    );
    response.json({ data: result.rows });
  } finally { await client.end(); }
}));

adminRouter.patch('/support-requests/:supportRequestId', asyncRoute(async (request, response) => {
  const supportRequestId = supportRequestIdSchema.parse(request.params.supportRequestId);
  const input = supportStatusSchema.parse(request.body);
  const client = createDatabaseClient();
  await client.connect();
  try {
    const result = await client.query(
      `UPDATE support_requests
       SET status = $2, internal_note = $3, handled_by = $4, handled_at = now(), updated_at = now()
       WHERE id = $1 AND status IN ('OPEN', 'IN_PROGRESS')
       RETURNING id, public_reference, status, updated_at`,
      [supportRequestId, input.status, input.internalNote ?? null, request.auth!.userId],
    );
    if (!result.rowCount) throw new ApiError(404, 'Support request not found or already resolved.', 'SUPPORT_REQUEST_NOT_FOUND');
    response.json({ data: result.rows[0] });
  } finally { await client.end(); }
}));

adminRouter.post('/wallet-credits/grant', asyncRoute(async (request, response) => {
  const input = creditGrantSchema.parse(request.body);
  const client = createDatabaseClient();
  await client.connect();
  try {
    await client.query('BEGIN');
    const recipient = await client.query<{ id: string; email: string }>(`SELECT id, email FROM users WHERE email = $1 FOR UPDATE`, [input.email]);
    if (!recipient.rowCount) throw new ApiError(404, 'No ReserveFlow account exists for that email address.', 'WALLET_RECIPIENT_NOT_FOUND');
    const replay = await client.query(`SELECT id FROM wallet_ledger_entries WHERE idempotency_key = $1`, [input.idempotencyKey]);
    if (replay.rowCount) throw new ApiError(409, 'This credit grant has already been processed.', 'WALLET_CREDIT_REPLAY');
    await client.query(`INSERT INTO wallet_accounts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [recipient.rows[0].id]);
    const account = await client.query<{ id: string; credits_balance_naira: number }>(
      `SELECT id, credits_balance_naira FROM wallet_accounts WHERE user_id = $1 FOR UPDATE`, [recipient.rows[0].id],
    );
    await client.query(
      `UPDATE wallet_accounts SET credits_balance_naira = credits_balance_naira + $2, updated_at = now() WHERE id = $1`,
      [account.rows[0].id, input.amountNaira],
    );
    const entry = await client.query(
      `INSERT INTO wallet_ledger_entries (wallet_account_id, balance_type, entry_type, amount_naira, reason, created_by, idempotency_key)
       VALUES ($1, 'CREDITS', 'CREDIT_GRANT', $2, $3, $4, $5)
       RETURNING id, amount_naira, reason, created_at`,
      [account.rows[0].id, input.amountNaira, input.reason, request.auth!.userId, input.idempotencyKey],
    );
    await client.query('COMMIT');
    response.status(201).json({ data: { recipient: recipient.rows[0].email, creditsBalanceNaira: account.rows[0].credits_balance_naira + input.amountNaira, entry: entry.rows[0] } });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { await client.end(); }
}));

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

adminRouter.get('/properties/review', asyncRoute(async (_request, response) => {
  const client = createDatabaseClient();
  await client.connect();
  try {
    const result = await client.query(
      `SELECT p.id, p.name, p.slug, p.description, p.address_line_1, p.area, p.city, p.state, p.photo_urls,
        p.status, p.created_at, p.updated_at, h.business_name, u.email AS host_email,
        COUNT(un.id)::int AS unit_count
       FROM properties p
       JOIN host_profiles h ON h.user_id = p.host_id
       JOIN users u ON u.id = p.host_id
       LEFT JOIN units un ON un.property_id = p.id AND un.status = 'ACTIVE'
       WHERE p.status = 'PENDING_REVIEW'
       GROUP BY p.id, h.business_name, u.email
       ORDER BY p.updated_at ASC`,
    );
    response.json({ data: result.rows });
  } finally {
    await client.end();
  }
}));

adminRouter.post('/properties/:propertyId/approve', asyncRoute(async (request, response) => {
  const propertyId = propertyIdSchema.parse(request.params.propertyId);
  const input = reviewSchema.parse(request.body);
  const client = createDatabaseClient();
  await client.connect();
  try {
    const result = await client.query(
      `UPDATE properties SET status = 'ACTIVE', updated_at = now()
       WHERE id = $1 AND status = 'PENDING_REVIEW' AND country_code = 'NG'
       RETURNING id, name, slug, status, updated_at`,
      [propertyId],
    );
    if (!result.rowCount) throw new ApiError(409, 'Property is not awaiting approval or its country is not enabled for public payments yet.', 'PROPERTY_NOT_READY_FOR_PUBLICATION');
    await client.query(
      `INSERT INTO property_review_events (property_id, actor_id, action, note)
       VALUES ($1, $2, 'APPROVED', $3)`,
      [propertyId, request.auth!.userId, input.reviewNote ?? null],
    );
    response.json({ data: result.rows[0] });
  } finally {
    await client.end();
  }
}));

adminRouter.post('/properties/:propertyId/suspend', asyncRoute(async (request, response) => {
  const propertyId = propertyIdSchema.parse(request.params.propertyId);
  const input = reviewSchema.parse(request.body);
  const client = createDatabaseClient();
  await client.connect();
  try {
    const result = await client.query(
      `UPDATE properties SET status = 'SUSPENDED', updated_at = now()
       WHERE id = $1 AND status = 'ACTIVE'
       RETURNING id, name, slug, status, updated_at`,
      [propertyId],
    );
    if (!result.rowCount) throw new ApiError(404, 'Active property not found.', 'PROPERTY_NOT_FOUND_FOR_SUSPENSION');
    await client.query(
      `INSERT INTO property_review_events (property_id, actor_id, action, note)
       VALUES ($1, $2, 'SUSPENDED', $3)`,
      [propertyId, request.auth!.userId, input.reviewNote ?? null],
    );
    response.json({ data: result.rows[0] });
  } finally {
    await client.end();
  }
}));
