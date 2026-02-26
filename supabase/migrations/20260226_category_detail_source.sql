-- เพิ่ม detail_source ให้ finance_categories
-- กำหนดว่า dropdown รายละเอียดดึงข้อมูลจากที่ไหน
-- 'none' = text input, 'staff' = staff list, 'vehicle' = vehicle list

ALTER TABLE finance_categories ADD COLUMN IF NOT EXISTS detail_source TEXT DEFAULT 'none';

-- Set defaults for existing categories
UPDATE finance_categories SET detail_source = 'staff' WHERE value = 'staff';
UPDATE finance_categories SET detail_source = 'vehicle' WHERE value = 'travel';
