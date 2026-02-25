-- ============================================================================
-- CRM Installments + Status Simplification
-- เพิ่มฟิลด์ชำระงวด 1 / งวด 2
-- ปรับสถานะเหลือ 4: lead, quotation_sent, accepted, rejected
-- ============================================================================

-- 1. เพิ่มคอลัมน์ชำระเงินงวด
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS installment_1 NUMERIC DEFAULT 0;  -- ชำระงวด 1
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS installment_2 NUMERIC DEFAULT 0;  -- ชำระงวด 2

-- 2. Migrate existing rows with old statuses to the closest match
UPDATE crm_leads SET status = 'lead' WHERE status IN ('booking', 'following_up');
UPDATE crm_leads SET status = 'rejected' WHERE status IN ('debt_collection', 'cancelled');
UPDATE crm_leads SET status = 'quotation_sent' WHERE status NOT IN ('lead', 'quotation_sent', 'accepted', 'rejected');

-- 3. Drop old CHECK constraint and add new one
ALTER TABLE crm_leads DROP CONSTRAINT IF EXISTS crm_leads_status_check;
ALTER TABLE crm_leads ADD CONSTRAINT crm_leads_status_check
  CHECK (status IN ('lead', 'quotation_sent', 'accepted', 'rejected'));
