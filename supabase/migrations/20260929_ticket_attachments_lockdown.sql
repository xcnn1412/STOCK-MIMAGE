-- ============================================================================
-- ปิดช่องเขียนตรงของบัคเก็ต ticket-attachments
--
-- ปัญหา: policy ticket_attachments_all (จาก 20260310_create_ticket_attachments_bucket.sql)
--   เป็น FOR ALL และไม่ระบุ role → ใครก็ตามที่ถือ anon key (อยู่ในเบราว์เซอร์ทุกเครื่อง
--   เพราะเป็นค่า NEXT_PUBLIC_*) ยิง Storage API ตรงได้เลย: อัปโหลด เขียนทับ และลบไฟล์
--   ของใครก็ได้ในบัคเก็ตนี้ โดยไม่ผ่านการตรวจสิทธิ์ใน server action
--
-- ทางแก้: ลบ policy ทิ้งอย่างเดียว ไม่เปิดสิทธิ์อะไรแทน — การอัปโหลด/ลบที่ถูกต้องทุกทาง
--   ทำฝั่งเซิร์ฟเวอร์ด้วย service-role client ซึ่งข้าม RLS อยู่แล้ว
--   (ไม่มี client component ไหนเรียก storage ของบัคเก็ตนี้ตรงๆ)
--
-- ผลต่อการเปิดดูไฟล์: ไม่มี — บัคเก็ตยังเป็น public ลิงก์แบบ
--   /storage/v1/object/public/ticket-attachments/... ไม่ผ่าน RLS จึงไม่ต้องมี policy
--
-- idempotent: รันซ้ำได้
-- ============================================================================

DROP POLICY IF EXISTS ticket_attachments_all ON storage.objects;

-- ----------------------------------------------------------------------------
-- ข้อมูลประกอบเท่านั้น (ไม่มีคำสั่ง):
--   • บัคเก็ต ticket-attachments ยังเป็น public → เปิดดูไฟล์ด้วยลิงก์ได้เหมือนเดิม
--   • อัปโหลด: uploadTicketAttachments (jobs/actions.ts), uploadMyCommentAttachments
--     (jobs/my-job/actions.ts), uploadContentExampleImages (content-planner/actions.ts)
--     — ทุกตัวอยู่ฝั่งเซิร์ฟเวอร์และใช้ service role
--   • ลบ: deleteTicketAttachment (jobs/actions.ts) และ removeStorageByUrls ตอนลบตั๋ว
--     — ฝั่งเซิร์ฟเวอร์เช่นกัน
--   • หลังรันแล้ว anon key อัปโหลด เขียนทับ ลบ หรือไล่รายชื่อไฟล์ในบัคเก็ตนี้ไม่ได้อีก
-- ----------------------------------------------------------------------------
