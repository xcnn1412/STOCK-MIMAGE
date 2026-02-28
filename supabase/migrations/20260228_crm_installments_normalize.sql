-- ============================================================================
-- CRM Installments Normalization + Tax Calculation
-- ย้ายงวดชำระจาก 4 columns → ตารางแยก (ไม่จำกัดงวด)
-- เพิ่มคำนวณภาษี VAT / WHT
-- ============================================================================

-- 1. สร้างตาราง crm_lead_installments
CREATE TABLE IF NOT EXISTS crm_lead_installments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  installment_number INT NOT NULL,
  amount NUMERIC DEFAULT 0,
  due_date DATE,
  is_paid BOOLEAN DEFAULT false,
  paid_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(lead_id, installment_number)
);

-- 2. เพิ่มคอลัมน์ภาษีใน crm_leads
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS vat_mode TEXT DEFAULT 'none';
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS wht_rate NUMERIC DEFAULT 0;

-- 3. Migrate ข้อมูลเดิม 4 งวดเข้าตารางใหม่
INSERT INTO crm_lead_installments (lead_id, installment_number, amount, due_date, is_paid, paid_date)
SELECT id, 1, installment_1, installment_1_date::date, COALESCE(installment_1_paid, false), installment_1_paid_date::date
FROM crm_leads WHERE (installment_1 IS NOT NULL AND installment_1 > 0) OR installment_1_date IS NOT NULL
ON CONFLICT (lead_id, installment_number) DO NOTHING;

INSERT INTO crm_lead_installments (lead_id, installment_number, amount, due_date, is_paid, paid_date)
SELECT id, 2, installment_2, installment_2_date::date, COALESCE(installment_2_paid, false), installment_2_paid_date::date
FROM crm_leads WHERE (installment_2 IS NOT NULL AND installment_2 > 0) OR installment_2_date IS NOT NULL
ON CONFLICT (lead_id, installment_number) DO NOTHING;

INSERT INTO crm_lead_installments (lead_id, installment_number, amount, due_date, is_paid, paid_date)
SELECT id, 3, installment_3, installment_3_date::date, COALESCE(installment_3_paid, false), installment_3_paid_date::date
FROM crm_leads WHERE (installment_3 IS NOT NULL AND installment_3 > 0) OR installment_3_date IS NOT NULL
ON CONFLICT (lead_id, installment_number) DO NOTHING;

INSERT INTO crm_lead_installments (lead_id, installment_number, amount, due_date, is_paid, paid_date)
SELECT id, 4, installment_4, installment_4_date::date, COALESCE(installment_4_paid, false), installment_4_paid_date::date
FROM crm_leads WHERE (installment_4 IS NOT NULL AND installment_4 > 0) OR installment_4_date IS NOT NULL
ON CONFLICT (lead_id, installment_number) DO NOTHING;

-- 4. Index for performance
CREATE INDEX IF NOT EXISTS idx_crm_lead_installments_lead_id ON crm_lead_installments(lead_id);
