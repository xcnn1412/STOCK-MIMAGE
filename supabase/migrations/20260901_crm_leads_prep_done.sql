-- ปุ่ม "เสร็จสิ้น" บนคำเตือนงานที่เลยวันงานแล้ว (dashboard-alerts)
-- งานที่เลยวันไปแล้วแต่หน้าที่ไม่เคยครบ จะค้างเป็นคำเตือนแดงเข้ม — ปิดได้ด้วยการ stamp เวลาไว้
-- idempotent: รันซ้ำได้

alter table crm_leads
  add column if not exists prep_done_at timestamptz;
