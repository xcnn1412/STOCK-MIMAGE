-- M10 (รายงานความปลอดภัย 2026-10-29): นับ PIN ผิดแบบ atomic
-- เดิม app/login/actions.ts อ่านค่า failed_login_attempts แล้วเขียน +1 กลับ → ยิงพร้อมกัน N ครั้ง นับเพิ่มแค่ ~1
-- ฟังก์ชันนี้บวกใน UPDATE เดียว และตั้ง locked_until เมื่อครบ p_max ครั้ง คืนจำนวนครั้งล่าสุด
-- เรียกได้เฉพาะ service role (โค้ดฝั่ง server) · รันซ้ำได้ · โค้ดมี fallback แบบเดิมถ้ายังไม่ได้รันไฟล์นี้

CREATE OR REPLACE FUNCTION public.increment_failed_login(p_user uuid, p_max int, p_lock_minutes int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempts int;
BEGIN
  UPDATE profiles
     SET failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1,
         locked_until = CASE
           WHEN COALESCE(failed_login_attempts, 0) + 1 >= p_max
             THEN now() + make_interval(mins => p_lock_minutes)
           ELSE locked_until
         END
   WHERE id = p_user
  RETURNING failed_login_attempts INTO v_attempts;

  RETURN v_attempts; -- ไม่พบผู้ใช้ = NULL
END;
$$;

REVOKE ALL ON FUNCTION public.increment_failed_login(uuid, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_failed_login(uuid, int, int) TO service_role;
