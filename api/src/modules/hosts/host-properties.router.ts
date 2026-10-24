import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../auth/require-auth.js';
import { requireRole } from '../../auth/require-role.js';
import { createDatabaseClient } from '../../db/client.js';
import { ApiError } from '../../errors/api-error.js';
import { asyncRoute } from '../../http/async-route.js';

const propertySchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(180),
  description: z.string().trim().min(40).max(5000),
  addressLine1: z.string().trim().min(5).max(255),
  area: z.string().trim().min(2).max(100),
  city: z.string().trim().min(2).max(100).default('Kuje'),
  state: z.string().trim().min(2).max(100).default('FCT Abuja'),
  photoUrls: z.array(z.string().url().refine((value) => value.startsWith('https://'), 'Photo URLs must use HTTPS')).min(1).max(8),
  checkInTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('14:00'),
  checkOutTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('11:00'),
});

const unitSchema = z.object({
  name: z.string().trim().min(2).max(100),
  unitType: z.string().trim().min(2).max(80),
  description: z.string().trim().max(2000).optional(),
  maxGuests: z.coerce.number().int().min(1).max(20),
  bedrooms: z.coerce.number().int().min(0).max(20).default(0),
  bathrooms: z.coerce.number().min(0.5).max(20).default(1),
  baseNightlyRateNaira: z.coerce.number().int().min(1000).max(10_000_000),
  cleaningFeeNaira: z.coerce.number().int().min(0).max(2_000_000).default(0),
});

const availabilityBlockSchema = z.object({
  startsOn: z.coerce.date(),
  endsOn: z.coerce.date(),
  reason: z.string().trim().min(2).max(250),
});
const photoUrlsSchema = z.object({
  photoUrls: z.array(z.string().url().refine((value) => value.startsWith('https://'), 'Photo URLs must use HTTPS')).min(1).max(8),
});

const isoDate = (value: Date) => value.toISOString().slice(0, 10);

export const hostPropertiesRouter = Router();
hostPropertiesRouter.use(requireAuth, requireRole('HOST'));

hostPropertiesRouter.get('/', asyncRoute(async (request, response) => {
  const client = createDatabaseClient();
  await client.connect();
  try {
    const result = await client.query(
      `SELECT p.id, p.name, p.slug, p.status, p.area, p.city, p.photo_urls, p.created_at,
        COUNT(u.id)::int AS unit_count
       FROM properties p
       JOIN host_profiles h ON h.user_id = p.host_id
       LEFT JOIN units u ON u.property_id = p.id
       WHERE h.user_id = $1
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      [request.auth!.userId],
    );
    response.json({ data: result.rows });
  } finally {
    await client.end();
  }
}));

hostPropertiesRouter.put('/:propertyId/photos', asyncRoute(async (request, response) => {
  const propertyId = z.string().uuid().parse(request.params.propertyId);
  const input = photoUrlsSchema.parse(request.body);
  const client = createDatabaseClient();
  await client.connect();
  try {
    const result = await client.query(
      `UPDATE properties SET photo_urls = $3, updated_at = now()
       WHERE id = $1 AND host_id = $2
       RETURNING id, name, slug, status, photo_urls, updated_at`,
      [propertyId, request.auth!.userId, input.photoUrls],
    );
    if (!result.rowCount) throw new ApiError(404, 'Property not found.', 'PROPERTY_NOT_FOUND');
    response.json({ data: result.rows[0] });
  } finally { await client.end(); }
}));

hostPropertiesRouter.post('/', asyncRoute(async (request, response) => {
  const input = propertySchema.parse(request.body);
  const client = createDatabaseClient();
  await client.connect();
  try {
    const result = await client.query(
      `INSERT INTO properties (
        host_id, name, slug, description, address_line_1, area, city, state, photo_urls, check_in_time, check_out_time
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::time, $11::time)
      RETURNING id, name, slug, status, area, city, state, photo_urls, created_at`,
      [
        request.auth!.userId, input.name, input.slug, input.description, input.addressLine1,
        input.area, input.city, input.state, input.photoUrls, input.checkInTime, input.checkOutTime,
      ],
    );
    response.status(201).json({ data: result.rows[0] });
  } finally {
    await client.end();
  }
}));

hostPropertiesRouter.post('/:propertyId/units', asyncRoute(async (request, response) => {
  const input = unitSchema.parse(request.body);
  const propertyId = z.string().uuid().parse(request.params.propertyId);
  const client = createDatabaseClient();
  await client.connect();
  try {
    const result = await client.query(
      `INSERT INTO units (
        property_id, name, unit_type, description, max_guests, bedrooms, bathrooms,
        base_nightly_rate_naira, cleaning_fee_naira
      ) SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9
        WHERE EXISTS (SELECT 1 FROM properties WHERE id = $1 AND host_id = $10)
      RETURNING id, property_id, name, unit_type, max_guests, base_nightly_rate_naira, cleaning_fee_naira, status`,
      [
        propertyId, input.name, input.unitType, input.description ?? null, input.maxGuests, input.bedrooms,
        input.bathrooms, input.baseNightlyRateNaira, input.cleaningFeeNaira, request.auth!.userId,
      ],
    );
    if (!result.rowCount) throw new ApiError(404, 'Property not found.', 'PROPERTY_NOT_FOUND');
    response.status(201).json({ data: result.rows[0] });
  } finally {
    await client.end();
  }
}));

hostPropertiesRouter.post('/:propertyId/submit', asyncRoute(async (request, response) => {
  const propertyId = z.string().uuid().parse(request.params.propertyId);
  const client = createDatabaseClient();
  await client.connect();
  try {
    const result = await client.query(
      `UPDATE properties p SET status = 'PENDING_REVIEW', updated_at = now()
       WHERE p.id = $1
         AND p.host_id = $2
         AND p.status = 'DRAFT'
         AND EXISTS (SELECT 1 FROM units u WHERE u.property_id = p.id AND u.status = 'ACTIVE')
       RETURNING p.id, p.name, p.slug, p.status, p.updated_at`,
      [propertyId, request.auth!.userId],
    );
    if (!result.rowCount) {
      throw new ApiError(
        409,
        'Only draft properties with at least one active unit can be submitted for review.',
        'PROPERTY_NOT_READY_FOR_REVIEW',
      );
    }
    response.json({ data: result.rows[0] });
  } finally {
    await client.end();
  }
}));

hostPropertiesRouter.post('/:propertyId/availability-blocks', asyncRoute(async (request, response) => {
  const input = availabilityBlockSchema.parse(request.body);
  const propertyId = z.string().uuid().parse(request.params.propertyId);
  if (input.startsOn >= input.endsOn) {
    throw new ApiError(422, 'endsOn must be after startsOn', 'INVALID_BLOCK_RANGE');
  }
  const client = createDatabaseClient();
  await client.connect();
  try {
    const result = await client.query(
      `WITH owned_units AS MATERIALIZED (
         SELECT u.id FROM units u JOIN properties p ON p.id = u.property_id
         WHERE p.id = $1 AND p.host_id = $5 FOR UPDATE
       )
       INSERT INTO availability_blocks (unit_id, starts_on, ends_on, reason, created_by)
       SELECT id, $2::date, $3::date, $4, $5 FROM owned_units
       RETURNING id, unit_id, starts_on, ends_on, reason`,
      [propertyId, isoDate(input.startsOn), isoDate(input.endsOn), input.reason, request.auth!.userId],
    );
    if (!result.rowCount) throw new ApiError(404, 'Property not found.', 'PROPERTY_NOT_FOUND');
    response.status(201).json({ data: result.rows, count: result.rowCount });
  } finally {
    await client.end();
  }
}));
