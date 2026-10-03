-- ============================================================================
-- ชั้นเก็บของ (v1.30.0) — "บ้าน" ของกระเป๋าและอุปกรณ์ในคลัง
--
-- โครง 2 ระดับ: โซน (เช่น A) → ชั้น (รหัสไม่ซ้ำ เช่น A-01) — QR ติดชั้นพาไป /shelves/<id>
-- กระเป๋าวางบนชั้น (kits.shelf_id) — อุปกรณ์ในกระเป๋าอยู่ในกระเป๋า ไม่มีชั้นของตัวเอง
-- อุปกรณ์ที่ไม่อยู่ในกระเป๋าใดวางบนชั้นได้ตรงๆ (items.shelf_id)
-- ลบชั้น = ของบนชั้นกลายเป็น "ยังไม่มีชั้น" (ON DELETE SET NULL) ไม่ลบของ
--
-- idempotent: รันซ้ำได้
-- ============================================================================

CREATE TABLE IF NOT EXISTS shelves (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone       TEXT NOT NULL,
  code       TEXT NOT NULL UNIQUE,
  name       TEXT,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  shelves      IS 'ชั้นเก็บของ — โซน → ชั้น (รหัสไม่ซ้ำ) QR ติดชั้นพาไป /shelves/<id>';
COMMENT ON COLUMN shelves.zone IS 'โซน เช่น A — ใช้จัดกลุ่มในหน้ารายการชั้น';
COMMENT ON COLUMN shelves.code IS 'รหัสชั้น เช่น A-01 — ไม่ซ้ำทั้งระบบ';

-- อ่าน/เขียนผ่าน service role เท่านั้น (เหมือน app_settings) — เปิด RLS ไม่มี policy = anon เข้าไม่ได้
ALTER TABLE shelves ENABLE ROW LEVEL SECURITY;

ALTER TABLE kits  ADD COLUMN IF NOT EXISTS shelf_id UUID REFERENCES shelves(id) ON DELETE SET NULL;
ALTER TABLE items ADD COLUMN IF NOT EXISTS shelf_id UUID REFERENCES shelves(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS kits_shelf_id_idx  ON kits (shelf_id);
CREATE INDEX IF NOT EXISTS items_shelf_id_idx ON items (shelf_id);

-- อุปกรณ์ที่อยู่ในกระเป๋าอยู่แล้วไม่มีชั้นของตัวเอง (ตามกระเป๋า)
UPDATE items SET shelf_id = NULL
WHERE shelf_id IS NOT NULL
  AND id IN (SELECT item_id FROM kit_contents);
