-- ============================================================================
-- รวมการผูกกระเป๋าให้เหลือ event_kits ที่เดียว (ADR-0003, v1.29.0)
--
-- ก่อน v1.29.0 หน้าสร้าง/แก้ไขอีเวนต์เขียนแค่ kits.event_id ไม่ได้สร้างแถวจอง
-- ไฟล์นี้สร้างแถวจองให้กระเป๋าเหล่านั้น (ยังไม่จัด) — รันซ้ำได้ ไม่สร้างแถวซ้ำ
-- หลังรัน: kits.event_id = "ตอนนี้กระเป๋าอยู่กับงานไหน" ซึ่งโค้ดคำนวณจาก event_kits เอง
-- ============================================================================

INSERT INTO event_kits (event_id, kit_id)
SELECT k.event_id, k.id
FROM kits k
JOIN events e ON e.id = k.event_id
WHERE k.event_id IS NOT NULL
  AND COALESCE(e.status, '') NOT IN ('completed', 'closed')
  AND NOT EXISTS (
    SELECT 1 FROM event_kits ek
    WHERE ek.event_id = k.event_id AND ek.kit_id = k.id
  );

-- ตัวชี้ที่ค้างอยู่กับอีเวนต์ที่ปิดแล้ว → ว่าง
UPDATE kits k
SET event_id = NULL
FROM events e
WHERE e.id = k.event_id
  AND e.status IN ('completed', 'closed');

-- ----------------------------------------------------------------------------
-- (ไม่บังคับ) ดูกระเป๋าที่ถูกจองสองงานวันเดียวกันของงานที่ยังไม่ปิด — ระบบแค่เตือน ไม่ได้แก้ให้
-- SELECT kt.name AS kit, a.name AS event_a, b.name AS event_b, a.event_date,
--        a.event_time AS a_start, a.event_end_time AS a_end, b.event_time AS b_start, b.event_end_time AS b_end
-- FROM event_kits x
-- JOIN event_kits y ON y.kit_id = x.kit_id AND y.event_id > x.event_id
-- JOIN events a ON a.id = x.event_id
-- JOIN events b ON b.id = y.event_id
-- JOIN kits kt ON kt.id = x.kit_id
-- WHERE a.event_date = b.event_date
--   AND COALESCE(a.status, '') NOT IN ('completed', 'closed') AND COALESCE(b.status, '') NOT IN ('completed', 'closed')
-- ORDER BY a.event_date;
