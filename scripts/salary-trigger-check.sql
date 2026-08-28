-- ตรวจ guard trigger + finalize_salary_slip ของ salary_slips หลังรัน migration เงินเดือน
-- (supabase/migrations/20260828_create_salary_module.sql + 20260829_salary_weekly_runs.sql)
-- รันได้ทั้งใน Supabase SQL Editor และ psql — ใช้โปรไฟล์จริง 2 คนแรก, สร้างงวดทดสอบ 'ZZTEST-*' แล้ว purge ทิ้งตอนจบ
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

-- ============================================================================
-- B12–B14 — เช็คอินจ่ายได้ครั้งเดียว (supabase/migrations/20260829_salary_weekly_runs.sql)
-- ใช้ profiles คนแรก + เช็คอินทดสอบ note = 'ZZTEST-paidonce' แล้วล้างทิ้งตอนจบ
-- ============================================================================
DO $$
DECLARE
  u1 uuid; run_a uuid; run_b uuid; run_c uuid;
  slip_a uuid; slip_b uuid; slip_c uuid;
  c1 uuid; c2 uuid; c3 uuid; n int; st text;
BEGIN
  SELECT id INTO u1 FROM profiles WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;
  IF u1 IS NULL THEN RAISE EXCEPTION 'ต้องมี profiles อย่างน้อย 1 คน'; END IF;

  -- เผื่อรอบก่อนค้าง (ลบงวดก่อน — paid_slip_id ถูกล้างเองด้วย ON DELETE SET NULL)
  PERFORM purge_test_salary_run('ZZTEST-paidonce-a');
  PERFORM purge_test_salary_run('ZZTEST-paidonce-b');
  PERFORM purge_test_salary_run('ZZTEST-paidonce-c');
  DELETE FROM staff_checkins WHERE note = 'ZZTEST-paidonce';

  INSERT INTO staff_checkins(user_id, check_type, checked_in_at, note)
    VALUES (u1, 'onsite', TIMESTAMPTZ '2026-09-02 10:00+07', 'ZZTEST-paidonce') RETURNING id INTO c1;
  INSERT INTO staff_checkins(user_id, check_type, checked_in_at, note)
    VALUES (u1, 'onsite', TIMESTAMPTZ '2026-09-03 10:00+07', 'ZZTEST-paidonce') RETURNING id INTO c2;
  INSERT INTO staff_checkins(user_id, check_type, checked_in_at, note)
    VALUES (u1, 'onsite', TIMESTAMPTZ '2026-09-04 10:00+07', 'ZZTEST-paidonce') RETURNING id INTO c3;

  -- ── งวดสัปดาห์ + สลิปที่อ้างเช็คอิน 2 ใบ → ปิดงวดผ่าน RPC ────────────────
  INSERT INTO salary_runs(kind, period_key, period_start, period_end)
    VALUES ('weekly', 'ZZTEST-paidonce-a', '2026-08-31', '2026-09-06') RETURNING id INTO run_a;
  INSERT INTO salary_slips(run_id, user_id, lines, total)
    VALUES (run_a, u1, jsonb_build_array(
      jsonb_build_object('key', 'site:2026-09-02:a', 'kind', 'site', 'date', '2026-09-02',
                         'checkin_id', c1, 'label', 'ค่าสตาฟ', 'computed_amount', 700, 'amount', 700),
      jsonb_build_object('key', 'site:2026-09-03:a', 'kind', 'site', 'date', '2026-09-03',
                         'checkin_id', c2, 'label', 'ค่าสตาฟ', 'computed_amount', 700, 'amount', 700),
      jsonb_build_object('key', 'ot:2026-09-02', 'kind', 'ot', 'date', '2026-09-02',
                         'label', 'OT 1 ชม.', 'computed_amount', 100, 'amount', 100)
    ), 1500) RETURNING id INTO slip_a;

  PERFORM finalize_salary_slip(slip_a, u1);

  SELECT status INTO st FROM salary_slips WHERE id = slip_a;
  SELECT count(*) INTO n FROM staff_checkins WHERE id IN (c1, c2) AND paid_slip_id = slip_a;
  RAISE NOTICE 'B13 %: finalize ประทับ paid_slip_id ครบ (stamped=% status=%)',
    CASE WHEN n = 2 AND st = 'finalized' THEN 'ok' ELSE 'FAIL' END, n, st;

  -- ── งวดที่ทับกัน แล้วสลิปอ้างเช็คอินใบเดิม → ต้องถูกปฏิเสธ ───────────────
  INSERT INTO salary_runs(kind, period_key, period_start, period_end)
    VALUES ('custom', 'ZZTEST-paidonce-b', '2026-09-01', '2026-09-10') RETURNING id INTO run_b;
  INSERT INTO salary_slips(run_id, user_id, lines, total)
    VALUES (run_b, u1, jsonb_build_array(
      jsonb_build_object('key', 'site:2026-09-02:b', 'kind', 'site', 'date', '2026-09-02',
                         'checkin_id', c1, 'label', 'ค่าสตาฟ', 'computed_amount', 700, 'amount', 700)
    ), 700) RETURNING id INTO slip_b;

  BEGIN
    PERFORM finalize_salary_slip(slip_b, u1);
    RAISE NOTICE 'B12 FAIL: ปิดงวดสลิปที่มีเช็คอินถูกจ่ายไปแล้วได้';
  EXCEPTION WHEN raise_exception THEN RAISE NOTICE 'B12 ok blocked: %', SQLERRM; END;

  SELECT status INTO st FROM salary_slips WHERE id = slip_b;
  RAISE NOTICE 'B12b %: สลิปที่ถูกปฏิเสธยังเป็นร่าง (status=%)',
    CASE WHEN st = 'draft' THEN 'ok' ELSE 'FAIL' END, st;

  -- ── backfill: สลิปที่ปิดงวดไปก่อน migration (paid_slip_id ยังว่าง) ───────
  INSERT INTO salary_runs(kind, period_key, period_start, period_end)
    VALUES ('weekly', 'ZZTEST-paidonce-c', '2026-08-31', '2026-09-06') RETURNING id INTO run_c;
  INSERT INTO salary_slips(run_id, user_id, lines, total)
    VALUES (run_c, u1, jsonb_build_array(
      jsonb_build_object('key', 'site:2026-09-04:c', 'kind', 'site', 'date', '2026-09-04',
                         'checkin_id', c3, 'label', 'ค่าสตาฟ', 'computed_amount', 700, 'amount', 700)
    ), 700) RETURNING id INTO slip_c;
  -- ปิดงวดตรงๆ ไม่ผ่าน RPC = สภาพเดียวกับสลิปเก่าก่อน deploy
  UPDATE salary_slips SET status = 'finalized', finalized_at = now() WHERE id = slip_c;

  -- คำสั่งเดียวกับข้อ 5 ของ migration (ที่นี่จำกัดเฉพาะสลิปทดสอบ)
  UPDATE staff_checkins c
  SET paid_slip_id = s.id
  FROM salary_slips s
  CROSS JOIN LATERAL (
    SELECT (e ->> 'checkin_id')::UUID AS cid
    FROM jsonb_array_elements(COALESCE(s.lines, '[]'::JSONB)) e
    WHERE e ->> 'checkin_id' IS NOT NULL
  ) x
  WHERE s.status IN ('finalized', 'paid')
    AND s.id = slip_c
    AND c.id = x.cid
    AND c.paid_slip_id IS NULL;

  SELECT count(*) INTO n FROM staff_checkins WHERE id = c3 AND paid_slip_id = slip_c;
  RAISE NOTICE 'B14 %: backfill ประทับสลิปเก่าให้เช็คอินที่ยังว่าง (stamped=%)',
    CASE WHEN n = 1 THEN 'ok' ELSE 'FAIL' END, n;

  -- ── ล้างของทดสอบ ────────────────────────────────────────────────────────
  PERFORM purge_test_salary_run('ZZTEST-paidonce-a');
  PERFORM purge_test_salary_run('ZZTEST-paidonce-b');
  PERFORM purge_test_salary_run('ZZTEST-paidonce-c');
  DELETE FROM staff_checkins WHERE note = 'ZZTEST-paidonce';

  SELECT count(*) INTO n FROM salary_runs WHERE period_key LIKE 'ZZTEST-paidonce-%';
  RAISE NOTICE 'B14b %: ล้างงวด/เช็คอินทดสอบหมด (เหลือ %)',
    CASE WHEN n = 0 THEN 'ok' ELSE 'FAIL' END, n;
END $$;
