CREATE TABLE support_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_reference TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email CITEXT NOT NULL,
  topic TEXT NOT NULL,
  message TEXT NOT NULL,
  reservation_reference TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX support_requests_status_created_idx ON support_requests (status, created_at DESC);
