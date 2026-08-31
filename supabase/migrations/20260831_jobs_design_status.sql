-- สถานะออกแบบรายใบ — ใบงานกราฟิกหลายใบต่องานมีสถานะของตัวเอง
-- (งานหนึ่งเปิดใบงานกราฟิกได้หลายใบ #2 #3 แต่ละใบเดินสถานะออกแบบของตัวเอง แก้ใบไหนไม่กระทบใบอื่น)
-- crm_leads.design_status คงไว้เป็น cache ของ "ใบหลักที่ยังไม่จบ" — โค้ดเก่า/รายงานที่อ่านคอลัมน์เดิมยังทำงานได้
-- idempotent: รันซ้ำได้ (add column if not exists + backfill เฉพาะแถวที่ยังว่าง)

alter table jobs
  add column if not exists design_status text;

-- backfill: ใบงานกราฟิกที่ยังไม่มีสถานะของตัวเอง รับค่าจากงาน (crm_leads.design_status) ที่ใช้ร่วมกันอยู่เดิม
update jobs
set design_status = l.design_status
from crm_leads l
where jobs.crm_lead_id = l.id
  and jobs.job_type = 'graphic'
  and jobs.design_status is null;
