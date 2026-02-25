-- Add vat_mode column to job_cost_items
-- vat_mode: 'none' | 'included' (VAT อยู่ในราคาแล้ว ถอดออก) | 'excluded' (ราคาไม่รวม VAT เพิ่มเข้า)
ALTER TABLE job_cost_items
ADD COLUMN IF NOT EXISTS vat_mode TEXT DEFAULT 'none';

-- Migrate existing data: include_vat = true → vat_mode = 'excluded'
UPDATE job_cost_items SET vat_mode = 'excluded' WHERE include_vat = true AND (vat_mode IS NULL OR vat_mode = 'none');
