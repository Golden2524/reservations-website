import { Router } from 'express';
import { z } from 'zod';
import { createDatabaseClient } from '../../db/client.js';
import { asyncRoute } from '../../http/async-route.js';

const date = z.coerce.date().refine((value) => !Number.isNaN(value.getTime()), 'Invalid date');
const searchSchema = z.object({
  area: z.string().trim().min(2).max(100).optional(),
  checkIn: date.optional(),
  checkOut: date.optional(),
  guests: z.coerce.number().int().min(1).max(20).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const availabilitySchema = z.object({
  checkIn: date,
  checkOut: date,
  guests: z.coerce.number().int().min(1).max(20).default(1),
});

const isoDate = (value: Date) => value.toISOString().slice(0, 10);

export const propertiesRouter = Router();

propertiesRouter.get('/', asyncRoute(async (request, response) => {
  const query = searchSchema.parse(request.query);
  if (query.checkIn && query.checkOut && query.checkIn >= query.checkOut) {
    response.status(422).json({ error: 'checkOut must be after checkIn', code: 'INVALID_STAY_RANGE' });
    return;
  }

  const client = createDatabaseClient();
  await client.connect();
  try {
    const result = await client.query(
      `SELECT
        p.id, p.slug, p.name, p.description, p.area, p.city, p.state,
        MIN(u.base_nightly_rate_naira) AS from_nightly_rate_naira,
        MAX(u.max_guests) AS maximum_guests
      FROM properties p
      JOIN units u ON u.property_id = p.id AND u.status = 'ACTIVE'
      WHERE p.status = 'ACTIVE'
        AND ($1::text IS NULL OR p.area ILIKE '%' || $1 || '%')
        AND u.max_guests >= $2
        AND (
          $3::date IS NULL OR NOT EXISTS (
            SELECT 1 FROM reservations r
            WHERE r.unit_id = u.id
              AND r.status IN ('HOLD', 'PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN')
              AND r.stay && daterange($3::date, $4::date, '[)')
          )
        )
      GROUP BY p.id
      ORDER BY from_nightly_rate_naira ASC, p.created_at DESC
      LIMIT $5`,
      [
        query.area ?? null,
        query.guests,
        query.checkIn ? isoDate(query.checkIn) : null,
        query.checkOut ? isoDate(query.checkOut) : null,
        query.limit,
      ],
    );
    response.json({ data: result.rows, count: result.rowCount });
  } finally {
    await client.end();
  }
}));

propertiesRouter.get('/:slug/availability', asyncRoute(async (request, response) => {
  const query = availabilitySchema.parse(request.query);
  if (query.checkIn >= query.checkOut) {
    response.status(422).json({ error: 'checkOut must be after checkIn', code: 'INVALID_STAY_RANGE' });
    return;
  }

  const client = createDatabaseClient();
  await client.connect();
  try {
    const result = await client.query(
      `SELECT u.id, u.name, u.unit_type, u.max_guests, u.base_nightly_rate_naira,
        u.cleaning_fee_naira
      FROM properties p
      JOIN units u ON u.property_id = p.id
      WHERE p.slug = $1
        AND p.status = 'ACTIVE'
        AND u.status = 'ACTIVE'
        AND u.max_guests >= $2
        AND NOT EXISTS (
          SELECT 1 FROM reservations r
          WHERE r.unit_id = u.id
            AND r.status IN ('HOLD', 'PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN')
            AND r.stay && daterange($3::date, $4::date, '[)')
        )
      ORDER BY u.base_nightly_rate_naira ASC`,
      [request.params.slug, query.guests, isoDate(query.checkIn), isoDate(query.checkOut)],
    );
    response.json({ data: result.rows, count: result.rowCount });
  } finally {
    await client.end();
  }
}));
