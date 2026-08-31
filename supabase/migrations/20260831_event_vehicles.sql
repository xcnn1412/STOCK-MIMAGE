-- ============================================================================
-- จัดรถผูกกับอีเวนต์ผ่านตาราง event_vehicles (ADR-0004)
--
-- เดิม "จัดรถ" เก็บเป็น key ('car_triton' / 'car_champ') ใน crm_leads.tracking_checklist
-- ซึ่งผูกกับ "งาน" ไม่ใช่ "อีเวนต์" จึงต่างจากคน (event_staff) และกระเป๋า (event_kits)
-- ตารางนี้เก็บการจองรถหนึ่งแถว = รถหนึ่งคันกับอีเวนต์หนึ่ง และเป็น source of truth
--
-- tracking_checklist คงไว้เป็น cache ที่ server action sync ให้ทุกครั้งที่จัดรถ
-- (read path เดิมทั้งหมด — ความพร้อม, เลนรถบนไทม์ไลน์, การชน, สรุปหน้าที่ — ยังอ่านที่เดิม)
--
-- ชนของรถยังตัดสินด้วย "เวลาทับ" ตามเดิม (มีต่อคิวได้) ไม่ใช่รายวันแบบกระเป๋า
-- จึงไม่มี constraint เรื่องการชนในฐานข้อมูล — ตัดสินในโค้ด (tracking-logic.ts)
--
-- idempotent: CREATE TABLE/INDEX IF NOT EXISTS + backfill กันซ้ำด้วย WHERE NOT EXISTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_vehicles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  vehicle_key TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (event_id, vehicle_key)
);

COMMENT ON TABLE  event_vehicles             IS 'การจองรถให้อีเวนต์ (ADR-0004) — source of truth แทน key รถใน crm_leads.tracking_checklist';
COMMENT ON COLUMN event_vehicles.vehicle_key IS 'key ของรถ — ตรงกับ VEHICLES ใน app/(authenticated)/jobs/tracking/tracking-logic.ts (car_triton / car_champ)';

-- การ์ดงาน/ตารางภาพรวมอ่านตามอีเวนต์
CREATE INDEX IF NOT EXISTS event_vehicles_event_id_idx ON event_vehicles (event_id);

-- Backfill: งานที่เคยจัดรถไว้ใน tracking_checklist และมีอีเวนต์แล้ว → กลายเป็นการจองหนึ่งครั้ง
-- อีเวนต์ปลายทาง = ใบที่ยังไม่ปิดใบแรก (เรียงตามวันงาน) ถ้าปิดหมดแล้วก็ใช้ใบแรกของงาน
-- — กติกาเดียวกับ resolveLeadEvent(pickExisting) ที่ใช้ตอนจองกระเป๋า
INSERT INTO event_vehicles (event_id, vehicle_key)
SELECT b.event_id, b.vehicle_key
FROM (
  SELECT
    v.key AS vehicle_key,
    (
      SELECT e.id
      FROM events e
      WHERE e.crm_lead_id = l.id
      ORDER BY
        -- ใบที่ยังไม่ปิดมาก่อน — เขียน IS NOT NULL ด้วยเพราะ status NULL = ยังไม่ปิด
        -- (ปล่อยให้เป็น NULL จะถูกจัดไปท้ายสุดตามกติกา NULLS LAST ของ ASC)
        (e.status IS NOT NULL AND e.status IN ('completed', 'closed')) ASC,
        e.event_date ASC NULLS LAST,
        e.created_at ASC
      LIMIT 1
    ) AS event_id
  FROM crm_leads l
  CROSS JOIN (VALUES ('car_triton'), ('car_champ')) AS v(key)
  WHERE jsonb_exists(l.tracking_checklist, v.key)
) b
WHERE b.event_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM event_vehicles x
    WHERE x.event_id = b.event_id AND x.vehicle_key = b.vehicle_key
  );
