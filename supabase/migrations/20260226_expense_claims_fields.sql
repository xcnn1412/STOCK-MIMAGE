-- เพิ่มฟิลด์ให้ expense_claims เหมือน job_cost_items
-- unit_price, unit, vat_mode, include_vat, withholding_tax_rate

ALTER TABLE expense_claims ADD COLUMN IF NOT EXISTS unit_price NUMERIC DEFAULT 0;
ALTER TABLE expense_claims ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'บาท';
ALTER TABLE expense_claims ADD COLUMN IF NOT EXISTS vat_mode TEXT DEFAULT 'none';
ALTER TABLE expense_claims ADD COLUMN IF NOT EXISTS include_vat BOOLEAN DEFAULT false;
ALTER TABLE expense_claims ADD COLUMN IF NOT EXISTS withholding_tax_rate NUMERIC DEFAULT 0;

-- Drop old generated column and recreate
-- total_amount was: amount * quantity
-- Now: unit_price * quantity (amount kept for backward compat)
