-- ============================================================================
-- ลบงวดเงินเดือนทุกงวด ให้เหลือเฉพาะงวดเดือน 2026-09 (26 ส.ค. – 25 ก.ย. 2569)
-- คำสั่งเจ้าของ 2026-09-29 — สคริปต์ใช้ครั้งเดียว รันใน Supabase SQL Editor
--
-- สถานะตอนเขียน (2026-09-29):
--   monthly 2026-08                 สลิป 10 (ร่าง 4 · ปิดงวด 3 = 9,300 · จ่ายแล้ว 3 = 31,900)
--   monthly 2026-09                 สลิป 14 (ร่างทั้งหมด)   ← เก็บ
--   custom  2026-08-26_2026-09-25   สลิป 12 (ร่างทั้งหมด)   ← ลบไปแล้ว 2026-09-29
--   weekly  2026-09-21_2026-09-27   สลิป 20 (ร่างทั้งหมด)   ← ลบไปแล้ว 2026-09-29
--   เหลือให้สคริปต์นี้ทำ: งวดเดือน 2026-08 (เจ้าของเลือก "ลบทั้งงวด รวมใบที่จ่ายแล้ว")
--   ผลทดลองที่ควรเห็น: งวด 2 → 1 · สลิป 24 → 14 · เช็คอินที่ประทับว่าจ่ายแล้ว 5 → 0
--                      · แถวต้นทุนจากสลิป 1 → 0
--
-- วิธีใช้:
--   1. รันทั้งไฟล์ตามที่เป็น (v_dry_run = true) — จะขึ้น ERROR "ทดลองเท่านั้น …"
--      พร้อมจำนวนที่จะถูกลบ ยังไม่มีอะไรถูกลบ
--   2. ตัวเลขถูกต้องแล้ว เปลี่ยน v_dry_run เป็น false แล้วรันอีกครั้ง
--      ตารางผลลัพธ์ท้ายไฟล์ = งวดที่เหลืออยู่
--
-- v_august — งวดเดือน 2026-08 มีสลิปที่ปิดงวด/จ่ายแล้ว ต้องเลือกเอง:
--   'keep'   ไม่แตะงวดสิงหาคม
--   'drafts' ลบเฉพาะสลิปร่างของงวดสิงหาคม เก็บใบที่ปิดงวด/จ่ายแล้ว
--   'all'    ลบทั้งงวด รวมสลิปที่ปิดงวด/จ่ายแล้ว + แถวต้นทุนที่สลิปเหล่านั้นส่งเข้าเมนูต้นทุน
--            เช็คอินที่เคยประทับว่า "จ่ายแล้ว" จะกลับเป็นยังไม่จ่าย — ย้อนกลับไม่ได้
-- ============================================================================

DO $$
DECLARE
  -- ── ปรับ 2 ค่านี้ก่อนรัน ────────────────────────────────────────────────
  v_dry_run BOOLEAN := true;     -- true = ทดลอง ไม่ลบจริง · false = ลบจริง
  v_august  TEXT    := 'all';    -- 'keep' | 'drafts' | 'all'
  -- ────────────────────────────────────────────────────────────────────────
  v_keep_id    UUID;
  v_aug_id     UUID;
  v_keep_slips INT;
  b_runs INT; b_slips INT; b_stamped INT; b_costs INT;
  a_runs INT; a_slips INT; a_stamped INT; a_costs INT;
  v_msg TEXT;
BEGIN
  IF v_august NOT IN ('keep', 'drafts', 'all') THEN
    RAISE EXCEPTION 'v_august ต้องเป็น keep, drafts หรือ all';
  END IF;

  SELECT id INTO v_keep_id FROM salary_runs WHERE kind = 'monthly' AND period_key = '2026-09';
  IF v_keep_id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบงวดเดือน 2026-09 — หยุด ไม่ลบอะไร';
  END IF;
  SELECT count(*) INTO v_keep_slips FROM salary_slips WHERE run_id = v_keep_id;

  SELECT count(*) INTO b_runs    FROM salary_runs;
  SELECT count(*) INTO b_slips   FROM salary_slips;
  SELECT count(*) INTO b_stamped FROM staff_checkins WHERE paid_slip_id IS NOT NULL;
  SELECT count(*) INTO b_costs   FROM job_cost_items WHERE notes LIKE 'salary_slip::%';

  -- ── ส่วน A: งวดที่มีแต่สลิปร่าง (guard trigger ยอมให้ลบสลิปร่างอยู่แล้ว) ──
  -- เงื่อนไข NOT EXISTS กันพลาด: ถ้ามีใครปิดงวดสลิปในงวดเหล่านี้ไปแล้ว งวดนั้นจะไม่ถูกลบ
  DELETE FROM salary_runs r
  WHERE r.id <> v_keep_id
    AND r.period_key IN ('2026-08-26_2026-09-25', '2026-09-21_2026-09-27')
    AND NOT EXISTS (
      SELECT 1 FROM salary_slips s WHERE s.run_id = r.id AND s.status <> 'draft'
    );

  -- ── ส่วน B: งวดเดือน 2026-08 ──
  SELECT id INTO v_aug_id FROM salary_runs WHERE kind = 'monthly' AND period_key = '2026-08';

  IF v_aug_id IS NOT NULL AND v_august = 'drafts' THEN
    DELETE FROM salary_slips
    WHERE run_id = v_aug_id
      AND status = 'draft'
      AND COALESCE(paid_history, '[]'::JSONB) = '[]'::JSONB
      AND COALESCE(reopen_history, '[]'::JSONB) = '[]'::JSONB;
  END IF;

  IF v_aug_id IS NOT NULL AND v_august = 'all' THEN
    -- GUC เดียวกับ purge_test_salary_run — เปิดเฉพาะใน transaction นี้
    PERFORM set_config('app.allow_salary_purge', 'on', true);

    DELETE FROM job_cost_items i
    USING salary_slips s
    WHERE s.run_id = v_aug_id
      AND i.notes LIKE 'salary_slip::' || s.id::TEXT || '::%';

    -- ON DELETE CASCADE ลบสลิป · ON DELETE SET NULL ปลดประทับ paid_slip_id ของเช็คอิน
    DELETE FROM salary_runs WHERE id = v_aug_id;

    PERFORM set_config('app.allow_salary_purge', 'off', true);
  END IF;

  -- งวดที่เก็บต้องไม่ถูกแตะ
  IF (SELECT count(*) FROM salary_slips WHERE run_id = v_keep_id) <> v_keep_slips THEN
    RAISE EXCEPTION 'สลิปของงวด 2026-09 เปลี่ยนจำนวน — ยกเลิกทั้งหมด';
  END IF;

  SELECT count(*) INTO a_runs    FROM salary_runs;
  SELECT count(*) INTO a_slips   FROM salary_slips;
  SELECT count(*) INTO a_stamped FROM staff_checkins WHERE paid_slip_id IS NOT NULL;
  SELECT count(*) INTO a_costs   FROM job_cost_items WHERE notes LIKE 'salary_slip::%';

  v_msg := format(
    'งวด %s → %s · สลิป %s → %s · เช็คอินที่ประทับว่าจ่ายแล้ว %s → %s · แถวต้นทุนจากสลิป %s → %s',
    b_runs, a_runs, b_slips, a_slips, b_stamped, a_stamped, b_costs, a_costs
  );

  IF v_dry_run THEN
    RAISE EXCEPTION 'ทดลองเท่านั้น ยังไม่ได้ลบอะไร (v_august = %) — ถ้ารันจริง: %', v_august, v_msg;
  END IF;

  RAISE NOTICE 'ลบแล้ว (v_august = %): %', v_august, v_msg;
END $$;

-- งวดที่เหลืออยู่
SELECT r.kind, r.period_key, r.period_start, r.period_end,
       count(s.id)                                    AS slips,
       count(s.id) FILTER (WHERE s.status = 'draft')  AS draft,
       count(s.id) FILTER (WHERE s.status <> 'draft') AS closed
FROM salary_runs r
LEFT JOIN salary_slips s ON s.run_id = r.id
GROUP BY r.id
ORDER BY r.period_start, r.kind;
