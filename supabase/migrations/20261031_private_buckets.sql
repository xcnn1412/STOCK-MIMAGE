-- ============================================================================
-- M3: ตั้งบัคเก็ตที่เก็บข้อมูลส่วนตัว/การเงินเป็น private
--   checkin-photos (selfie เช็คอิน + ใบลา/ใบรับรองแพทย์) · receipts (ใบเสร็จ/สลิปใบเบิก)
--   crm-payment-proofs (สลิปลูกค้า) · login_selfies
--
-- ⚠️ รันหลัง deploy release ที่มี /api/file และ lib/file-url.ts แล้วเท่านั้น
--    ลิงก์สาธารณะเดิม (/storage/v1/object/public/...) ใช้ไม่ได้ทันทีที่รัน —
--    แอปเวอร์ชันใหม่แปลงลิงก์เดิมเป็น /api/file/<bucket>/<path> (ตรวจล็อกอิน → signed URL 5 นาที)
--    ชุดเอกสารใบเบิกดาวน์โหลดผ่าน service client แทน HTTP
-- URL ที่เก็บในฐานข้อมูลไม่ต้องแก้ · รันซ้ำได้ · ย้อนกลับ: set public = true
-- ============================================================================

UPDATE storage.buckets
SET public = false
WHERE id IN ('checkin-photos', 'receipts', 'crm-payment-proofs', 'login_selfies');

-- ตรวจ: select id, public from storage.buckets order by id;
