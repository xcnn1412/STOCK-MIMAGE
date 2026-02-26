-- ============================================================================
-- 1) เพิ่มคอลัมน์ detail_source ในตาราง finance_categories (ถ้ายังไม่มี)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'finance_categories' AND column_name = 'detail_source'
  ) THEN
    ALTER TABLE finance_categories ADD COLUMN detail_source TEXT DEFAULT 'none';
  END IF;
END $$;

-- ============================================================================
-- 2) Finance Category Items — รายการย่อยของแต่ละหมวดค่าใช้จ่าย
-- ใช้เป็น dropdown เมื่อหมวดตั้งค่าเป็น "กำหนดเอง" (custom)
-- ============================================================================
CREATE TABLE IF NOT EXISTS finance_category_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID NOT NULL REFERENCES finance_categories(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE finance_category_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'category_items_select' AND tablename = 'finance_category_items') THEN
    CREATE POLICY "category_items_select" ON finance_category_items FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'category_items_insert' AND tablename = 'finance_category_items') THEN
    CREATE POLICY "category_items_insert" ON finance_category_items FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'category_items_update' AND tablename = 'finance_category_items') THEN
    CREATE POLICY "category_items_update" ON finance_category_items FOR UPDATE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'category_items_delete' AND tablename = 'finance_category_items') THEN
    CREATE POLICY "category_items_delete" ON finance_category_items FOR DELETE TO authenticated USING (true);
  END IF;
END $$;
