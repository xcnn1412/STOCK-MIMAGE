-- ============================================================================
-- โมดูล "เงินเดือน" — ยอมรับคำเตือน + เปิดแก้ไขสลิปหลังปิดงวด + ประวัติการจ่าย
-- spec: docs/specs/salary-slip-daily-ui.md §Implementation Decisions · issue #26 (ticket #27)
-- ต่อจาก 20260829_salary_weekly_runs.sql — ไฟล์นี้ idempotent รันซ้ำได้
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. คอลัมน์ใหม่ของ salary_slips
--    accepted_warnings — คำเตือนที่ admin กด "ยอมรับ" แล้ว (ไม่นับเป็นงานค้าง)
--                        [{key, by, at}] · key = '<code>:<date>:<checkin_id|>'
--    reopen_history    — ประวัติการเปิดแก้ไขหลังปิดงวด
--                        [{at, by, by_name, reason, total_before, total_after, refinalized_at, was_paid}]
--    paid_history      — ประวัติการกด "จ่ายแล้ว" ทุกครั้ง [{at, by, total}]
--    paid_total        — ยอดที่จ่ายไปครั้งล่าสุด (เทียบกับ total เพื่อหาส่วนต่างหลังเปิดแก้)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE salary_slips ADD COLUMN IF NOT EXISTS accepted_warnings JSONB NOT NULL DEFAULT '[]'::JSONB;
ALTER TABLE salary_slips ADD COLUMN IF NOT EXISTS reopen_history   JSONB NOT NULL DEFAULT '[]'::JSONB;
ALTER TABLE salary_slips ADD COLUMN IF NOT EXISTS paid_history     JSONB NOT NULL DEFAULT '[]'::JSONB;
ALTER TABLE salary_slips ADD COLUMN IF NOT EXISTS paid_total       NUMERIC;

COMMENT ON COLUMN salary_slips.accepted_warnings IS
  'คำเตือนที่ admin ยอมรับแล้ว [{key, by, at}] — key = <code>:<date>:<checkin_id|> · ยอมรับแล้วไม่บล็อกการปิดงวด';
COMMENT ON COLUMN salary_slips.reopen_history IS
  'ประวัติการเปิดแก้ไขหลังปิดงวด [{at, by, by_name, reason, total_before, total_after, refinalized_at, was_paid}] — เขียนโดย reopen_salary_slip() / finalize_salary_slip()';
COMMENT ON COLUMN salary_slips.paid_history IS
  'ประวัติการกด "จ่ายแล้ว" ทุกครั้ง [{at, by, total}] — สลิปที่เปิดแก้แล้วจ่ายใหม่จะมีหลายรายการ';
COMMENT ON COLUMN salary_slips.paid_total IS
  'ยอดที่จ่ายไปครั้งล่าสุด (NULL = ยังไม่เคยจ่าย) — ต่างจาก total เมื่อสลิปถูกเปิดแก้หลังจ่ายไปแล้ว';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Guard ของสลิป — เพิ่ม accepted_warnings/reopen_history เข้าคอลัมน์ที่ห้ามเปลี่ยนหลังปิด
--    (ฟังก์ชันเดิมอยู่ใน 20260829_salary_weekly_runs.sql §3c ซึ่งรันบน prod ไปแล้ว
--     จึงต้อง CREATE OR REPLACE ทั้งตัวที่นี่ — เนื้อในเหมือนเดิมทุกบรรทัด
--     ยกเว้นสองบรรทัดที่เพิ่มเข้ามา)
--
--    ที่ยังเปลี่ยนได้หลังปิดงวดโดยตั้งใจ: status (finalized→paid), paid_at, paid_by,
--    paid_total, paid_history (เขียนตอนกด "จ่ายแล้ว"), costs_synced_at, updated_at
--    reopen_history เปลี่ยนได้เฉพาะทาง GUC app.allow_salary_purge='on' ที่ RPC ตั้งให้
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

    -- อนุญาตเฉพาะ: status, paid_at, paid_by, paid_total, paid_history, costs_synced_at, updated_at
    IF NEW.id                IS DISTINCT FROM OLD.id
    OR NEW.run_id            IS DISTINCT FROM OLD.run_id
    OR NEW.user_id           IS DISTINCT FROM OLD.user_id
    OR NEW.employment_type   IS DISTINCT FROM OLD.employment_type
    OR NEW.base_salary       IS DISTINCT FROM OLD.base_salary
    OR NEW.lines             IS DISTINCT FROM OLD.lines
    OR NEW.checkin_ids       IS DISTINCT FROM OLD.checkin_ids
    OR NEW.adjustments       IS DISTINCT FROM OLD.adjustments
    OR NEW.warnings          IS DISTINCT FROM OLD.warnings
    OR NEW.accepted_warnings IS DISTINCT FROM OLD.accepted_warnings
    OR NEW.reopen_history    IS DISTINCT FROM OLD.reopen_history
    OR NEW.total             IS DISTINCT FROM OLD.total
    OR NEW.computed_at       IS DISTINCT FROM OLD.computed_at
    OR NEW.finalized_at      IS DISTINCT FROM OLD.finalized_at
    OR NEW.finalized_by      IS DISTINCT FROM OLD.finalized_by
    OR NEW.created_at        IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'ห้ามแก้ไขสลิปที่ปิดงวดแล้ว';
    END IF;
  END IF;

  RETURN NEW;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. reopen_salary_slip — เปิดสลิปที่ปิดงวด/จ่ายแล้วกลับมาเป็นร่างทั้งใบ
--
--    ทำสามอย่างใน transaction เดียว (ล็อกสลิปก่อนเพื่อกันกดพร้อมกันสองหน้าต่าง):
--      1. ปลดประทับเช็คอินของสลิปนี้ (paid_slip_id = NULL) — ไม่งั้นคำนวณใหม่จะไม่เห็น
--      2. สลิปกลับเป็น draft + ล้าง finalized_at/finalized_by
--      3. เติมประวัติ 1 รายการ (ยอดหลัง/เวลาปิดงวดใหม่ ถูกเติมโดย finalize_salary_slip)
--
--    คง paid_at/paid_by/paid_total/paid_history ไว้เป็นประวัติ — หัวสลิปใช้แสดง
--    "จ่ายไปแล้ว X · ยอดใหม่ Y · ส่วนต่าง ±Z"
--
--    GUC app.allow_salary_purge ตั้งแบบ transaction-local (is_local = true) ทั้งสอง
--    guard (สลิป + เช็คอิน) จึงยอมให้ย้อนสถานะ/ปลดประทับ แล้วกลับมาเข้มเองเมื่อจบ tx
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reopen_salary_slip(
  p_slip_id   UUID,
  p_user_id   UUID,
  p_user_name TEXT,
  p_reason    TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status FROM salary_slips WHERE id = p_slip_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบสลิป';
  END IF;
  IF v_status NOT IN ('finalized', 'paid') THEN
    RAISE EXCEPTION 'สลิปนี้ยังเป็นร่าง';
  END IF;
  IF length(btrim(COALESCE(p_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'เหตุผลต้องยาวอย่างน้อย 10 ตัวอักษร';
  END IF;

  PERFORM set_config('app.allow_salary_purge', 'on', true);

  UPDATE staff_checkins SET paid_slip_id = NULL WHERE paid_slip_id = p_slip_id;

  UPDATE salary_slips
  SET status        = 'draft',
      finalized_at  = NULL,
      finalized_by  = NULL,
      updated_at    = now(),
      -- ฝั่งขวาของ SET อ่านค่า "ก่อนแก้" เสมอ → total/status ที่นี่คือของเดิม
      reopen_history = reopen_history || jsonb_build_object(
        'at',             now(),
        'by',             p_user_id,
        'by_name',        p_user_name,
        'reason',         btrim(p_reason),
        'total_before',   total,
        'total_after',    NULL,
        'refinalized_at', NULL,
        'was_paid',       status = 'paid'
      )
  WHERE id = p_slip_id;

  -- ปิด GUC ทันทีที่ใช้เสร็จ — is_local อยู่ยาวถึงจบ transaction ถ้าไม่รีเซ็ต
  -- (ผ่าน PostgREST ก็จบใน request เดียวอยู่แล้ว แต่ผู้เรียกใน DO block/สคริปต์
  --  จะได้ไม่เผลอแก้สลิปที่ปิดงวดอื่นทะลุ guard ต่อในคำสั่งถัดไป)
  PERFORM set_config('app.allow_salary_purge', 'off', true);
END $$;

REVOKE ALL ON FUNCTION public.reopen_salary_slip(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reopen_salary_slip(UUID, UUID, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.reopen_salary_slip(UUID, UUID, TEXT, TEXT) IS
  'เปิดสลิปที่ปิดงวด/จ่ายแล้วกลับเป็นร่าง + ปลดประทับ paid_slip_id + บันทึกประวัติการเปิดแก้ (เหตุผล ≥ 10 ตัวอักษร)';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. finalize_salary_slip — เนื้อในเดิมทุกบรรทัด + ปิดท้ายประวัติการเปิดแก้
--    (รายการล่าสุดที่ refinalized_at ยังว่าง = การเปิดแก้ครั้งนี้ → เติมยอดหลัง + เวลา)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.finalize_salary_slip(p_slip_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status   TEXT;
  v_lines    JSONB;
  v_ids      UUID[];
  v_line_ids UUID[];
  v_date     TEXT;
  v_hist     JSONB;
  v_total    NUMERIC;
  v_last     INT;
BEGIN
  SELECT status, lines, COALESCE(checkin_ids, '{}'::UUID[]), COALESCE(reopen_history, '[]'::JSONB), total
    INTO v_status, v_lines, v_ids, v_hist, v_total
  FROM salary_slips WHERE id = p_slip_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบสลิป';
  END IF;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'สลิปนี้ปิดงวดแล้ว';
  END IF;

  -- เช็คอินที่สลิปนี้จ่ายให้ = checkin_ids ที่บันทึกไว้ตอนคำนวณ ∪ checkin_id ในบรรทัด
  -- (union เพราะสลิปร่างที่คำนวณไว้ก่อนมีคอลัมน์ checkin_ids ยังมีแต่บรรทัด)
  SELECT COALESCE(array_agg(DISTINCT x.cid), '{}'::UUID[]) INTO v_line_ids
  FROM (
    SELECT (e ->> 'checkin_id')::UUID AS cid
    FROM jsonb_array_elements(COALESCE(v_lines, '[]'::JSONB)) e
    WHERE e ->> 'checkin_id' IS NOT NULL
  ) x;

  v_ids := ARRAY(SELECT DISTINCT u FROM unnest(v_ids || v_line_ids) u WHERE u IS NOT NULL);

  IF COALESCE(array_length(v_ids, 1), 0) > 0 THEN
    -- ล็อกเรียงตาม id — สองงวดที่ปิดพร้อมกันจะเข้าคิวกัน ไม่ deadlock
    PERFORM 1 FROM staff_checkins WHERE id = ANY(v_ids) ORDER BY id FOR UPDATE;

    SELECT to_char(checked_in_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') INTO v_date
    FROM staff_checkins
    WHERE id = ANY(v_ids)
      AND paid_slip_id IS NOT NULL
      AND paid_slip_id <> p_slip_id
    ORDER BY checked_in_at
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'เช็คอินวันที่ % ถูกจ่ายในสลิปอื่นแล้ว — กดคำนวณใหม่', v_date;
    END IF;

    UPDATE staff_checkins SET paid_slip_id = p_slip_id WHERE id = ANY(v_ids);
  END IF;

  -- ปิดท้ายประวัติการเปิดแก้ครั้งล่าสุด (ถ้าสลิปใบนี้เคยถูกเปิดแก้)
  v_last := jsonb_array_length(v_hist) - 1;
  IF v_last >= 0 AND (v_hist -> v_last ->> 'refinalized_at') IS NULL THEN
    v_hist := jsonb_set(
      v_hist,
      ARRAY[v_last::TEXT],
      (v_hist -> v_last) || jsonb_build_object('total_after', v_total, 'refinalized_at', now())
    );
  END IF;

  UPDATE salary_slips
  SET status = 'finalized', finalized_at = now(), finalized_by = p_user_id,
      reopen_history = v_hist, updated_at = now()
  WHERE id = p_slip_id;
END $$;

REVOKE ALL ON FUNCTION public.finalize_salary_slip(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_salary_slip(UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.finalize_salary_slip(UUID, UUID) IS
  'ปิดงวดสลิปร่าง + ประทับ paid_slip_id ให้เช็คอินใน checkin_ids รวมกับที่อยู่ในบรรทัด + ปิดท้ายประวัติการเปิดแก้ล่าสุด — ถ้าเช็คอินถูกจ่ายในสลิปอื่นแล้วจะ RAISE';
