-- ปิดช่อง H1 (รายงานความปลอดภัย 2026-10-29): policy นี้ไม่ระบุ role จึงใช้กับ public (รวม anon key ที่อยู่ใน bundle)
-- → ใครก็ list/อัปโหลด/เขียนทับ/ลบรูปใบจัดของได้ · โค้ดอัปโหลดใช้ service role (ข้าม RLS) อยู่แล้ว ไม่ต้องมี policy
-- รันซ้ำได้
DROP POLICY IF EXISTS packing_photos_all ON storage.objects;
