-- ตรวจ guard trigger ของ salary_slips หลังรัน supabase/migrations/20260828_create_salary_module.sql
-- รันได้ทั้งใน Supabase SQL Editor และ psql — ใช้โปรไฟล์จริง 2 คนแรก, สร้างงวดทดสอบ 'ZZTEST-trigger' แล้ว purge ทิ้งตอนจบ
-- ผลลัพธ์อ่านจาก NOTICE: ทุกข้อต้องขึ้น "ok" — ถ้ามี "FAIL" แปลว่า trigger ไม่ทำงาน
-- (ponytail: ใช้แทน scripts/salary-check.ts ส่วน B เมื่อไม่มี local stack + PostgREST)
DO $$
DECLARE
  u1 uuid; u2 uuid; run_id uuid; slip1 uuid; slip2 uuid; n int;
BEGIN
  SELECT id INTO u1 FROM profiles WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;
  SELECT id INTO u2 FROM profiles WHERE deleted_at IS NULL AND id <> u1 ORDER BY created_at LIMIT 1;
  IF u1 IS NULL OR u2 IS NULL THEN RAISE EXCEPTION 'ต้องมี profiles อย่างน้อย 2 คน'; END IF;

  PERFORM purge_test_salary_run('ZZTEST-trigger'); -- เผื่อรอบก่อนค้าง
  INSERT INTO salary_runs(period_key, period_start, period_end) VALUES ('ZZTEST-trigger', '2026-07-26', '2026-08-25') RETURNING id INTO run_id;
  INSERT INTO salary_slips(run_id, user_id, total) VALUES (run_id, u1, 100) RETURNING id INTO slip1;

  UPDATE salary_slips SET status = 'finalized', finalized_at = now() WHERE id = slip1;
  RAISE NOTICE 'B1 ok: draft -> finalized';

  BEGIN
    UPDATE salary_slips SET lines = '[{"key":"x"}]'::jsonb WHERE id = slip1;
    RAISE NOTICE 'B2 FAIL: แก้ lines ของสลิปที่ปิดงวดได้';
  EXCEPTION WHEN raise_exception THEN RAISE NOTICE 'B2 ok blocked: %', SQLERRM; END;

  BEGIN
    UPDATE salary_slips SET total = 999 WHERE id = slip1;
    RAISE NOTICE 'B3 FAIL: แก้ total ของสลิปที่ปิดงวดได้';
  EXCEPTION WHEN raise_exception THEN RAISE NOTICE 'B3 ok blocked: %', SQLERRM; END;

  UPDATE salary_slips SET status = 'paid', paid_at = now() WHERE id = slip1;
  RAISE NOTICE 'B4 ok: finalized -> paid';

  BEGIN
    UPDATE salary_slips SET status = 'draft' WHERE id = slip1;
    RAISE NOTICE 'B5 FAIL: ถอยสถานะได้';
  EXCEPTION WHEN raise_exception THEN RAISE NOTICE 'B5 ok blocked: %', SQLERRM; END;

  BEGIN
    DELETE FROM salary_slips WHERE id = slip1;
    RAISE NOTICE 'B6 FAIL: ลบสลิปที่จ่ายแล้วได้';
  EXCEPTION WHEN raise_exception THEN RAISE NOTICE 'B6 ok blocked: %', SQLERRM; END;

  INSERT INTO salary_slips(run_id, user_id) VALUES (run_id, u2) RETURNING id INTO slip2;
  DELETE FROM salary_slips WHERE id = slip2;
  RAISE NOTICE 'B7 ok: ลบสลิปร่างได้';

  BEGIN
    DELETE FROM salary_runs WHERE id = run_id;
    RAISE NOTICE 'B8 FAIL: ลบงวดที่มีสลิปปิดแล้วได้';
  EXCEPTION WHEN raise_exception THEN RAISE NOTICE 'B8 ok blocked: %', SQLERRM; END;

  BEGIN
    PERFORM purge_test_salary_run('2026-08');
    RAISE NOTICE 'B9 FAIL: purge งวดจริงได้';
  EXCEPTION WHEN raise_exception THEN RAISE NOTICE 'B9 ok refused: %', SQLERRM; END;

  PERFORM purge_test_salary_run('ZZTEST-trigger');
  SELECT count(*) INTO n FROM salary_runs WHERE period_key = 'ZZTEST-trigger';
  RAISE NOTICE 'B10 %: purge งวดทดสอบ (เหลือ %)', CASE WHEN n = 0 THEN 'ok' ELSE 'FAIL' END, n;

  SELECT count(*) INTO n FROM salary_duties;
  RAISE NOTICE 'B11 duties=% cutoff=% oop=%', n,
    (SELECT value FROM app_settings WHERE key = 'salary_cutoff_day'),
    (SELECT value FROM app_settings WHERE key = 'salary_out_of_province_rate');
END $$;
