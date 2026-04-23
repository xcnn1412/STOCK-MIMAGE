-- ============================================================================
-- Expense Claims — Add itemized breakdown for advance settlement
--
-- Lets users record several line items (e.g. fuel, tolls, meals) when
-- settling an advance. actual_spent_amount remains the sum of items.
-- Each item: { "description": "ค่าน้ำมัน", "amount": 1500 }
-- ============================================================================

ALTER TABLE expense_claims
  ADD COLUMN IF NOT EXISTS actual_spent_items JSONB DEFAULT '[]'::jsonb;
