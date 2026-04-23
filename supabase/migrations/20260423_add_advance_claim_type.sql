-- ============================================================================
-- Expense Claims — Add 'advance' (เบิกทดลองจ่าย) claim type + settlement fields
--
-- Advance workflow:
--   1. User requests advance amount (เงินที่ขอเบิกล่วงหน้า)
--   2. Admin approves & pays out the advance
--   3. After the expense occurs, user settles the advance by entering
--      actual_spent_amount and uploading proof (actual_receipt_urls).
--      refund_amount = advance_amount - actual_spent_amount (auto-calc).
--   4. If refund_amount > 0, user transfers the remainder back to the company
--      and uploads the transfer slip into refund_slip_urls.
-- ============================================================================

-- 1. Expand claim_type CHECK constraint to include 'advance'
ALTER TABLE expense_claims
  DROP CONSTRAINT IF EXISTS expense_claims_claim_type_check;

ALTER TABLE expense_claims
  ADD CONSTRAINT expense_claims_claim_type_check CHECK (
    claim_type IN ('event', 'other', 'advance')
  );

-- 2. Add settlement fields (all nullable — only used for 'advance' type)
ALTER TABLE expense_claims
  ADD COLUMN IF NOT EXISTS actual_spent_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS refund_amount        NUMERIC,
  ADD COLUMN IF NOT EXISTS actual_receipt_urls  TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS refund_slip_urls     TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS advance_settled_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS advance_settled_by   UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expense_claims_advance_settled_by
  ON expense_claims(advance_settled_by);
