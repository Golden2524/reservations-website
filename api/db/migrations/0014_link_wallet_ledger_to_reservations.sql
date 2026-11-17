ALTER TABLE wallet_ledger_entries
  ADD COLUMN reservation_id UUID REFERENCES reservations(id) ON DELETE RESTRICT;

CREATE INDEX wallet_ledger_entries_reservation_idx
  ON wallet_ledger_entries (reservation_id)
  WHERE reservation_id IS NOT NULL;
