-- ============================================================================
-- ตรวจนับชั้นเก็บของ (v1.31.0) — ประวัติการตรวจนับแต่ละครั้ง
--
-- หนึ่งแถว = ตรวจชั้นหนึ่งครั้ง เก็บ snapshot ของที่ควรอยู่บนชั้น / ที่เจอ / ที่ขาด (jsonb)
-- เหมือน event_closures.kits_snapshot — ของถูกย้าย/ลบทีหลังประวัติก็ยังอ่านได้
-- ตรวจนับแค่บันทึก ไม่เปลี่ยนสถานะอุปกรณ์ให้เอง
--
-- ต้องรันหลัง 20261004_shelves.sql · idempotent: รันซ้ำได้
-- ============================================================================

CREATE TABLE IF NOT EXISTS shelf_audits (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shelf_id       UUID NOT NULL REFERENCES shelves(id) ON DELETE CASCADE,
  audited_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  expected_count INT  NOT NULL,
  found_count    INT  NOT NULL,
  missing        JSONB NOT NULL DEFAULT '[]'::jsonb,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  shelf_audits         IS 'ประวัติตรวจนับชั้นเก็บของ — ตรวจแค่บันทึก ไม่แก้สถานะอุปกรณ์';
COMMENT ON COLUMN shelf_audits.missing IS 'ของที่ควรอยู่บนชั้นแต่ไม่เจอ: [{kind: kit|item, id, name}]';

CREATE INDEX IF NOT EXISTS shelf_audits_shelf_created_idx ON shelf_audits (shelf_id, created_at DESC);

-- อ่าน/เขียนผ่าน service role เท่านั้น (เหมือน shelves)
ALTER TABLE shelf_audits ENABLE ROW LEVEL SECURITY;
