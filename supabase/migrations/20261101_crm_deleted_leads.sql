-- บันทึกลูกค้า CRM ที่ถูกลบ (หน้า /crm/trash) — deleteLead เขียน snapshot ก่อนลบจริง
-- snapshot = { lead, installments, activities, events } ณ ตอนลบ (ไฟล์สลิปใน storage ถูกลบไปแล้ว กู้ไม่ได้)
-- service role เท่านั้น (เปิด RLS ไม่มี policy) เหมือนตาราง crm_* อื่น · รันซ้ำได้
CREATE TABLE IF NOT EXISTS crm_deleted_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  customer_name text,
  status text,
  deleted_by uuid REFERENCES profiles(id),
  deleted_at timestamptz NOT NULL DEFAULT now(),
  snapshot jsonb NOT NULL
);

ALTER TABLE crm_deleted_leads ENABLE ROW LEVEL SECURITY;
