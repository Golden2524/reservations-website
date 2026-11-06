ALTER TABLE support_requests
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN handled_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN handled_at TIMESTAMPTZ,
  ADD COLUMN internal_note TEXT;

CREATE INDEX support_requests_operational_queue_idx
  ON support_requests (status, updated_at ASC);
