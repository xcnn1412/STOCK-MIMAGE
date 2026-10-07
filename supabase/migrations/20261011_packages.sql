-- ============================================================================
-- แพ็กเกจ (v1.48.0) — สิ่งที่ขายให้ลูกค้าหนึ่งชุด กำหนดด้วยข้อกำหนดรายประเภทอุปกรณ์
--
-- packages              แพ็กเกจ (ตั้งที่ /packages)
-- package_requirements  ข้อกำหนด = ประเภทอุปกรณ์ × จำนวนที่ต้องใช้ (หนึ่งประเภทต่อแพ็กเกจหนึ่งแถว)
-- package_options       ตัวเลือกอุปกรณ์ของข้อกำหนด (อุปกรณ์เดี่ยวหรือกระเป๋า) · ไม่มีแถว = ทุกหน่วยในประเภทใช้ได้
-- lead_packages         แพ็กเกจที่ทีมขายเลือกให้งาน (crm_leads) พร้อมจำนวนชุด
-- lead_package_units    ชิ้นที่ทีมขายเลือกเองให้ข้อกำหนดของประเภทที่ติ๊ก "ทีมขายเลือกชิ้นเอง" (ตู้) + แบบประกอบ
--
-- กติกาที่แอปตรวจ (ไม่ใช่ constraint): ตัวเลือกห้ามเป็นอุปกรณ์ที่อยู่ในกระเป๋า (kit_contents) ·
-- lead_package_units เฉพาะประเภท sales_pick และไม่เกิน quantity × lead_packages.quantity · variant ต้องอยู่ใน variants ของประเภท
--
-- seed: แพ็กเกจเดิมใน crm_settings หมวด package (ชื่อ + ราคา) ยกเว้น 'custom' · ไม่แตะ crm_leads
-- idempotent: รันซ้ำได้
-- ============================================================================

CREATE TABLE IF NOT EXISTS packages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  price       NUMERIC CHECK (price IS NULL OR price >= 0),
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS package_requirements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id  UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES equipment_categories(id) ON DELETE RESTRICT,
  quantity    INT NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  note        TEXT,
  sort_order  INT NOT NULL DEFAULT 0,
  UNIQUE (package_id, category_id)
);

CREATE TABLE IF NOT EXISTS package_options (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id UUID NOT NULL REFERENCES package_requirements(id) ON DELETE CASCADE,
  item_id        UUID REFERENCES items(id) ON DELETE CASCADE,
  kit_id         UUID REFERENCES kits(id) ON DELETE CASCADE,
  CHECK ((item_id IS NULL) <> (kit_id IS NULL)),
  UNIQUE (requirement_id, item_id),
  UNIQUE (requirement_id, kit_id)
);

CREATE TABLE IF NOT EXISTS lead_packages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES packages(id) ON DELETE RESTRICT,
  quantity   INT NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  note       TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lead_id, package_id)
);

-- item_id / kit_id อย่างใดอย่างหนึ่ง (แอปเขียนครบเสมอ) · ลบชิ้นจริง = SET NULL ทั้งแถวยังอยู่ให้เห็นว่าชิ้นหาย
-- จึงตรวจแค่ "ไม่ใส่ทั้งคู่" — CHECK แบบ <> จะทำให้ ON DELETE SET NULL ลบของไม่ได้
CREATE TABLE IF NOT EXISTS lead_package_units (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_package_id UUID NOT NULL REFERENCES lead_packages(id) ON DELETE CASCADE,
  requirement_id  UUID NOT NULL REFERENCES package_requirements(id) ON DELETE CASCADE,
  item_id         UUID REFERENCES items(id) ON DELETE SET NULL,
  kit_id          UUID REFERENCES kits(id) ON DELETE SET NULL,
  variant         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (item_id IS NULL OR kit_id IS NULL),
  UNIQUE (lead_package_id, requirement_id, item_id),
  UNIQUE (lead_package_id, requirement_id, kit_id)
);

CREATE INDEX IF NOT EXISTS package_requirements_package_id_idx ON package_requirements (package_id);
CREATE INDEX IF NOT EXISTS package_options_requirement_id_idx  ON package_options (requirement_id);
CREATE INDEX IF NOT EXISTS lead_packages_lead_id_idx           ON lead_packages (lead_id);
CREATE INDEX IF NOT EXISTS lead_package_units_item_id_idx      ON lead_package_units (item_id);
CREATE INDEX IF NOT EXISTS lead_package_units_kit_id_idx       ON lead_package_units (kit_id);

COMMENT ON TABLE packages             IS 'แพ็กเกจ — สิ่งที่ขายให้ลูกค้าหนึ่งชุด (เช่น selfie studio booth, 360DSLR) ตั้งที่ /packages · price ใช้เติมราคาเสนอใน CRM';
COMMENT ON TABLE package_requirements IS 'ข้อกำหนดของแพ็กเกจ — ประเภทอุปกรณ์ × จำนวนที่ต้องใช้ (ประเภทละหนึ่งแถว)';
COMMENT ON TABLE package_options      IS 'ตัวเลือกอุปกรณ์ของข้อกำหนด — อุปกรณ์เดี่ยวหรือกระเป๋าที่ใช้ได้ · ไม่มีแถว = ทุกหน่วยในประเภทใช้ได้ · ห้ามเป็นอุปกรณ์ในกระเป๋า (แอปตรวจ)';
COMMENT ON TABLE lead_packages        IS 'แพ็กเกจของงาน — แพ็กเกจที่ทีมขายเลือกให้งาน CRM พร้อมจำนวนชุด';
COMMENT ON TABLE lead_package_units   IS 'ชิ้นที่ทีมขายเลือกเองให้งาน (ประเภทที่ติ๊กทีมขายเลือกชิ้นเอง เช่น ตู้) พร้อมแบบประกอบ (ไม่บังคับ)';
COMMENT ON COLUMN lead_package_units.variant IS 'แบบประกอบ — ต้องเป็นค่าหนึ่งใน equipment_categories.variants ของประเภทของชิ้นนั้น · null = ไม่ระบุ';

-- อ่าน/เขียนผ่าน service role เท่านั้น — เปิด RLS ไม่มี policy = anon เข้าไม่ได้
ALTER TABLE packages             ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_options      ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_packages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_package_units   ENABLE ROW LEVEL SECURITY;

-- seed: แพ็กเกจเดิมจากตั้งค่า CRM (ชื่อไทย + ราคา) — 'custom' (กำหนดเอง) ไม่ใช่แพ็กเกจจริง
INSERT INTO packages (name, price, sort_order)
SELECT label_th, CASE WHEN price >= 0 THEN price END, COALESCE(sort_order, 0)  -- sort_order เดิมเป็น null ได้ · ราคาติดลบ = ไม่ระบุ
FROM crm_settings
WHERE category = 'package' AND is_active AND value <> 'custom'
ON CONFLICT (name) DO NOTHING;
