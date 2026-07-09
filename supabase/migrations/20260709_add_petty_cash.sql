-- Petty cash (เงินสดย่อย) — monthly fund model on expense_claims.
--   Fund (ใบแม่):  claim_type='petty_cash', pettycash_fund_id IS NULL, amount = ยอดตั้งต้น
--   Top-up:        claim_type='petty_cash', pettycash_fund_id = <fund id>
--   Expense:       claim_type='other',      pettycash_fund_id = <fund id> (paid from cash box)
--   balance = fund.amount + Σ topups(paid) − Σ expenses(not cancelled/rejected)
-- Month close: leftover recorded via refund_amount/refund_slip_urls (reused from advance).

ALTER TABLE expense_claims
  ADD COLUMN IF NOT EXISTS pettycash_opening_balance numeric,
  ADD COLUMN IF NOT EXISTS pettycash_opening_from date,
  ADD COLUMN IF NOT EXISTS pettycash_previous_claim_id uuid REFERENCES expense_claims(id),
  ADD COLUMN IF NOT EXISTS pettycash_period_start date,
  ADD COLUMN IF NOT EXISTS pettycash_period_end date,
  ADD COLUMN IF NOT EXISTS pettycash_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS pettycash_closed_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS pettycash_fund_id uuid REFERENCES expense_claims(id);

-- Allow the new claim_type. The existing CHECK only permits event/other/advance.
ALTER TABLE expense_claims DROP CONSTRAINT IF EXISTS expense_claims_claim_type_check;
ALTER TABLE expense_claims ADD CONSTRAINT expense_claims_claim_type_check
  CHECK (claim_type = ANY (ARRAY['event'::text, 'other'::text, 'advance'::text, 'petty_cash'::text]));

-- DB-level invariant: only ONE petty-cash fund may be open at a time.
-- (The app checks too, but SELECT-then-INSERT races need this backstop.)
CREATE UNIQUE INDEX IF NOT EXISTS one_open_petty_fund
  ON expense_claims ((claim_type))
  WHERE claim_type = 'petty_cash'
    AND pettycash_fund_id IS NULL
    AND pettycash_closed_at IS NULL
    AND status NOT IN ('cancelled', 'rejected');
