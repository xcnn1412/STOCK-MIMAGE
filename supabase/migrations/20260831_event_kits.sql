-- ============================================================================
-- จองกระเป๋าผ่านตาราง event_kits (ADR-0003)
--
-- kits.event_id เดิมผูกกระเป๋าได้ทีละหนึ่งอีเวนต์ จึงจองล่วงหน้าไม่ได้และเลน
-- กระเป๋าบนไทม์ไลน์เห็นได้ทีละงาน ตารางนี้เก็บ "การจอง" หนึ่งแถว = กระเป๋าหนึ่งใบ
-- กับอีเวนต์หนึ่ง กระเป๋าใบเดียวจองหลายอีเวนต์คนละวันได้
-- (ชน = จองสองอีเวนต์วันเดียวกัน — บังคับในโค้ด ไม่ใช่ constraint เพราะวันงานอยู่ที่ events)
--
-- packed_at/packed_by = "จัดกระเป๋า" ของการจองครั้งนั้น ย้ายการจองไปอีเวนต์อื่น
-- (ลบแถว + จองใหม่) สถานะจัดจึงรีเซ็ตเองโดยไม่ต้องเคลียร์เพิ่ม
--
-- kits.event_id คงไว้เพื่อ backward compat กับ flow เช็ค/คืนกระเป๋าเดิม
-- โดยถือว่า event_kits เป็น source of truth ของการจอง
--
-- idempotent: CREATE TABLE/INDEX IF NOT EXISTS + backfill กันซ้ำด้วย WHERE NOT EXISTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_kits (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  kit_id     UUID NOT NULL REFERENCES kits(id) ON DELETE CASCADE,
  packed_at  TIMESTAMPTZ,
  packed_by  UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (event_id, kit_id)
);

COMMENT ON TABLE  event_kits            IS 'การจองกระเป๋าให้อีเวนต์ (ADR-0003) — source of truth แทน kits.event_id';
COMMENT ON COLUMN event_kits.packed_at  IS 'เวลาที่เช็คของครบทุกชิ้น (จัดกระเป๋า) — null = ยังไม่จัด';
COMMENT ON COLUMN event_kits.packed_by  IS 'คนที่จัดกระเป๋าครั้งนั้น — null = ยังไม่จัด';

-- เลนกระเป๋า/ตรวจชน อ่านตามกระเป๋า, การ์ดใบงานอ่านตามอีเวนต์
CREATE INDEX IF NOT EXISTS event_kits_kit_id_idx   ON event_kits (kit_id);
CREATE INDEX IF NOT EXISTS event_kits_event_id_idx ON event_kits (event_id);

-- Backfill: การผูกเดิม (kits.event_id) กลายเป็นการจองหนึ่งครั้ง — ยังไม่จัด (packed_at = null)
INSERT INTO event_kits (event_id, kit_id)
SELECT k.event_id, k.id
FROM kits k
WHERE k.event_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM event_kits ek
    WHERE ek.event_id = k.event_id AND ek.kit_id = k.id
  );
