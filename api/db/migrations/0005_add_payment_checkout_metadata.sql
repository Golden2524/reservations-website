ALTER TABLE payments
  ADD COLUMN checkout_url TEXT,
  ADD COLUMN checkout_access_code TEXT,
  ADD COLUMN initialized_at TIMESTAMPTZ;
