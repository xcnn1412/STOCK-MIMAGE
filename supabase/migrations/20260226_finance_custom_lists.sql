-- ============================================================================
-- Finance Custom Lists — รายการกำหนดเอง
-- ============================================================================

-- หัวข้อรายการ (เช่น "อุปกรณ์ถ่ายภาพ", "สถานที่")
CREATE TABLE IF NOT EXISTS finance_custom_lists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  name_th TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- รายการย่อย (เช่น "กล้อง Canon R5", "ห้องแกรนด์บอลรูม")
CREATE TABLE IF NOT EXISTS finance_custom_list_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  list_id UUID NOT NULL REFERENCES finance_custom_lists(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Update detail_source to support custom list references
-- format: 'list:<uuid>' for custom lists
COMMENT ON COLUMN finance_categories.detail_source IS 'none | staff | vehicle | list:<uuid>';

-- RLS
ALTER TABLE finance_custom_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "custom_lists_select" ON finance_custom_lists FOR SELECT TO authenticated USING (true);
CREATE POLICY "custom_lists_insert" ON finance_custom_lists FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "custom_lists_update" ON finance_custom_lists FOR UPDATE TO authenticated USING (true);
CREATE POLICY "custom_lists_delete" ON finance_custom_lists FOR DELETE TO authenticated USING (true);

ALTER TABLE finance_custom_list_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "custom_list_items_select" ON finance_custom_list_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "custom_list_items_insert" ON finance_custom_list_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "custom_list_items_update" ON finance_custom_list_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "custom_list_items_delete" ON finance_custom_list_items FOR DELETE TO authenticated USING (true);
