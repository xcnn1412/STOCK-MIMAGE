-- ============================================================================
-- ใบจัดของ + จุดรับของ (v1.49.0 · เฟส 3–4 ของ docs/specs/equipment-flow.md หัวข้อ 3.3)
--
-- pickup_spots        จุดรับของ — ตำแหน่งในออฟฟิศที่วางของที่จัดเสร็จ มี QR ของตัวเอง (/pickup/<id>)
-- packing_lists       ใบจัดของ — หนึ่งอีเวนต์มีใบเดียว เดินสถานะ
--                     selecting (เลือกของ) → picking (กำลังหยิบ) → ready (พร้อมรับ) → out (ออกงาน) → returned (คืนแล้ว) → done (คืนชั้นแล้ว)
-- packing_list_items  บรรทัดของใบ = หน่วยอุปกรณ์หนึ่งหน่วย (อุปกรณ์เดี่ยว หรือกระเป๋าทั้งใบ)
--                     package_id + category_id ว่างทั้งคู่ = ของเสริมนอกแพ็กเกจ · locked = ทีมขายเลือกชิ้นเอง (ตู้) ทีมจัดของเปลี่ยนไม่ได้
-- bucket packing-photos  รูปชุดที่จัดเสร็จ / รูปตอนคืน · path {listId}/{ts}_{name}
--
-- สถานะเก็บเป็นคอลัมน์ (ไม่คำนวณจาก timestamp) ให้คิวงาน/แดชบอร์ดกรองตรงๆ · timestamp รายบรรทัดเป็นหลักฐาน
-- idempotent: รันซ้ำได้
-- ============================================================================

CREATE TABLE IF NOT EXISTS pickup_spots (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  code       TEXT NOT NULL UNIQUE,
  note       TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS packing_lists (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  lead_id           UUID REFERENCES crm_leads(id) ON DELETE SET NULL,
  status            TEXT NOT NULL DEFAULT 'selecting'
                    CHECK (status IN ('selecting', 'picking', 'ready', 'out', 'returned', 'done')),
  packed_at         TIMESTAMPTZ,
  packed_by         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  photo_urls        JSONB NOT NULL DEFAULT '[]'::jsonb,
  spot_id           UUID REFERENCES pickup_spots(id) ON DELETE SET NULL,
  staged_at         TIMESTAMPTZ,
  handed_over_at    TIMESTAMPTZ,
  handed_over_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  returned_at       TIMESTAMPTZ,
  returned_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  return_note       TEXT,
  return_photo_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  restocked_at      TIMESTAMPTZ,
  restocked_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- item_id / kit_id อย่างใดอย่างหนึ่ง (แอปเขียนครบเสมอ) · ลบของจริง = SET NULL แถวยังอยู่เป็นหลักฐาน
-- จึงตรวจแค่ "ไม่ใส่ทั้งคู่" — CHECK แบบ <> จะทำให้ ON DELETE SET NULL ลบของไม่ได้ (แบบเดียวกับ lead_package_units)
CREATE TABLE IF NOT EXISTS packing_list_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id          UUID NOT NULL REFERENCES packing_lists(id) ON DELETE CASCADE,
  package_id       UUID REFERENCES packages(id) ON DELETE SET NULL,
  category_id      UUID REFERENCES equipment_categories(id) ON DELETE SET NULL,
  item_id          UUID REFERENCES items(id) ON DELETE SET NULL,
  kit_id           UUID REFERENCES kits(id) ON DELETE SET NULL,
  variant          TEXT,
  locked           BOOLEAN NOT NULL DEFAULT false,
  picked_at        TIMESTAMPTZ,
  picked_by        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  handed_over_at   TIMESTAMPTZ,
  returned_at      TIMESTAMPTZ,
  return_condition TEXT CHECK (return_condition IS NULL OR return_condition IN ('available', 'damaged', 'maintenance', 'lost')),
  return_note      TEXT,
  restocked_at     TIMESTAMPTZ,
  restocked_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (item_id IS NULL OR kit_id IS NULL),
  UNIQUE (list_id, item_id),
  UNIQUE (list_id, kit_id)
);

CREATE INDEX IF NOT EXISTS packing_lists_lead_id_idx      ON packing_lists (lead_id);
CREATE INDEX IF NOT EXISTS packing_lists_status_idx       ON packing_lists (status);
CREATE INDEX IF NOT EXISTS packing_list_items_list_id_idx ON packing_list_items (list_id);
CREATE INDEX IF NOT EXISTS packing_list_items_item_id_idx ON packing_list_items (item_id);
CREATE INDEX IF NOT EXISTS packing_list_items_kit_id_idx  ON packing_list_items (kit_id);

COMMENT ON TABLE pickup_spots       IS 'จุดรับของ — ตำแหน่งในออฟฟิศที่วางของที่จัดเสร็จ มี QR (/pickup/<id>) ให้ทีมหน้างานสแกนรับของ/คืนของ · ตั้งที่ตั้งค่าคลัง';
COMMENT ON TABLE packing_lists      IS 'ใบจัดของ — หนึ่งอีเวนต์มีใบเดียว · สถานะ เลือกของ → กำลังหยิบ → พร้อมรับ → ออกงาน → คืนแล้ว → คืนชั้นแล้ว';
COMMENT ON COLUMN packing_lists.status     IS 'selecting เลือกของ · picking กำลังหยิบ · ready พร้อมรับ · out ออกงาน · returned คืนแล้ว · done คืนชั้นแล้ว';
COMMENT ON COLUMN packing_lists.photo_urls IS 'รูปชุดที่จัดเสร็จ (ยืนยันจัดของต้องมีอย่างน้อย 1 รูป) — array ของ public URL ใน bucket packing-photos';
COMMENT ON COLUMN packing_lists.spot_id    IS 'จุดรับของที่วางของไว้ (ระบุตอนยืนยันจัดของ)';
COMMENT ON COLUMN packing_lists.staged_at  IS 'เวลาที่วางของที่จุดรับของ (ตั้งพร้อมยืนยันจัดของ)';
COMMENT ON TABLE packing_list_items IS 'บรรทัดใบจัดของ — หน่วยอุปกรณ์หนึ่งหน่วย (อุปกรณ์เดี่ยว หรือกระเป๋าทั้งใบ) · package_id+category_id ว่าง = ของเสริม · locked = ตู้ที่ทีมขายเลือก';
COMMENT ON COLUMN packing_list_items.variant          IS 'แบบประกอบ (คัดลอกจาก lead_package_units) — ป้ายบอกเท่านั้น';
COMMENT ON COLUMN packing_list_items.return_condition IS 'สภาพตอนคืนของ: available ใช้ได้ · damaged เสียหาย · maintenance ซ่อม · lost หาย';

-- อ่าน/เขียนผ่าน service role เท่านั้น — เปิด RLS ไม่มี policy = anon เข้าไม่ได้
ALTER TABLE pickup_spots       ENABLE ROW LEVEL SECURITY;
ALTER TABLE packing_lists      ENABLE ROW LEVEL SECURITY;
ALTER TABLE packing_list_items ENABLE ROW LEVEL SECURITY;

-- bucket รูปใบจัดของ (idempotent) — แบบเดียวกับ 20260317_create_checkin_photos_bucket.sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'packing-photos',
  'packing-photos',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'packing_photos_all'
  ) THEN
    CREATE POLICY packing_photos_all
      ON storage.objects
      FOR ALL
      USING (bucket_id = 'packing-photos')
      WITH CHECK (bucket_id = 'packing-photos');
  END IF;
END $$;
