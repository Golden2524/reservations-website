ALTER TABLE reservations
  ADD COLUMN payment_expires_at TIMESTAMPTZ;

ALTER TABLE reservations
  ADD CONSTRAINT reservations_pending_payment_expiry
  CHECK ((status = 'PENDING_PAYMENT') = (payment_expires_at IS NOT NULL));
