-- ============================================================================
-- เติมประเภทงาน = 'event' ให้การ์ด CRM ที่ตอบรับช่วง 2026-05-22 → 2026-06-25 แต่ยังไม่ระบุประเภทงาน
-- ใช้ก่อนดูหน้า "สรุปค่าคอมแอดมิน" งวด พ.ค.–มิ.ย. 69 — เจ้าของรันเองใน Supabase SQL editor
--
-- เงื่อนไข (ตรงกับกติกาใน app/(authenticated)/sales-board/commission-logic.ts):
--   * สถานะปัจจุบัน "ตอบรับแล้ว" = ไม่ใช่ lead/booking/following_up/quotation_sent/rejected/cancelled
--   * วันล็อคคิว = วันที่ (เวลาไทย) ของ status_change → ตอบรับแล้ว ครั้งแรก (ไม่มีประวัติ = วันสร้างการ์ด)
--   * วันล็อคคิวอยู่ใน 2026-05-22 → 2026-06-25
--   * work_type IS NULL, มี event_date และ event_date >= วันล็อคคิว
--
-- ขั้นตอน: รันส่วนที่ 1 ตรวจรายการก่อน → รันส่วนที่ 2 (จบด้วย ROLLBACK = ยังไม่บันทึก)
--          ตรวจจำนวนแถวแล้ว เปลี่ยน ROLLBACK เป็น COMMIT เองเมื่อแน่ใจ
-- ============================================================================

-- ── ส่วนที่ 1: ดูรายการ (อ่านอย่างเดียว) ──
with first_won as (
  select a.lead_id,
         min(a.created_at) as first_won_at
  from crm_activities a
  where a.activity_type = 'status_change'
    and coalesce(trim(a.new_status), '') <> ''
    and lower(trim(a.new_status)) not in ('lead', 'booking', 'following_up', 'quotation_sent', 'rejected', 'cancelled')
  group by a.lead_id
),
cand as (
  select l.id, l.customer_name, l.customer_line, l.status, l.event_date, l.quotation_ref,
         (coalesce(k.first_won_at, l.created_at) at time zone 'Asia/Bangkok')::date as lock_date
  from crm_leads l
  left join first_won k on k.lead_id = l.id
  where coalesce(trim(l.status), '') <> ''
    and lower(trim(l.status)) not in ('lead', 'booking', 'following_up', 'quotation_sent', 'rejected', 'cancelled')
    and l.work_type is null
    and l.event_date is not null
)
select * from cand
where lock_date between date '2026-05-22' and date '2026-06-25'
  and event_date >= lock_date
order by lock_date, event_date;

-- ── ส่วนที่ 2: เติมประเภทงาน (เงื่อนไขเดียวกัน) ──
BEGIN;

with first_won as (
  select a.lead_id,
         min(a.created_at) as first_won_at
  from crm_activities a
  where a.activity_type = 'status_change'
    and coalesce(trim(a.new_status), '') <> ''
    and lower(trim(a.new_status)) not in ('lead', 'booking', 'following_up', 'quotation_sent', 'rejected', 'cancelled')
  group by a.lead_id
),
cand as (
  select l.id, l.event_date,
         (coalesce(k.first_won_at, l.created_at) at time zone 'Asia/Bangkok')::date as lock_date
  from crm_leads l
  left join first_won k on k.lead_id = l.id
  where coalesce(trim(l.status), '') <> ''
    and lower(trim(l.status)) not in ('lead', 'booking', 'following_up', 'quotation_sent', 'rejected', 'cancelled')
    and l.work_type is null
    and l.event_date is not null
)
update crm_leads l
set work_type = 'event', updated_at = now()
from cand c
where l.id = c.id
  and c.lock_date between date '2026-05-22' and date '2026-06-25'
  and c.event_date >= c.lock_date
returning l.id, l.customer_name, l.event_date;

-- ตรวจแล้วเปลี่ยนเป็น COMMIT; เอง
ROLLBACK;
