-- ============================================================================
-- Expense Claims — Add funding_source + tax_invoice_numbers
--
-- funding_source:
--   'company'  — เบิกโดยใช้เงินบริษัท (default)
--   'personal' — ผู้เบิกออกเงินส่วนตัวก่อน แล้วเบิกย้อนหลัง (reimbursement)
--
-- tax_invoice_numbers: TEXT[] เลขที่ใบกำกับภาษีต่อใบเบิก
--   อนุญาตให้มีหลายเลขต่อใบเบิก (กรณีมีใบกำกับภาษีหลายใบ)
-- ============================================================================

-- 1. funding_source
ALTER TABLE expense_claims
  ADD COLUMN IF NOT EXISTS funding_source TEXT NOT NULL DEFAULT 'company';

-- Add CHECK constraint (drop first if it already exists from a prior partial run)
ALTER TABLE expense_claims
  DROP CONSTRAINT IF EXISTS expense_claims_funding_source_check;

ALTER TABLE expense_claims
  ADD CONSTRAINT expense_claims_funding_source_check
  CHECK (funding_source IN ('company', 'personal'));

CREATE INDEX IF NOT EXISTS idx_expense_claims_funding_source
  ON expense_claims(funding_source);

-- 2. tax_invoice_numbers (array of strings)
ALTER TABLE expense_claims
  ADD COLUMN IF NOT EXISTS tax_invoice_numbers TEXT[] DEFAULT '{}';
