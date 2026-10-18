CREATE TYPE host_application_status AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

CREATE TABLE host_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  business_name TEXT NOT NULL,
  business_phone TEXT NOT NULL,
  notes TEXT,
  status host_application_status NOT NULL DEFAULT 'SUBMITTED',
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (applicant_id)
);

CREATE INDEX host_applications_review_idx ON host_applications (status, created_at);
