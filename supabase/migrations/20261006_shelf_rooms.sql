-- ============================================================================
-- ห้อง → ชั้นวาง → ระดับชั้น (v1.32.0) — หน้า /shelves แบบ 3D
--
-- shelf_rooms : ห้อง ขนาดเป็นช่องตาราง (กว้าง × ลึก) สำหรับผังพื้น
-- shelf_racks : ชั้นวางหนึ่งตู้ วางที่ช่อง (x, y) บนผัง หมุนได้ 0/90/180/270 กว้าง 1–4 ช่อง
-- shelves     : ตารางเดิม = "ระดับชั้น" ของชั้นวาง (rack_id + level 1 = ล่างสุด) — QR เดิมยังใช้ได้
--               ระดับที่ไม่มี rack_id = ชั้นเดิมที่ยังไม่ได้ย้ายเข้าห้อง
--
-- ลบชั้นวาง/ห้อง → ระดับชั้นไม่หาย (rack_id = NULL) ของบนชั้นและ QR ยังอยู่
-- ต้องรันหลัง 20261004_shelves.sql · idempotent: รันซ้ำได้
-- ============================================================================

CREATE TABLE IF NOT EXISTS shelf_rooms (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  width      INT  NOT NULL DEFAULT 8 CHECK (width BETWEEN 2 AND 40),
  depth      INT  NOT NULL DEFAULT 6 CHECK (depth BETWEEN 2 AND 40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shelf_racks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    UUID NOT NULL REFERENCES shelf_rooms(id) ON DELETE CASCADE,
  code       TEXT NOT NULL UNIQUE,
  x          INT  NOT NULL DEFAULT 0,
  y          INT  NOT NULL DEFAULT 0,
  rotation   INT  NOT NULL DEFAULT 0 CHECK (rotation IN (0, 90, 180, 270)),
  width      INT  NOT NULL DEFAULT 2 CHECK (width BETWEEN 1 AND 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shelf_racks_room_idx ON shelf_racks (room_id);

COMMENT ON TABLE shelf_rooms IS 'ห้องเก็บของ — ผังพื้นเป็นช่องตาราง width × depth';
COMMENT ON TABLE shelf_racks IS 'ชั้นวางในห้อง — ตำแหน่ง (x, y) บนผัง, หมุนได้, ระดับชั้นอยู่ใน shelves.rack_id';

ALTER TABLE shelves ADD COLUMN IF NOT EXISTS rack_id UUID REFERENCES shelf_racks(id) ON DELETE SET NULL;
ALTER TABLE shelves ADD COLUMN IF NOT EXISTS level   INT;

COMMENT ON COLUMN shelves.rack_id IS 'ชั้นวางที่ระดับชั้นนี้อยู่ — NULL = ยังไม่อยู่ในห้อง';
COMMENT ON COLUMN shelves.level   IS 'ระดับในชั้นวาง (1 = ล่างสุด)';

-- หนึ่งชั้นวางมีระดับเลขซ้ำไม่ได้
CREATE UNIQUE INDEX IF NOT EXISTS shelves_rack_level_uniq ON shelves (rack_id, level) WHERE rack_id IS NOT NULL;

-- อ่าน/เขียนผ่าน service role เท่านั้น (เหมือน shelves)
ALTER TABLE shelf_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE shelf_racks ENABLE ROW LEVEL SECURITY;
