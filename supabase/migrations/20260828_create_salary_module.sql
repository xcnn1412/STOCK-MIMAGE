-- ============================================================================
-- โมดูล "เงินเดือน" (Salary) — schema + rate card + งวด/สลิป + guard triggers
-- spec: docs/specs/salary-module.md · issue #11
-- ไฟล์นี้ idempotent — รันซ้ำได้
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. staff_checkins — ข้อมูลต้นทางที่ใช้คิดค่าแรง
--    duties = รหัสหน้าที่หน้างาน (อ้าง salary_duties.code), ตจว. + จังหวัด/เขต
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE staff_checkins ADD COLUMN IF NOT EXISTS duties          TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE staff_checkins ADD COLUMN IF NOT EXISTS out_of_province BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE staff_checkins ADD COLUMN IF NOT EXISTS province        TEXT;
ALTER TABLE staff_checkins ADD COLUMN IF NOT EXISTS district        TEXT;

COMMENT ON COLUMN staff_checkins.duties IS
  'รหัสหน้าที่หน้างานที่ทำในเที่ยวนี้ (อ้าง salary_duties.code) — code ห้ามเปลี่ยนหลัง deploy';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. salary_duties — rate card หน้าที่หน้างาน
--    pay_mode = 'per_checkin' คิดต่อครั้ง / 'manual_daily' admin กรอกเองรายวัน
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS salary_duties (
  code       TEXT        PRIMARY KEY,
  name_th    TEXT        NOT NULL,
  rate       NUMERIC     NOT NULL DEFAULT 0,
  pay_mode   TEXT        NOT NULL DEFAULT 'per_checkin' CHECK (pay_mode IN ('per_checkin', 'manual_daily')),
  is_active  BOOLEAN     NOT NULL DEFAULT true,
  sort_order INT         NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- rate card เริ่มต้นตามชีตเดิม — admin แก้อัตรา/เพิ่มหน้าที่เองได้ในหน้าตั้งค่า
INSERT INTO salary_duties (code, name_th, rate, pay_mode, sort_order) VALUES
  ('onsite_staff',  'ออกงานสตาฟ',    700, 'per_checkin',  1),
  ('deliver_booth', 'ส่งโฟโต้บูธ',    150, 'per_checkin',  2),
  ('collect_booth', 'เก็บโฟโต้บูธ',   150, 'per_checkin',  3),
  ('drive_booth',   'ขับรถออกบูธ',    300, 'per_checkin',  4),
  ('runner',        'รันเนอร์',         0, 'manual_daily', 5)
ON CONFLICT (code) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. salary_profiles — ตั้งค่าเงินเดือนต่อคน
--    แยกจาก profiles เพราะ /users ทำ select('*') ส่งทั้งแถวลง client
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS salary_profiles (
  user_id         UUID        PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  employment_type TEXT        NOT NULL DEFAULT 'fulltime' CHECK (employment_type IN ('fulltime', 'freelance')),
  base_salary     NUMERIC     NOT NULL DEFAULT 0,
  work_start      TIME        NOT NULL DEFAULT '10:00',
  work_end        TIME        NOT NULL DEFAULT '19:00',
  ot_rate         NUMERIC     NOT NULL DEFAULT 0,
  position        TEXT,
  start_date      DATE,
  updated_at      TIMESTAMPTZ DEFAULT now(),
  updated_by      UUID        REFERENCES profiles(id) ON DELETE SET NULL
);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. salary_runs — งวดคำนวณ (งวดละ 1 แถว, เพิ่มคนเข้างวดได้เรื่อยๆ)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS salary_runs (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  period_key   TEXT        NOT NULL UNIQUE,   -- 'YYYY-MM' ของเดือนที่งวดใช้ชื่อ
  period_start DATE        NOT NULL,
  period_end   DATE        NOT NULL,
  note         TEXT,
  created_by   UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 5. salary_slips — สลิปต่อคนต่องวด (บรรทัดเก็บเป็น JSONB — อ่านทั้งก้อนเสมอ)
--    lines[]       = { key, kind, date, checkin_id?, duty?, label, hours?, computed_amount, amount, override_note? }
--    adjustments[] = { id, label, amount }  (± ได้)
--    warnings[]    = { code, date, checkin_id?, message }
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS salary_slips (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id          UUID        NOT NULL REFERENCES salary_runs(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status          TEXT        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized', 'paid')),
  employment_type TEXT        NOT NULL DEFAULT 'fulltime',  -- snapshot ณ เวลาคำนวณ
  base_salary     NUMERIC     NOT NULL DEFAULT 0,           -- snapshot ณ เวลาคำนวณ
  lines           JSONB       NOT NULL DEFAULT '[]',
  adjustments     JSONB       NOT NULL DEFAULT '[]',
  warnings        JSONB       NOT NULL DEFAULT '[]',
  total           NUMERIC     NOT NULL DEFAULT 0,
  computed_at     TIMESTAMPTZ,
  finalized_at    TIMESTAMPTZ,
  finalized_by    UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  paid_at         TIMESTAMPTZ,
  paid_by         UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (run_id, user_id)   -- กันจ่ายซ้ำในงวดเดียวกัน
);

CREATE INDEX IF NOT EXISTS idx_salary_slips_user_id ON salary_slips(user_id);
CREATE INDEX IF NOT EXISTS idx_salary_slips_run_id  ON salary_slips(run_id);
CREATE INDEX IF NOT EXISTS idx_salary_slips_status  ON salary_slips(status);

-- ────────────────────────────────────────────────────────────────────────────
-- 6. updated_at triggers — ใช้ public.set_updated_at() ร่วมกับ leave_requests
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS salary_duties_set_updated_at ON public.salary_duties;
CREATE TRIGGER salary_duties_set_updated_at
  BEFORE UPDATE ON public.salary_duties
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS salary_profiles_set_updated_at ON public.salary_profiles;
CREATE TRIGGER salary_profiles_set_updated_at
  BEFORE UPDATE ON public.salary_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS salary_slips_set_updated_at ON public.salary_slips;
CREATE TRIGGER salary_slips_set_updated_at
  BEFORE UPDATE ON public.salary_slips
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- 7. Guard — สลิปที่ปิดงวดแล้วแก้ตัวเลขไม่ได้ ลบไม่ได้ (แม้ service role)
--    finalized/paid: เปลี่ยนได้เฉพาะ status (finalized → paid), paid_at, paid_by, updated_at
--    ห้ามถอยสถานะ: paid → finalized/draft, finalized → draft
--    ยกเว้นเมื่อ GUC app.allow_salary_purge = 'on' (ใช้โดย purge_test_salary_run)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.salary_slips_guard_finalized()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(current_setting('app.allow_salary_purge', true), '') = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'ห้ามลบสลิปที่ปิดงวดแล้ว';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status IN ('finalized', 'paid') THEN
    -- ห้ามถอยสถานะ; finalized ไปได้แค่ paid, paid ไปไหนไม่ได้
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status = 'finalized' AND NEW.status = 'paid') THEN
      RAISE EXCEPTION 'ห้ามแก้ไขสลิปที่ปิดงวดแล้ว';
    END IF;

    -- อนุญาตเฉพาะ: status, paid_at, paid_by, updated_at
    IF NEW.id              IS DISTINCT FROM OLD.id
    OR NEW.run_id          IS DISTINCT FROM OLD.run_id
    OR NEW.user_id         IS DISTINCT FROM OLD.user_id
    OR NEW.employment_type IS DISTINCT FROM OLD.employment_type
    OR NEW.base_salary     IS DISTINCT FROM OLD.base_salary
    OR NEW.lines           IS DISTINCT FROM OLD.lines
    OR NEW.adjustments     IS DISTINCT FROM OLD.adjustments
    OR NEW.warnings        IS DISTINCT FROM OLD.warnings
    OR NEW.total           IS DISTINCT FROM OLD.total
    OR NEW.computed_at     IS DISTINCT FROM OLD.computed_at
    OR NEW.finalized_at    IS DISTINCT FROM OLD.finalized_at
    OR NEW.finalized_by    IS DISTINCT FROM OLD.finalized_by
    OR NEW.created_at      IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'ห้ามแก้ไขสลิปที่ปิดงวดแล้ว';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_salary_slips_guard ON salary_slips;
CREATE TRIGGER trg_salary_slips_guard
  BEFORE UPDATE OR DELETE ON salary_slips
  FOR EACH ROW EXECUTE FUNCTION public.salary_slips_guard_finalized();

-- ────────────────────────────────────────────────────────────────────────────
-- 8. purge_test_salary_run — ทางออกเดียวที่ลบงวด/สลิปที่ปิดงวดแล้วได้
--    ใช้กับงวดทดสอบ period_key ขึ้นต้น 'ZZTEST-' เท่านั้น (scripts/salary-check.ts)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.purge_test_salary_run(p_period_key TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_period_key IS NULL OR p_period_key NOT LIKE 'ZZTEST-%' THEN
    RAISE EXCEPTION 'purge_test_salary_run ใช้ได้เฉพาะงวดทดสอบ (period_key ขึ้นต้นด้วย ZZTEST-) เท่านั้น';
  END IF;

  PERFORM set_config('app.allow_salary_purge', 'on', true);

  -- ON DELETE CASCADE ของ salary_slips.run_id ลบสลิปให้เอง (guard ถูกข้ามด้วย GUC)
  DELETE FROM salary_runs WHERE period_key = p_period_key;

  PERFORM set_config('app.allow_salary_purge', 'off', true);
END $$;

GRANT EXECUTE ON FUNCTION public.purge_test_salary_run(TEXT) TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 9. ค่าตั้งค่าระบบ — ใช้ app_settings เดิม (key-value) ไม่สร้างตารางใหม่
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO app_settings (key, value) VALUES
  ('salary_cutoff_day',             '25'),
  ('salary_out_of_province_rate',   '300')
ON CONFLICT (key) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 10. ปิดใบเบิกค่าสตาฟอัตโนมัติจากเช็คอิน — โมดูลเงินเดือนคิดค่าสตาฟที่เดียว
--     (ADR-0001) · guard IF EXISTS เผื่อ local stack ที่ยังไม่มีตารางนี้
-- ────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.finance_auto_calc_settings') IS NOT NULL THEN
    UPDATE public.finance_auto_calc_settings
    SET value = 'false', updated_at = now()
    WHERE key = 'auto_calc_enabled';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 11. RLS
--     salary_duties / salary_runs — permissive ตาม pattern repo (documents)
--     salary_profiles / salary_slips — เปิด RLS แต่ "ไม่มี policy" เลย:
--       ข้อมูลเงินต้องไม่รั่วผ่าน anon key; อ่าน/เขียนผ่าน service role เท่านั้น
--       สิทธิ์จริงบังคับใน server actions + guard trigger
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['salary_duties', 'salary_profiles', 'salary_runs', 'salary_slips']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['salary_duties', 'salary_runs']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_all') THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        t || '_all', t);
    END IF;
  END LOOP;
END $$;

COMMENT ON TABLE salary_duties   IS 'rate card หน้าที่หน้างาน — code ห้ามเปลี่ยนหลัง deploy (ถูกอ้างใน staff_checkins.duties และ snapshot ในสลิป)';
COMMENT ON TABLE salary_profiles IS 'ตั้งค่าเงินเดือนต่อคน (ประเภทการจ้าง/ฐาน/เวลาทำงาน/อัตรา OT)';
COMMENT ON TABLE salary_runs     IS 'งวดคำนวณเงินเดือน — 1 แถวต่องวด';
COMMENT ON TABLE salary_slips    IS 'สลิปเงินเดือนต่อคนต่องวด — ปิดงวดแล้วแก้/ลบไม่ได้ (guard trigger)';
