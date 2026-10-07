-- ============================================================================
-- ประเภทอุปกรณ์ (v1.47.0) — ตารางแทนช่องข้อความ items.category
--
-- ประเภท = กลุ่มของอุปกรณ์ที่ใช้แทนกันได้ (คอมพิวเตอร์, กล้อง, ตู้ประกอบ, กระเป๋าอุปกรณ์ ...)
-- ทั้งอุปกรณ์เดี่ยว (items) และกระเป๋า (kits) อยู่ในประเภทได้ (category_id)
-- ลบประเภท = ของในประเภทกลายเป็น "ไม่ระบุ" (ON DELETE SET NULL) — แอปห้ามลบประเภทที่ยังมีของอ้างถึงอยู่แล้ว
-- items.category (ข้อความ) เก็บไว้ และแอปเขียนเป็นชื่อประเภทคู่กันจนถึงเฟส 6
--
-- idempotent: รันซ้ำได้
-- ============================================================================

CREATE TABLE IF NOT EXISTS equipment_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  sales_pick BOOLEAN NOT NULL DEFAULT false,
  variants   TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  equipment_categories            IS 'ประเภทอุปกรณ์ — กลุ่มของอุปกรณ์/กระเป๋าที่ใช้แทนกันได้ในแพ็กเกจ ตั้งที่ /stock/settings';
COMMENT ON COLUMN equipment_categories.sales_pick IS 'ทีมขายเลือกชิ้นเอง — ประเภทตู้ทุกชนิด (ลูกค้าเลือกหน้าตา) ชิ้นถูกเลือกตอนเลือกแพ็กเกจ ทีมจัดของเปลี่ยนไม่ได้';
COMMENT ON COLUMN equipment_categories.variants   IS 'แบบประกอบ เช่น {ประกอบ 1, ประกอบ 2} — ป้ายบอกทีมว่างานนี้ประกอบแบบไหน ใช้ร่วมกันทุกชุดในประเภท · ว่าง = ไม่มีแบบ';

-- อ่าน/เขียนผ่าน service role เท่านั้น — เปิด RLS ไม่มี policy = anon เข้าไม่ได้
ALTER TABLE equipment_categories ENABLE ROW LEVEL SECURITY;

ALTER TABLE items ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES equipment_categories(id) ON DELETE SET NULL;
ALTER TABLE kits  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES equipment_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS items_category_id_idx ON items (category_id);
CREATE INDEX IF NOT EXISTS kits_category_id_idx  ON kits (category_id);

COMMENT ON COLUMN items.category_id IS 'ประเภทอุปกรณ์ (equipment_categories) — items.category ข้อความเก็บชื่อประเภทคู่กัน';
COMMENT ON COLUMN kits.category_id  IS 'ประเภทอุปกรณ์ของกระเป๋า (equipment_categories)';

-- backfill: ชื่อประเภทจากข้อความเดิมของอุปกรณ์ → ตาราง แล้วผูก category_id ตามชื่อ
INSERT INTO equipment_categories (name)
SELECT DISTINCT btrim(category) FROM items
WHERE category IS NOT NULL AND btrim(category) <> ''
ON CONFLICT (name) DO NOTHING;

UPDATE items i SET category_id = c.id
FROM equipment_categories c
WHERE i.category_id IS NULL
  AND i.category IS NOT NULL
  AND btrim(i.category) = c.name;

-- ตรวจหลังรัน (ต้องได้ 0): อุปกรณ์ที่มีข้อความประเภทแต่ยังไม่ได้ category_id
-- SELECT count(*) FROM items WHERE category_id IS NULL AND btrim(coalesce(category, '')) <> '';
