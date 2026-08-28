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

-- ============================================================================
-- B15–B16 — เช็คอินที่ไม่มีบรรทัดในสลิป (checkin_ids) + guard เช็คอินที่จ่ายแล้ว
-- เช็คอินทดสอบใช้ note ขึ้นต้น 'ZZTEST-guardpaid' แล้วล้างทิ้งตอนจบ
-- ============================================================================
DO $$
DECLARE
  u1 uuid; run_d uuid; slip_d uuid; c1 uuid; c2 uuid; n int; v text;
BEGIN
  SELECT id INTO u1 FROM profiles WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;
  IF u1 IS NULL THEN RAISE EXCEPTION 'ต้องมี profiles อย่างน้อย 1 คน'; END IF;

  -- เผื่อรอบก่อนค้าง (ลบงวดก่อน paid_slip_id จึงถูกล้างด้วย ON DELETE SET NULL)
  PERFORM purge_test_salary_run('ZZTEST-paidonce-d');
  PERFORM set_config('app.allow_salary_purge', 'on', true);
  DELETE FROM staff_checkins WHERE note LIKE 'ZZTEST-guardpaid%';
  PERFORM set_config('app.allow_salary_purge', 'off', true);

  INSERT INTO staff_checkins(user_id, check_type, checked_in_at, note)
    VALUES (u1, 'onsite', TIMESTAMPTZ '2026-09-08 10:00+07', 'ZZTEST-guardpaid') RETURNING id INTO c1;
  -- c2 = เช็คอินรันเนอร์/ยังไม่ระบุหน้าที่ → ไม่มีบรรทัดในสลิป มีแต่ใน checkin_ids
  INSERT INTO staff_checkins(user_id, check_type, checked_in_at, note)
    VALUES (u1, 'onsite', TIMESTAMPTZ '2026-09-09 10:00+07', 'ZZTEST-guardpaid') RETURNING id INTO c2;

  INSERT INTO salary_runs(kind, period_key, period_start, period_end)
    VALUES ('weekly', 'ZZTEST-paidonce-d', '2026-09-07', '2026-09-13') RETURNING id INTO run_d;
  INSERT INTO salary_slips(run_id, user_id, checkin_ids, lines, total)
    VALUES (run_d, u1, ARRAY[c1, c2], jsonb_build_array(
      jsonb_build_object('key', 'site:2026-09-08:d', 'kind', 'site', 'date', '2026-09-08',
                         'checkin_id', c1, 'label', 'ค่าสตาฟ', 'computed_amount', 700, 'amount', 700)
    ), 700) RETURNING id INTO slip_d;

  PERFORM finalize_salary_slip(slip_d, u1);

  SELECT count(*) INTO n FROM staff_checkins WHERE id IN (c1, c2) AND paid_slip_id = slip_d;
  RAISE NOTICE 'B15 %: เช็คอินใน checkin_ids ที่ไม่มีบรรทัดถูกประทับด้วย (stamped=%)',
    CASE WHEN n = 2 THEN 'ok' ELSE 'FAIL' END, n;

  -- ── guard: เช็คอินที่จ่ายแล้วแก้ตัวเลขไม่ได้ ลบไม่ได้ ────────────────────
  BEGIN
    UPDATE staff_checkins SET checked_in_at = checked_in_at + INTERVAL '1 hour' WHERE id = c1;
    RAISE NOTICE 'B16 FAIL: แก้เวลาเช็คอินที่จ่ายแล้วได้';
  EXCEPTION WHEN raise_exception THEN RAISE NOTICE 'B16 ok blocked: %', SQLERRM; END;

  BEGIN
    DELETE FROM staff_checkins WHERE id = c1;
    RAISE NOTICE 'B16b FAIL: ลบเช็คอินที่จ่ายแล้วได้';
  EXCEPTION WHEN raise_exception THEN RAISE NOTICE 'B16b ok blocked: %', SQLERRM; END;

  -- note/จังหวัด ฯลฯ ไม่กระทบยอด — ต้องยังแก้ได้
  UPDATE staff_checkins SET note = 'ZZTEST-guardpaid-edited' WHERE id = c1;
  SELECT note INTO v FROM staff_checkins WHERE id = c1;
  RAISE NOTICE 'B16c %: แก้ note ของเช็คอินที่จ่ายแล้วยังได้ (note=%)',
    CASE WHEN v = 'ZZTEST-guardpaid-edited' THEN 'ok' ELSE 'FAIL' END, v;

  -- GUC เดียวกับ guard สลิป → ข้ามได้ (ทางที่ purge_test_salary_run ใช้)
  PERFORM set_config('app.allow_salary_purge', 'on', true);
  UPDATE staff_checkins SET checked_out_at = TIMESTAMPTZ '2026-09-08 19:00+07' WHERE id = c1;
  PERFORM set_config('app.allow_salary_purge', 'off', true);
  SELECT count(*) INTO n FROM staff_checkins WHERE id = c1 AND checked_out_at IS NOT NULL;
  RAISE NOTICE 'B16d %: GUC app.allow_salary_purge=on ข้าม guard ได้ (updated=%)',
    CASE WHEN n = 1 THEN 'ok' ELSE 'FAIL' END, n;

  BEGIN
    UPDATE staff_checkins SET out_of_province = true WHERE id = c1;
    RAISE NOTICE 'B16e FAIL: guard ไม่กลับมาทำงานหลัง reset GUC';
  EXCEPTION WHEN raise_exception THEN RAISE NOTICE 'B16e ok blocked หลัง reset GUC: %', SQLERRM; END;

  -- ── ล้างของทดสอบ ────────────────────────────────────────────────────────
  PERFORM purge_test_salary_run('ZZTEST-paidonce-d');
  DELETE FROM staff_checkins WHERE note LIKE 'ZZTEST-guardpaid%';

  SELECT count(*) INTO n FROM salary_runs WHERE period_key = 'ZZTEST-paidonce-d';
  SELECT n + count(*) INTO n FROM staff_checkins WHERE note LIKE 'ZZTEST-guardpaid%';
  RAISE NOTICE 'B16f %: ล้างงวด/เช็คอินทดสอบหมด (เหลือ %)',
    CASE WHEN n = 0 THEN 'ok' ELSE 'FAIL' END, n;
END $$;

-- ============================================================================
-- B17 — backfill ครอบเช็คอินหน้างานที่ "ไม่มีบรรทัดในสลิป" ของงวดเก่า
-- (งวดเดือนเดิมจ่ายเช็คอินหน้างานทุกใบในช่วงงวด — รันเนอร์/ยังไม่ระบุหน้าที่ก็จ่ายไปแล้ว)
-- เรียก salary_backfill_paid_slip_ids() ตัวเดียวกับที่ migration ข้อ 5 เรียก
-- ============================================================================
DO $$
DECLARE
  u1 uuid; run_e uuid; slip_e uuid; c1 uuid; n int;
BEGIN
  SELECT id INTO u1 FROM profiles WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;
  IF u1 IS NULL THEN RAISE EXCEPTION 'ต้องมี profiles อย่างน้อย 1 คน'; END IF;

  -- เผื่อรอบก่อนค้าง
  PERFORM purge_test_salary_run('ZZTEST-backfill-e');
  PERFORM set_config('app.allow_salary_purge', 'on', true);
  DELETE FROM staff_checkins WHERE note LIKE 'ZZTEST-backfill%';
  PERFORM set_config('app.allow_salary_purge', 'off', true);

  -- เช็คอินหน้างานในช่วงงวด ที่ไม่มีบรรทัดไหนอ้างถึงเลย
  INSERT INTO staff_checkins(user_id, check_type, checked_in_at, note)
    VALUES (u1, 'onsite', TIMESTAMPTZ '2026-10-06 10:00+07', 'ZZTEST-backfill') RETURNING id INTO c1;

  INSERT INTO salary_runs(kind, period_key, period_start, period_end)
    VALUES ('monthly', 'ZZTEST-backfill-e', '2026-10-05', '2026-10-11') RETURNING id INTO run_e;
  -- สลิปเก่าก่อน deploy: lines ว่าง + checkin_ids ว่าง + ปิดงวดตรงๆ ไม่ผ่าน RPC
  INSERT INTO salary_slips(run_id, user_id, lines, checkin_ids, total)
    VALUES (run_e, u1, '[]'::jsonb, '{}'::uuid[], 0) RETURNING id INTO slip_e;
  UPDATE salary_slips SET status = 'finalized', finalized_at = now() WHERE id = slip_e;

  PERFORM salary_backfill_paid_slip_ids();

  SELECT count(*) INTO n FROM staff_checkins WHERE id = c1 AND paid_slip_id = slip_e;
  RAISE NOTICE 'B17 %: backfill ประทับเช็คอินหน้างานในช่วงงวดที่ไม่มีบรรทัด (stamped=%)',
    CASE WHEN n = 1 THEN 'ok' ELSE 'FAIL' END, n;

  PERFORM salary_backfill_paid_slip_ids();
  SELECT count(*) INTO n FROM staff_checkins WHERE id = c1 AND paid_slip_id = slip_e;
  RAISE NOTICE 'B17b %: รัน backfill ซ้ำไม่เปลี่ยนของเดิม (stamped=%)',
    CASE WHEN n = 1 THEN 'ok' ELSE 'FAIL' END, n;

  -- ── ล้างของทดสอบ ────────────────────────────────────────────────────────
  PERFORM purge_test_salary_run('ZZTEST-backfill-e');
  PERFORM set_config('app.allow_salary_purge', 'on', true);
  DELETE FROM staff_checkins WHERE note LIKE 'ZZTEST-backfill%';
  PERFORM set_config('app.allow_salary_purge', 'off', true);

  SELECT count(*) INTO n FROM salary_runs WHERE period_key = 'ZZTEST-backfill-e';
  SELECT n + count(*) INTO n FROM staff_checkins WHERE note LIKE 'ZZTEST-backfill%';
  RAISE NOTICE 'B17c %: ล้างงวด/เช็คอินทดสอบหมด (เหลือ %)',
    CASE WHEN n = 0 THEN 'ok' ELSE 'FAIL' END, n;
END $$;

-- ============================================================================
-- B18–B21 — เปิดแก้ไขสลิปหลังปิดงวด (supabase/migrations/20260830_salary_slip_reopen.sql)
-- เช็คอินทดสอบใช้ note ขึ้นต้น 'ZZTEST-reopen' แล้วล้างทิ้งตอนจบ
-- ============================================================================
DO $$
DECLARE
  u1 uuid; run_f uuid; run_g uuid; slip_f uuid; slip_g uuid; c1 uuid;
  n int; st text; h jsonb;
BEGIN
  SELECT id INTO u1 FROM profiles WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;
  IF u1 IS NULL THEN RAISE EXCEPTION 'ต้องมี profiles อย่างน้อย 1 คน'; END IF;

  -- เผื่อรอบก่อนค้าง
  PERFORM purge_test_salary_run('ZZTEST-reopen-f');
  PERFORM purge_test_salary_run('ZZTEST-reopen-g');
  PERFORM set_config('app.allow_salary_purge', 'on', true);
  DELETE FROM staff_checkins WHERE note LIKE 'ZZTEST-reopen%';
  PERFORM set_config('app.allow_salary_purge', 'off', true);

  INSERT INTO staff_checkins(user_id, check_type, checked_in_at, note)
    VALUES (u1, 'onsite', TIMESTAMPTZ '2026-11-03 10:00+07', 'ZZTEST-reopen') RETURNING id INTO c1;

  INSERT INTO salary_runs(kind, period_key, period_start, period_end)
    VALUES ('weekly', 'ZZTEST-reopen-f', '2026-11-02', '2026-11-08') RETURNING id INTO run_f;
  INSERT INTO salary_slips(run_id, user_id, checkin_ids, lines, total)
    VALUES (run_f, u1, ARRAY[c1], jsonb_build_array(
      jsonb_build_object('key', 'site:2026-11-03:f', 'kind', 'site', 'date', '2026-11-03',
                         'checkin_id', c1, 'label', 'ค่าสตาฟ', 'computed_amount', 700, 'amount', 700)
    ), 700) RETURNING id INTO slip_f;

  PERFORM finalize_salary_slip(slip_f, u1);

  -- ── B18: เปิดแก้สลิปที่ปิดงวดแล้ว → draft + ปลดประทับ + ประวัติ 1 รายการ ──
  PERFORM reopen_salary_slip(slip_f, u1, 'แอดมินทดสอบ', 'แก้เวลาเข้าออกของวันที่ 3 ที่กรอกผิด');

  SELECT status, reopen_history INTO st, h FROM salary_slips WHERE id = slip_f;
  SELECT count(*) INTO n FROM staff_checkins WHERE id = c1 AND paid_slip_id IS NULL;
  RAISE NOTICE 'B18 %: reopen finalized → draft + ปลดประทับ + history 1 (status=% unstamped=% len=% was_paid=% total_before=%)',
    CASE WHEN st = 'draft' AND n = 1
              AND jsonb_array_length(h) = 1
              AND (h -> 0 ->> 'was_paid') = 'false'
              AND (h -> 0 ->> 'total_before')::numeric = 700
              AND (h -> 0 ->> 'total_after') IS NULL
              AND (h -> 0 ->> 'refinalized_at') IS NULL
              AND (h -> 0 ->> 'reason') = 'แก้เวลาเข้าออกของวันที่ 3 ที่กรอกผิด'
         THEN 'ok' ELSE 'FAIL' END,
    st, n, jsonb_array_length(h), h -> 0 ->> 'was_paid', h -> 0 ->> 'total_before';

  SELECT count(*) INTO n FROM salary_slips
   WHERE id = slip_f AND finalized_at IS NULL AND finalized_by IS NULL;
  RAISE NOTICE 'B18b %: finalized_at/finalized_by ถูกล้าง (%)',
    CASE WHEN n = 1 THEN 'ok' ELSE 'FAIL' END, n;

  -- ── B19: เหตุผลสั้นกว่า 10 ตัวอักษร → RAISE ────────────────────────────
  -- ปิดงวดใหม่ผ่าน RPC ก่อน — ประวัติรายการแรกจึงถูกปิดท้าย (total_after = 700)
  PERFORM finalize_salary_slip(slip_f, u1);
  BEGIN
    PERFORM reopen_salary_slip(slip_f, u1, 'แอดมินทดสอบ', 'สั้นไป');
    RAISE NOTICE 'B19 FAIL: เปิดแก้ด้วยเหตุผลสั้นกว่า 10 ตัวอักษรได้';
  EXCEPTION WHEN raise_exception THEN RAISE NOTICE 'B19 ok blocked: %', SQLERRM; END;

  SELECT status INTO st FROM salary_slips WHERE id = slip_f;
  RAISE NOTICE 'B19b %: สลิปยังปิดงวดอยู่หลังถูกปฏิเสธ (status=%)',
    CASE WHEN st = 'finalized' THEN 'ok' ELSE 'FAIL' END, st;

  -- ── B20: ปิดงวดใหม่ → ประทับกลับ + total_after/refinalized_at ถูกเติม ──
  PERFORM reopen_salary_slip(slip_f, u1, 'แอดมินทดสอบ', 'ปรับยอดใหม่ตามใบเสร็จที่เพิ่งได้มา');
  UPDATE salary_slips SET total = 900 WHERE id = slip_f;   -- สลิปเป็นร่างแล้ว แก้ยอดได้
  PERFORM finalize_salary_slip(slip_f, u1);

  SELECT status, reopen_history INTO st, h FROM salary_slips WHERE id = slip_f;
  SELECT count(*) INTO n FROM staff_checkins WHERE id = c1 AND paid_slip_id = slip_f;
  RAISE NOTICE 'B20 %: ปิดงวดใหม่ → ประทับกลับ + ปิดท้ายประวัติ (status=% stamped=% len=% total_after=% refinalized=%)',
    CASE WHEN st = 'finalized' AND n = 1
              AND jsonb_array_length(h) = 2
              AND (h -> 1 ->> 'total_after')::numeric = 900
              AND (h -> 1 ->> 'refinalized_at') IS NOT NULL
              -- รายการแรกถูกปิดท้ายไปแล้วตอนปิดงวดครั้งก่อน ต้องไม่ถูกเขียนทับ
              AND (h -> 0 ->> 'total_after')::numeric = 700
         THEN 'ok' ELSE 'FAIL' END,
    st, n, jsonb_array_length(h), h -> 1 ->> 'total_after', h -> 1 ->> 'refinalized_at';

  -- ── B21: สลิปร่างธรรมดา เปิดแก้ไม่ได้ ──────────────────────────────────
  INSERT INTO salary_runs(kind, period_key, period_start, period_end)
    VALUES ('weekly', 'ZZTEST-reopen-g', '2026-11-09', '2026-11-15') RETURNING id INTO run_g;
  INSERT INTO salary_slips(run_id, user_id, total) VALUES (run_g, u1, 0) RETURNING id INTO slip_g;

  BEGIN
    PERFORM reopen_salary_slip(slip_g, u1, 'แอดมินทดสอบ', 'ลองเปิดแก้สลิปที่ยังเป็นร่างอยู่');
    RAISE NOTICE 'B21 FAIL: เปิดแก้สลิปร่างได้';
  EXCEPTION WHEN raise_exception THEN RAISE NOTICE 'B21 ok blocked: %', SQLERRM; END;

  -- ── B21b: guard ยังห้ามแก้ accepted_warnings/reopen_history หลังปิดงวด ──
  BEGIN
    UPDATE salary_slips SET accepted_warnings = '[{"key":"hack"}]'::jsonb WHERE id = slip_f;
    RAISE NOTICE 'B21b FAIL: แก้ accepted_warnings ของสลิปที่ปิดงวดได้';
  EXCEPTION WHEN raise_exception THEN RAISE NOTICE 'B21b ok blocked: %', SQLERRM; END;

  -- paid_total/paid_history ต้องเปลี่ยนได้ตอน finalized → paid
  UPDATE salary_slips
  SET status = 'paid', paid_at = now(), paid_by = u1, paid_total = 900,
      paid_history = jsonb_build_array(jsonb_build_object('at', now(), 'by', u1, 'total', 900))
  WHERE id = slip_f;
  SELECT count(*) INTO n FROM salary_slips
   WHERE id = slip_f AND status = 'paid' AND paid_total = 900 AND jsonb_array_length(paid_history) = 1;
  RAISE NOTICE 'B21c %: paid_total/paid_history เขียนได้ตอนกด "จ่ายแล้ว" (%)',
    CASE WHEN n = 1 THEN 'ok' ELSE 'FAIL' END, n;

  -- ── ล้างของทดสอบ ────────────────────────────────────────────────────────
  PERFORM purge_test_salary_run('ZZTEST-reopen-f');
  PERFORM purge_test_salary_run('ZZTEST-reopen-g');
  PERFORM set_config('app.allow_salary_purge', 'on', true);
  DELETE FROM staff_checkins WHERE note LIKE 'ZZTEST-reopen%';
  PERFORM set_config('app.allow_salary_purge', 'off', true);

  SELECT count(*) INTO n FROM salary_runs WHERE period_key LIKE 'ZZTEST-reopen-%';
  SELECT n + count(*) INTO n FROM staff_checkins WHERE note LIKE 'ZZTEST-reopen%';
  RAISE NOTICE 'B21d %: ล้างงวด/เช็คอินทดสอบหมด (เหลือ %)',
    CASE WHEN n = 0 THEN 'ok' ELSE 'FAIL' END, n;
END $$;
