-- ล้างกระเป๋าทั้งหมด + ยกเลิกอีเวนต์ที่ผูกกับกระเป๋า (รันใน Supabase SQL Editor)
-- ฐานจริงยังไม่มีตาราง packing_lists (migration 20261012 ยังไม่รัน) — สคริปต์นี้ไม่แตะใบจัดของ
-- อุปกรณ์ (items), แม่แบบกระเป๋า (kit_templates) ไม่ถูกลบ

-- 0) enum event_status อาจไม่มีค่า cancelled — เพิ่มก่อน (รันแยกคำสั่ง ห้ามอยู่ใน BEGIN เดียวกัน)
ALTER TYPE event_status ADD VALUE IF NOT EXISTS 'cancelled';

BEGIN;

-- 1) อีเวนต์เป้าหมาย = ยังไม่จบ และผูกกับกระเป๋า
CREATE TEMP TABLE target_events AS
SELECT e.id FROM events e
WHERE (e.status IS NULL OR e.status::text NOT IN ('completed', 'closed', 'cancelled'))
  AND (
    EXISTS (SELECT 1 FROM event_kits ek WHERE ek.event_id = e.id)
    OR EXISTS (SELECT 1 FROM kits k WHERE k.event_id = e.id)
  );

-- 2) อุปกรณ์ที่ติดอยู่ในกระเป๋า → กลับเป็นว่าง
UPDATE items SET status = 'available'
WHERE status = 'in_use' AND id IN (SELECT item_id FROM kit_contents);

-- 3) ล้างกระเป๋า (ตัด FK เก่าก่อน แล้วค่อยลบตัวกระเป๋า)
UPDATE event_logs SET kit_id = NULL WHERE kit_id IS NOT NULL;
DELETE FROM event_kits;
DELETE FROM kit_contents;
DELETE FROM kits;

-- 4) ยกเลิกอีเวนต์
UPDATE events SET status = 'cancelled' WHERE id IN (SELECT id FROM target_events);

SELECT (SELECT count(*) FROM kits) AS kits_left,
       (SELECT count(*) FROM target_events) AS events_cancelled,
       (SELECT count(*) FROM items WHERE status = 'in_use') AS items_still_in_use;

COMMIT;  -- ตัวเลขไม่ตรงที่คิด → เปลี่ยนเป็น ROLLBACK;
