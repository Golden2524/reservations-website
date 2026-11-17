CREATE TABLE wallet_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  cash_balance_naira INTEGER NOT NULL DEFAULT 0 CHECK (cash_balance_naira >= 0),
  credits_balance_naira INTEGER NOT NULL DEFAULT 0 CHECK (credits_balance_naira >= 0),
  cash_enabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE wallet_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_account_id UUID NOT NULL REFERENCES wallet_accounts(id) ON DELETE RESTRICT,
  balance_type TEXT NOT NULL CHECK (balance_type IN ('CREDITS', 'CASH')),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('CREDIT_GRANT', 'CREDIT_REVERSAL', 'CASH_DEPOSIT', 'CASH_WITHDRAWAL', 'BOOKING_REDEMPTION', 'BOOKING_REVERSAL')),
  amount_naira INTEGER NOT NULL CHECK (amount_naira <> 0),
  reason TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX wallet_ledger_entries_account_idx ON wallet_ledger_entries (wallet_account_id, created_at DESC);
