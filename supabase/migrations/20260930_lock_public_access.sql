-- ============================================================================
-- ปิดสิทธิ์ของกุญแจสาธารณะต่อข้อมูลทั้งหมด
--
-- ปัญหาที่พบ 2026-09-30 (ตรวจกับฐานข้อมูลจริง):
--   • กุญแจสาธารณะ (anon key — ฝังอยู่ในหน้าเว็บ ใครก็หยิบได้โดยไม่ต้องล็อกอิน) อ่านได้ 23 ตาราง
--     รวม profiles (เลขบัตรประชาชน ที่อยู่ เบอร์โทร เลขบัญชี PIN ที่เข้ารหัส และ active_session_id)
--   • หลายตารางมี policy แบบ "TO authenticated USING (true)" และโครงการเปิดให้สมัครบัญชีเองได้
--     ใครสมัครด้วยอีเมลของตัวเองก็ได้สิทธิ์ authenticated = อ่านเขียนตารางเหล่านั้นได้
--   • ฟังก์ชันใน public ถูกเรียกได้โดย anon/authenticated ตามค่าเริ่มต้นของ Supabase
--     (REVOKE ... FROM PUBLIC อย่างเดียวไม่ถอนสิทธิ์ที่ให้ anon/authenticated ไว้ตรงๆ)
--
-- ระบบนี้ไม่ได้ใช้ Supabase Auth และไม่มีโค้ดฝั่ง browser ที่ต่อฐานข้อมูลเอง:
-- ทุกการอ่านเขียนของแอปผ่านกุญแจฝั่ง server (service_role) ซึ่งข้าม RLS
-- จึงปิดได้ทั้งหมดโดยไม่ต้องมี policy สักตัว
--
-- ⚠ ลำดับ: ต้อง deploy โค้ดรุ่น v1.24.1 ขึ้นไปก่อน (proxy.ts เลิกใช้กุญแจสาธารณะ) แล้วจึงรันไฟล์นี้
--   ถ้ารันก่อน deploy ทุกคนจะถูกเด้งไปหน้าล็อกอิน — แก้ได้ด้วยการ deploy (ข้อมูลไม่เสียหาย)
--
-- รันซ้ำได้ ไม่แตะข้อมูล ไม่แตะโครงสร้างตาราง
-- ยังต้องทำเองในหน้า Supabase: Authentication → Sign In / Providers → ปิด "Allow new users to sign up"
-- ============================================================================

DO $$
DECLARE
  r record;
BEGIN
  -- 1) เปิด RLS ทุกตารางใน public (ตารางที่เปิดอยู่แล้วไม่มีผล)
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
  END LOOP;

  -- 2) ลบ policy ทุกตัวใน public — RLS ที่เปิดโดยไม่มี policy = เข้าได้เฉพาะบทบาทที่ข้าม RLS (service_role)
  FOR r IN
    SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;

  -- 3) ที่เก็บไฟล์: ลบ policy ของ storage.objects ทั้งหมด
  --    อัปโหลดและลบทำผ่าน server เท่านั้น · ไฟล์ในบัคเก็ตแบบ public ยังเปิดดูผ่านลิงก์ได้ตามเดิม (ไม่ขึ้นกับ policy)
  IF to_regclass('storage.objects') IS NOT NULL THEN
    FOR r IN
      SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
    LOOP
      EXECUTE format('DROP POLICY %I ON storage.objects', r.policyname);
    END LOOP;
  END IF;
END $$;

-- 4) ถอนสิทธิ์ระดับตาราง วิว ลำดับ และฟังก์ชัน (วิวไม่อยู่ใต้ RLS จึงต้องถอนที่สิทธิ์)
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

GRANT ALL     ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL     ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- 5) ของที่สร้างใหม่ในอนาคต (โดยบทบาทที่รันไฟล์นี้) ไม่ให้สิทธิ์กุญแจสาธารณะโดยอัตโนมัติอีก
--    ข้อจำกัดของ Postgres ที่ต้องรู้ — migration ใหม่ทุกไฟล์ต้องทำเอง:
--      • ตารางใหม่: ENABLE ROW LEVEL SECURITY (ค่าเริ่มต้นตั้งให้อัตโนมัติไม่ได้)
--      • ฟังก์ชันใหม่: REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated
--        (สิทธิ์เรียกฟังก์ชันของ PUBLIC เป็นค่าเริ่มต้นระดับทั้งฐานข้อมูล ถอนเฉพาะ schema ไม่ได้
--         และไม่ถอนระดับทั้งฐานข้อมูลเพราะจะกระทบฟังก์ชันของ extension ที่ติดตั้งภายหลัง)
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL     ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL     ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT  ALL     ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT  ALL     ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT  EXECUTE ON FUNCTIONS TO service_role;
