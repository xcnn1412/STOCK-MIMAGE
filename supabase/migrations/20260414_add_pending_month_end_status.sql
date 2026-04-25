-- ============================================================================
-- Add 'pending_month_end' status to expense_claims
-- ============================================================================

ALTER TABLE expense_claims
  DROP CONSTRAINT IF EXISTS expense_claims_status_check;

ALTER TABLE expense_claims
  ADD CONSTRAINT expense_claims_status_check
  CHECK (status IN ('pending', 'approved', 'awaiting_payment', 'pending_month_end', 'paid', 'rejected'));

