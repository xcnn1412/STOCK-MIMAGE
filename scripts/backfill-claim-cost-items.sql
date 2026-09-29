-- ============================================================================
-- เติมรายการต้นทุน (job_cost_items) ให้ตรงกับใบเบิก — เจ้าของรันเองใน Supabase SQL editor
-- *** ตัวเลขต้นทุนในโมดูล Costs จะเพิ่มขึ้น ต้องได้รับการอนุมัติจากเจ้าของก่อนรัน ***
--
-- ปัญหาที่พบ 2026-09-30 (ฐานข้อมูลจริง):
--   * ใบเบิกที่ผูกงานและอนุมัติแล้วขึ้นไป 1,089 ใบ ขาดรายการต้นทุน 445 ใบ รวม 1,276,565.58 บาท กระทบ 176 งาน
--     (จ่ายแล้ว 406 · รอใบกำกับภาษี 31 · อนุมัติแล้ว 8) — ต้นทุนของงานเหล่านี้ในโมดูล Costs ต่ำกว่าจริง
--   * ใบที่ไม่ควรมีรายการต้นทุนแต่มี 6 ใบ (3,510 บาท) · ใบที่มีรายการซ้ำ 4 ใบ · รายการของใบเบิกที่ถูกลบแล้ว 3 รายการ
-- สาเหตุ: เดิมรายการต้นทุนถูกสร้างเฉพาะตอนกดปุ่ม "อนุมัติ" การเปลี่ยนสถานะทางอื่นไม่สร้าง/ไม่ลบให้
--         โค้ดตั้งแต่ v1.24.1 ดูแลให้ตรงทุกครั้งที่สถานะเปลี่ยนแล้ว ไฟล์นี้แก้เฉพาะข้อมูลที่ค้างมาก่อนหน้า
--
-- กติกา (ตรงกับ app/(authenticated)/finance/claim-rules.ts และ syncClaimCostItem ใน finance/actions.ts):
--   * ใบเบิกต้องมีรายการต้นทุนหนึ่งรายการ เมื่อ ผูกงาน และสถานะเป็น
--     approved / pending_month_end / waiting_tax_invoice / awaiting_payment / paid / refund_confirmed
--   * รายการต้นทุนผูกกับใบเบิกด้วย id ท้ายช่อง notes: "<เลขที่ใบเบิก>::<id ใบเบิก>"
--   * รายการที่กรอกมือ (notes ไม่ได้ลงท้ายด้วย ::<id>) ไม่ถูกแตะ
--
-- ข้อควรตรวจก่อนอนุมัติ: ถ้าเคยมีคนกรอกต้นทุนของใบเหล่านี้ด้วยมือในโมดูล Costs ไว้แล้ว
--   การเติมจะทำให้ต้นทุนของงานนั้นถูกนับสองครั้ง — ส่วนที่ 1 ข แสดงงานที่มีรายการกรอกมืออยู่ด้วยให้ตรวจ
--
-- ลำดับ: รันหลัง deploy v1.24.1 · รันก่อนหรือหลัง 20260930_claim_numbers.sql ก็ได้
-- ขั้นตอน: รันส่วนที่ 1 ตรวจรายการ → รันส่วนที่ 2 (จบด้วย ROLLBACK = ยังไม่บันทึก) ตรวจตัวเลขสรุป
--          แล้วเปลี่ยน ROLLBACK เป็น COMMIT เองเมื่อแน่ใจ · รันซ้ำได้ รอบที่สองไม่เปลี่ยนอะไร
-- ก่อนรัน: สำรองตาราง job_cost_items
-- ============================================================================

-- ── ส่วนที่ 1 ก: สรุป (อ่านอย่างเดียว) ──
WITH linked AS (
  SELECT i.id, i.amount, i.created_at,
         substring(i.notes FROM '::([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$')::uuid AS claim_id
  FROM job_cost_items i
  WHERE i.notes ~ '::[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
),
must AS (
  SELECT c.* FROM expense_claims c
  WHERE c.job_event_id IS NOT NULL
    AND c.status IN ('approved', 'pending_month_end', 'waiting_tax_invoice', 'awaiting_payment', 'paid', 'refund_confirmed')
)
SELECT 'จะเติม: ใบเบิกที่ขาดรายการต้นทุน' AS รายการ, count(*) AS จำนวน,
       COALESCE(sum(COALESCE(NULLIF(m.amount, 0), COALESCE(m.unit_price, 0) * COALESCE(m.quantity, 0))), 0) AS ยอดรวม
  FROM must m WHERE NOT EXISTS (SELECT 1 FROM linked l WHERE l.claim_id = m.id)
UNION ALL
SELECT 'จะลบ: รายการของใบที่ไม่ควรมี หรือใบเบิกถูกลบแล้ว', count(*), COALESCE(sum(l.amount), 0)
  FROM linked l WHERE NOT EXISTS (SELECT 1 FROM must m WHERE m.id = l.claim_id)
UNION ALL
SELECT 'จะลบ: รายการซ้ำ (เก็บรายการเก่าสุดไว้)', count(*), COALESCE(sum(d.amount), 0)
  FROM (
    SELECT l.amount, row_number() OVER (PARTITION BY l.claim_id ORDER BY l.created_at, l.id) AS rn
    FROM linked l WHERE EXISTS (SELECT 1 FROM must m WHERE m.id = l.claim_id)
  ) d WHERE d.rn > 1;

-- ── ส่วนที่ 1 ข: ต้นทุนที่จะเพิ่มต่องาน + งานนั้นมีรายการกรอกมืออยู่เท่าไร (ตรวจการนับซ้ำ) ──
WITH linked AS (
  SELECT substring(i.notes FROM '::([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$')::uuid AS claim_id
  FROM job_cost_items i
  WHERE i.notes ~ '::[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
),
missing AS (
  SELECT c.* FROM expense_claims c
  WHERE c.job_event_id IS NOT NULL
    AND c.status IN ('approved', 'pending_month_end', 'waiting_tax_invoice', 'awaiting_payment', 'paid', 'refund_confirmed')
    AND NOT EXISTS (SELECT 1 FROM linked l WHERE l.claim_id = c.id)
)
SELECT e.event_name AS งาน, e.event_date AS วันงาน,
       count(*) AS ใบเบิกที่จะเติม,
       sum(COALESCE(NULLIF(m.amount, 0), COALESCE(m.unit_price, 0) * COALESCE(m.quantity, 0))) AS ต้นทุนที่จะเพิ่ม,
       (SELECT count(*) FROM job_cost_items i
         WHERE i.job_event_id = e.id
           AND (i.notes IS NULL OR i.notes !~ '::[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')) AS รายการกรอกมือ,
       (SELECT COALESCE(sum(i.amount), 0) FROM job_cost_items i
         WHERE i.job_event_id = e.id
           AND (i.notes IS NULL OR i.notes !~ '::[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')) AS ยอดกรอกมือ
FROM missing m
JOIN job_cost_events e ON e.id = m.job_event_id
GROUP BY e.id, e.event_name, e.event_date
ORDER BY ต้นทุนที่จะเพิ่ม DESC;

-- ── ส่วนที่ 2: แก้ข้อมูล (จบด้วย ROLLBACK = ยังไม่บันทึก) ──
-- ทุกคำสั่งจับคู่รายการกับใบเบิกด้วย id ที่ตัดจากท้าย notes แล้วแปลงเป็น uuid (ตัวพิมพ์เล็ก/ใหญ่ไม่มีผล)
BEGIN;

-- 2.1 ลบรายการของใบที่ไม่ควรมี (ยังไม่อนุมัติ / ถูกปฏิเสธ / ยกเลิก / ไม่ได้ผูกงาน) และของใบเบิกที่ถูกลบแล้ว
DELETE FROM job_cost_items i
WHERE i.notes ~ '::[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  AND NOT EXISTS (
    SELECT 1 FROM expense_claims c
    WHERE c.id = substring(i.notes FROM '::([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$')::uuid
      AND c.job_event_id IS NOT NULL
      AND c.status IN ('approved', 'pending_month_end', 'waiting_tax_invoice', 'awaiting_payment', 'paid', 'refund_confirmed')
  );

-- 2.2 ลบรายการซ้ำ เก็บรายการเก่าสุดของแต่ละใบเบิกไว้หนึ่งรายการ
DELETE FROM job_cost_items i
USING (
  SELECT id, row_number() OVER (
           PARTITION BY substring(notes FROM '::([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$')::uuid
           ORDER BY created_at, id
         ) AS rn
  FROM job_cost_items
  WHERE notes ~ '::[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
) d
WHERE i.id = d.id AND d.rn > 1;

-- 2.3 เติมรายการที่ขาด — ค่าเดียวกับที่ระบบสร้างเองตอนอนุมัติ
INSERT INTO job_cost_items (job_event_id, category, description, amount, unit_price, quantity, unit, recorded_by, notes)
SELECT c.job_event_id,
       c.category,
       '[เบิกเงิน] ' || c.title,
       COALESCE(NULLIF(c.amount, 0), COALESCE(c.unit_price, 0) * COALESCE(c.quantity, 0)),
       COALESCE(NULLIF(c.unit_price, 0), c.amount, 0),
       COALESCE(c.quantity, 1),
       'รายการ',
       COALESCE(c.approved_by, c.paid_by, c.submitted_by),
       c.claim_number || '::' || c.id::text
FROM expense_claims c
WHERE c.job_event_id IS NOT NULL
  AND c.status IN ('approved', 'pending_month_end', 'waiting_tax_invoice', 'awaiting_payment', 'paid', 'refund_confirmed')
  AND NOT EXISTS (
    SELECT 1 FROM job_cost_items i
    WHERE substring(i.notes FROM '::([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$')::uuid = c.id
  );

-- 2.4 ตรวจผล: ทุกบรรทัดต้องเป็น 0
SELECT 'ใบเบิกที่ไม่ได้มีรายการต้นทุนหนึ่งรายการพอดี' AS ตรวจ, count(*) AS ต้องเป็นศูนย์
  FROM expense_claims c
 WHERE c.job_event_id IS NOT NULL
   AND c.status IN ('approved', 'pending_month_end', 'waiting_tax_invoice', 'awaiting_payment', 'paid', 'refund_confirmed')
   AND (SELECT count(*) FROM job_cost_items i
         WHERE substring(i.notes FROM '::([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$')::uuid = c.id) <> 1
UNION ALL
SELECT 'รายการต้นทุนของใบที่ไม่ควรมี', count(*)
  FROM job_cost_items i
 WHERE i.notes ~ '::[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   AND NOT EXISTS (
     SELECT 1 FROM expense_claims c
     WHERE c.id = substring(i.notes FROM '::([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$')::uuid
       AND c.job_event_id IS NOT NULL
       AND c.status IN ('approved', 'pending_month_end', 'waiting_tax_invoice', 'awaiting_payment', 'paid', 'refund_confirmed')
   )
UNION ALL
SELECT 'รายการที่เพิ่งเติม ที่ยอดหรืองานไม่ตรงกับใบเบิก', count(*)
  FROM job_cost_items i
  JOIN expense_claims c
    ON c.id = substring(i.notes FROM '::([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$')::uuid
 WHERE i.created_at >= now() - interval '1 minute'
   AND (i.job_event_id <> c.job_event_id
        OR i.amount <> COALESCE(NULLIF(c.amount, 0), COALESCE(c.unit_price, 0) * COALESCE(c.quantity, 0)));

ROLLBACK;  -- ตรวจตัวเลขแล้ว เปลี่ยนเป็น COMMIT เพื่อบันทึกจริง
