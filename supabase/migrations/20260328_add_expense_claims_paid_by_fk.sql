-- Add FK constraint for paid_by → profiles(id) so Supabase join works
ALTER TABLE expense_claims
  ADD CONSTRAINT expense_claims_paid_by_fkey
  FOREIGN KEY (paid_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- Index for paid_by lookups
CREATE INDEX IF NOT EXISTS idx_expense_claims_paid_by ON expense_claims(paid_by);
