-- ReserveFlow accommodation booking core.
-- PostgreSQL is the source of truth for availability. Application-level locks may
-- improve the experience, but this constraint is the final double-booking guard.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

CREATE TYPE user_role AS ENUM ('GUEST', 'HOST', 'ADMIN');
CREATE TYPE property_status AS ENUM ('DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'SUSPENDED');
CREATE TYPE unit_status AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE reservation_status AS ENUM (
  'HOLD', 'PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'EXPIRED'
);
CREATE TYPE payment_status AS ENUM ('PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'REFUND_PENDING', 'REFUNDED');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email CITEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone_e164 TEXT UNIQUE,
  role user_role NOT NULL DEFAULT 'GUEST',
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE host_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  verified_at TIMESTAMPTZ,
  payout_enabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES host_profiles(user_id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  status property_status NOT NULL DEFAULT 'DRAFT',
  address_line_1 TEXT NOT NULL,
  area TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT 'Kuje',
  state TEXT NOT NULL DEFAULT 'FCT Abuja',
  country_code CHAR(2) NOT NULL DEFAULT 'NG',
  latitude NUMERIC(9, 6),
  longitude NUMERIC(9, 6),
  check_in_time TIME NOT NULL DEFAULT '14:00',
  check_out_time TIME NOT NULL DEFAULT '11:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (latitude BETWEEN -90 AND 90),
  CHECK (longitude BETWEEN -180 AND 180)
);

CREATE TABLE units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit_type TEXT NOT NULL,
  description TEXT,
  max_guests SMALLINT NOT NULL CHECK (max_guests > 0),
  bedrooms SMALLINT NOT NULL DEFAULT 0 CHECK (bedrooms >= 0),
  bathrooms NUMERIC(3, 1) NOT NULL DEFAULT 1 CHECK (bathrooms > 0),
  base_nightly_rate_naira INTEGER NOT NULL CHECK (base_nightly_rate_naira > 0),
  cleaning_fee_naira INTEGER NOT NULL DEFAULT 0 CHECK (cleaning_fee_naira >= 0),
  status unit_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (property_id, name)
);

CREATE TABLE availability_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  reason TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (starts_on < ends_on)
);

CREATE TABLE reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_reference TEXT NOT NULL UNIQUE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
  guest_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  stay DATERANGE GENERATED ALWAYS AS (daterange(check_in, check_out, '[)')) STORED,
  guest_count SMALLINT NOT NULL CHECK (guest_count > 0),
  status reservation_status NOT NULL DEFAULT 'HOLD',
  hold_expires_at TIMESTAMPTZ,
  nightly_rate_naira INTEGER NOT NULL CHECK (nightly_rate_naira > 0),
  cleaning_fee_naira INTEGER NOT NULL DEFAULT 0 CHECK (cleaning_fee_naira >= 0),
  service_fee_naira INTEGER NOT NULL DEFAULT 0 CHECK (service_fee_naira >= 0),
  total_naira INTEGER NOT NULL CHECK (total_naira > 0),
  idempotency_key TEXT NOT NULL UNIQUE,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (check_in < check_out),
  CHECK ((status = 'HOLD') = (hold_expires_at IS NOT NULL))
);

-- A date range overlap is rejected for every reservation that consumes inventory.
-- This prevents two concurrent checkout requests from confirming the same unit.
ALTER TABLE reservations
  ADD CONSTRAINT reservations_no_overlapping_active_stays
  EXCLUDE USING gist (
    unit_id WITH =,
    stay WITH &&
  ) WHERE (status IN ('HOLD', 'PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN'));

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL,
  provider_reference TEXT UNIQUE,
  amount_naira INTEGER NOT NULL CHECK (amount_naira > 0),
  status payment_status NOT NULL DEFAULT 'PENDING',
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payment_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_event_id)
);

CREATE TABLE reservation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX properties_discovery_idx ON properties (city, area) WHERE status = 'ACTIVE';
CREATE INDEX units_property_idx ON units (property_id) WHERE status = 'ACTIVE';
CREATE INDEX reservations_guest_idx ON reservations (guest_id, created_at DESC);
CREATE INDEX reservations_unit_dates_idx ON reservations (unit_id, check_in, check_out);
CREATE INDEX reservation_events_reservation_idx ON reservation_events (reservation_id, created_at DESC);
