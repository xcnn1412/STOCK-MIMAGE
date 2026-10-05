-- ============================================================================
-- ประตูทางเข้าของห้องเก็บของ (v1.40.0) — แค่หมุดบอกว่าอยู่ผนังด้านไหน ช่องที่เท่าไร ไม่กั้นพื้นที่
--
-- door_side : front = ผนัง y = depth (ด้านล่างของผัง = ด้านหน้า) · back = y = 0 · left = x = 0 · right = x = width
-- door_pos  : ช่องบนผนังด้านนั้น เริ่ม 0 (front/back นับจากซ้าย, left/right นับจากหลัง)
-- NULL ทั้งคู่ = ยังไม่ได้ปักหมุด · ต้องรันหลัง 20261006_shelf_rooms.sql · idempotent: รันซ้ำได้
-- ============================================================================

ALTER TABLE shelf_rooms ADD COLUMN IF NOT EXISTS door_side TEXT CHECK (door_side IN ('front', 'back', 'left', 'right'));
ALTER TABLE shelf_rooms ADD COLUMN IF NOT EXISTS door_pos  INT  CHECK (door_pos >= 0);

COMMENT ON COLUMN shelf_rooms.door_side IS 'ผนังที่มีประตูทางเข้า — NULL = ยังไม่ได้ปักหมุด';
COMMENT ON COLUMN shelf_rooms.door_pos  IS 'ช่องบนผนังด้านนั้น (เริ่ม 0)';
