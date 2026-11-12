import { Router } from 'express';
import { z } from 'zod';
import { createDatabaseClient } from '../../db/client.js';
import { asyncRoute } from '../../http/async-route.js';

const date = z.coerce.date().refine((value) => !Number.isNaN(value.getTime()), 'Invalid date');
const searchSchema = z.object({
  area: z.string().trim().min(2).max(100).optional(),
  country: z.string().trim().regex(/^[A-Za-z]{2}$/, 'country must use a two-letter code').optional(),
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

const availabilityCalendarSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'month must use YYYY-MM format'),
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
        p.id, p.slug, p.name, p.description, p.area, p.city, p.state, p.country_code, p.photo_urls,
        MIN(u.base_nightly_rate_naira) AS from_nightly_rate_naira,
        MAX(u.max_guests) AS maximum_guests
      FROM properties p
      JOIN units u ON u.property_id = p.id AND u.status = 'ACTIVE'
      WHERE p.status = 'ACTIVE'
        AND (
          $1::text IS NULL
          OR p.area ILIKE '%' || $1 || '%'
          OR p.city ILIKE '%' || $1 || '%'
        )
        AND ($2::text IS NULL OR p.country_code = $2)
        AND u.max_guests >= $3
        AND (
          $4::date IS NULL OR NOT EXISTS (
            SELECT 1 FROM reservations r
            WHERE r.unit_id = u.id
              AND (
                (r.status = 'HOLD' AND r.hold_expires_at > now())
                OR (r.status = 'PENDING_PAYMENT' AND r.payment_expires_at > now())
                OR r.status IN ('CONFIRMED', 'CHECKED_IN')
              )
              AND r.stay && daterange($4::date, $5::date, '[)')
          )
        )
        AND (
          $4::date IS NULL OR NOT EXISTS (
            SELECT 1 FROM availability_blocks b
            WHERE b.unit_id = u.id
              AND daterange(b.starts_on, b.ends_on, '[)') && daterange($4::date, $5::date, '[)')
          )
        )
      GROUP BY p.id
      ORDER BY from_nightly_rate_naira ASC, p.created_at DESC
      LIMIT $6`,
      [
        query.area ?? null,
        query.country?.toUpperCase() ?? null,
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
            AND (
              (r.status = 'HOLD' AND r.hold_expires_at > now())
              OR (r.status = 'PENDING_PAYMENT' AND r.payment_expires_at > now())
              OR r.status IN ('CONFIRMED', 'CHECKED_IN')
            )
            AND r.stay && daterange($3::date, $4::date, '[)')
        )
        AND NOT EXISTS (
          SELECT 1 FROM availability_blocks b
          WHERE b.unit_id = u.id
            AND daterange(b.starts_on, b.ends_on, '[)') && daterange($3::date, $4::date, '[)')
        )
      ORDER BY u.base_nightly_rate_naira ASC`,
      [request.params.slug, query.guests, isoDate(query.checkIn), isoDate(query.checkOut)],
    );
    response.json({ data: result.rows, count: result.rowCount });
  } finally {
    await client.end();
  }
}));

propertiesRouter.get('/:slug/availability-calendar', asyncRoute(async (request, response) => {
  const query = availabilityCalendarSchema.parse(request.query);
  const client = createDatabaseClient();
  await client.connect();
  try {
    const result = await client.query(
      `WITH days AS (
        SELECT value::date AS day
        FROM generate_series(
          $2::date,
          ($2::date + INTERVAL '1 month - 1 day')::date,
          INTERVAL '1 day'
        ) AS value
      ),
      eligible_units AS (
        SELECT u.id
        FROM properties p
        JOIN units u ON u.property_id = p.id
        WHERE p.slug = $1
          AND p.status = 'ACTIVE'
          AND u.status = 'ACTIVE'
          AND u.max_guests >= $3
      ),
      unit_days AS (
        SELECT d.day, u.id,
          NOT EXISTS (
            SELECT 1 FROM reservations r
            WHERE r.unit_id = u.id
              AND (
                (r.status = 'HOLD' AND r.hold_expires_at > now())
                OR (r.status = 'PENDING_PAYMENT' AND r.payment_expires_at > now())
                OR r.status IN ('CONFIRMED', 'CHECKED_IN')
              )
              AND r.check_in <= d.day
              AND r.check_out > d.day
          )
          AND NOT EXISTS (
            SELECT 1 FROM availability_blocks b
            WHERE b.unit_id = u.id
              AND b.starts_on <= d.day
              AND b.ends_on > d.day
          ) AS is_available
        FROM days d
        CROSS JOIN eligible_units u
      )
      SELECT
        to_char(d.day, 'YYYY-MM-DD') AS date,
        COUNT(ud.id) FILTER (WHERE ud.is_available)::int AS available_unit_count,
        COUNT(ud.id)::int AS total_unit_count
      FROM days d
      LEFT JOIN unit_days ud ON ud.day = d.day
      GROUP BY d.day
      ORDER BY d.day`,
      [request.params.slug, `${query.month}-01`, query.guests],
    );
    response.json({ data: result.rows, count: result.rowCount });
  } finally {
    await client.end();
  }
}));
