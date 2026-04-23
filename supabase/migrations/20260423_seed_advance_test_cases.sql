-- ============================================================================
-- Seed: 5 test cases for 'advance' (เบิกทดลองจ่าย) claim type
--
-- Creates claims covering every stage of the advance lifecycle so you can
-- exercise the UI end-to-end. All claims are prefixed with [TEST] so they
-- are easy to find & delete.
--
-- Run:
--   psql "$DATABASE_URL" -f supabase/migrations/20260423_seed_advance_test_cases.sql
-- or via Supabase SQL editor.
--
-- Cleanup:
--   DELETE FROM expense_claims WHERE title LIKE '[TEST]%' AND claim_type = 'advance';
-- ============================================================================

DO $$
DECLARE
  v_submitter UUID;
  v_admin     UUID;
  v_month     TEXT := to_char(NOW(), 'YYYYMM');
  v_seq       INT;
  v_num       TEXT;
  v_id        UUID;
BEGIN
  -- Prefer a non-admin submitter if one exists; otherwise fall back to any admin
  SELECT id INTO v_submitter FROM profiles WHERE role <> 'admin' ORDER BY created_at LIMIT 1;
  SELECT id INTO v_admin     FROM profiles WHERE role = 'admin'   ORDER BY created_at LIMIT 1;

  IF v_submitter IS NULL THEN v_submitter := v_admin; END IF;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'No admin profile found — cannot seed advance test cases';
  END IF;

  SELECT COALESCE(COUNT(*), 0) INTO v_seq
    FROM expense_claims WHERE claim_number LIKE 'EXP-' || v_month || '-%';

  -- ────────────────────────────────────────────────────────────────────────
  -- TC1 — Draft: user is drafting the advance but hasn't submitted yet.
  -- Expected UI: shows Submit/Cancel buttons, no receipt required.
  -- ────────────────────────────────────────────────────────────────────────
  v_seq := v_seq + 1;
  v_num := 'EXP-' || v_month || '-' || lpad(v_seq::text, 3, '0');
  INSERT INTO expense_claims (
    claim_number, claim_type, title, description, category,
    amount, unit_price, unit, quantity, expense_date,
    vat_mode, include_vat, withholding_tax_rate,
    status, submitted_by, notes,
    bank_name, bank_account_number, account_holder_name
  ) VALUES (
    v_num, 'advance',
    '[TEST 1/5] เบิกทดลองจ่าย — ค่าเดินทางไปถ่ายงานต่างจังหวัด',
    'คาดว่าจะใช้ค่าน้ำมัน + ทางด่วน + ที่พัก 1 คืน',
    'travel', 5000, 5000, 'บาท', 1, CURRENT_DATE + 2,
    'none', false, 0,
    'draft', v_submitter, 'TC1 — draft stage',
    'กสิกรไทย', '123-4-56789-0', 'ทดสอบ ระบบ'
  );

  -- ────────────────────────────────────────────────────────────────────────
  -- TC2 — Pending: user submitted, awaiting admin approval.
  -- Expected UI (admin): Approve / Approve-Month-End / Reject buttons.
  -- ────────────────────────────────────────────────────────────────────────
  v_seq := v_seq + 1;
  v_num := 'EXP-' || v_month || '-' || lpad(v_seq::text, 3, '0');
  INSERT INTO expense_claims (
    claim_number, claim_type, title, description, category,
    amount, unit_price, unit, quantity, expense_date,
    vat_mode, include_vat, withholding_tax_rate,
    status, submitted_by, submitted_at, notes,
    bank_name, bank_account_number, account_holder_name
  ) VALUES (
    v_num, 'advance',
    '[TEST 2/5] เบิกทดลองจ่าย — ค่าอุปกรณ์ set งานอีเวนต์',
    'ต้องซื้ออุปกรณ์ประกอบฉากที่ร้านล่วงหน้า',
    'equipment', 8000, 8000, 'บาท', 1, CURRENT_DATE + 3,
    'none', false, 0,
    'pending', v_submitter, NOW() - INTERVAL '2 hours', 'TC2 — pending admin review',
    'ไทยพาณิชย์', '234-5-67890-1', 'ทดสอบ ระบบ'
  );

  -- ────────────────────────────────────────────────────────────────────────
  -- TC3 — Approved (advance paid out): admin approved; money handed over.
  -- User should now see the "Settle Advance" form. Not yet settled.
  -- Expected UI (owner): settle form visible; advance / actual / refund.
  -- ────────────────────────────────────────────────────────────────────────
  v_seq := v_seq + 1;
  v_num := 'EXP-' || v_month || '-' || lpad(v_seq::text, 3, '0');
  INSERT INTO expense_claims (
    claim_number, claim_type, title, description, category,
    amount, unit_price, unit, quantity, expense_date,
    vat_mode, include_vat, withholding_tax_rate,
    status, submitted_by, submitted_at, approved_by, approved_at,
    notes, bank_name, bank_account_number, account_holder_name
  ) VALUES (
    v_num, 'advance',
    '[TEST 3/5] เบิกทดลองจ่าย — ค่าอาหารและเครื่องดื่มทีมงาน',
    'เลี้ยงทีมงานระหว่างออกกอง 3 วัน',
    'food', 6000, 6000, 'บาท', 1, CURRENT_DATE - 1,
    'none', false, 0,
    'approved', v_submitter, NOW() - INTERVAL '1 day',
    v_admin, NOW() - INTERVAL '20 hours',
    'TC3 — approved, waiting for user to report actual spend',
    'กรุงเทพ', '345-6-78901-2', 'ทดสอบ ระบบ'
  );

  -- ────────────────────────────────────────────────────────────────────────
  -- TC4 — Paid + Settled (refund due): happy-path full lifecycle.
  -- User received ฿10,000, spent ฿7,350, refunded ฿2,650.
  -- All supporting docs attached.
  -- ────────────────────────────────────────────────────────────────────────
  v_seq := v_seq + 1;
  v_num := 'EXP-' || v_month || '-' || lpad(v_seq::text, 3, '0');
  INSERT INTO expense_claims (
    claim_number, claim_type, title, description, category,
    amount, unit_price, unit, quantity, expense_date,
    vat_mode, include_vat, withholding_tax_rate,
    status, submitted_by, submitted_at, approved_by, approved_at,
    paid_by, paid_at,
    actual_spent_amount, refund_amount,
    actual_receipt_urls, refund_slip_urls,
    advance_settled_by, advance_settled_at,
    notes, bank_name, bank_account_number, account_holder_name
  ) VALUES (
    v_num, 'advance',
    '[TEST 4/5] เบิกทดลองจ่าย — ค่า Prop งาน Wedding ลูกค้า A',
    'เบิกล่วงหน้าสำหรับจัดซื้อ Prop ประดับงาน',
    'equipment', 10000, 10000, 'บาท', 1, CURRENT_DATE - 5,
    'none', false, 0,
    'paid', v_submitter, NOW() - INTERVAL '8 days', v_admin, NOW() - INTERVAL '7 days',
    v_admin, NOW() - INTERVAL '7 days',
    7350, 2650,
    ARRAY['https://placehold.co/600x400/png?text=Actual+Receipt+1','https://placehold.co/600x400/png?text=Actual+Receipt+2']::text[],
    ARRAY['https://placehold.co/600x400/png?text=Refund+Slip+2650']::text[],
    v_submitter, NOW() - INTERVAL '2 days',
    'TC4 — settled with refund ฿2,650',
    'กสิกรไทย', '123-4-56789-0', 'ทดสอบ ระบบ'
  )
  RETURNING id INTO v_id;
  INSERT INTO expense_claim_logs (claim_id, action, changed_by, changes, note) VALUES
    (v_id, 'submit',          v_submitter, jsonb_build_object('status', jsonb_build_object('from','draft','to','pending')),   'ยื่นใบเบิกเพื่อขออนุมัติ'),
    (v_id, 'approve',         v_admin,     jsonb_build_object('status', jsonb_build_object('from','pending','to','approved')), 'อนุมัติใบเบิก'),
    (v_id, 'mark_paid',       v_admin,     jsonb_build_object('status', jsonb_build_object('from','approved','to','paid')),    'ชำระเงินแล้ว'),
    (v_id, 'settle_advance',  v_submitter, jsonb_build_object(
        'actual_spent_amount', jsonb_build_object('from', null, 'to', 7350),
        'refund_amount',       jsonb_build_object('from', null, 'to', 2650)
      ), 'อัพเดทค่าใช้จ่ายจริง ฿7,350 (เงินคืน ฿2,650)');

  -- ────────────────────────────────────────────────────────────────────────
  -- TC5 — Paid + Settled (no refund): user spent exactly the advance.
  -- Upload actual receipts only; refund slip section hidden in UI.
  -- ────────────────────────────────────────────────────────────────────────
  v_seq := v_seq + 1;
  v_num := 'EXP-' || v_month || '-' || lpad(v_seq::text, 3, '0');
  INSERT INTO expense_claims (
    claim_number, claim_type, title, description, category,
    amount, unit_price, unit, quantity, expense_date,
    vat_mode, include_vat, withholding_tax_rate,
    status, submitted_by, submitted_at, approved_by, approved_at,
    paid_by, paid_at,
    actual_spent_amount, refund_amount,
    actual_receipt_urls,
    advance_settled_by, advance_settled_at,
    notes, bank_name, bank_account_number, account_holder_name
  ) VALUES (
    v_num, 'advance',
    '[TEST 5/5] เบิกทดลองจ่าย — ค่าสถานที่ประชุมนอกบริษัท',
    'จองห้องประชุม + อาหารกลางวันทีม',
    'venue', 4500, 4500, 'บาท', 1, CURRENT_DATE - 10,
    'none', false, 0,
    'paid', v_submitter, NOW() - INTERVAL '12 days', v_admin, NOW() - INTERVAL '11 days',
    v_admin, NOW() - INTERVAL '11 days',
    4500, 0,
    ARRAY['https://placehold.co/600x400/png?text=Venue+Receipt','https://placehold.co/600x400/png?text=Lunch+Receipt']::text[],
    v_submitter, NOW() - INTERVAL '6 days',
    'TC5 — settled, no refund (spent exactly the advance)',
    'ไทยพาณิชย์', '234-5-67890-1', 'ทดสอบ ระบบ'
  )
  RETURNING id INTO v_id;
  INSERT INTO expense_claim_logs (claim_id, action, changed_by, changes, note) VALUES
    (v_id, 'submit',          v_submitter, jsonb_build_object('status', jsonb_build_object('from','draft','to','pending')),   'ยื่นใบเบิกเพื่อขออนุมัติ'),
    (v_id, 'approve',         v_admin,     jsonb_build_object('status', jsonb_build_object('from','pending','to','approved')), 'อนุมัติใบเบิก'),
    (v_id, 'mark_paid',       v_admin,     jsonb_build_object('status', jsonb_build_object('from','approved','to','paid')),    'ชำระเงินแล้ว'),
    (v_id, 'settle_advance',  v_submitter, jsonb_build_object(
        'actual_spent_amount', jsonb_build_object('from', null, 'to', 4500),
        'refund_amount',       jsonb_build_object('from', null, 'to', 0)
      ), 'อัพเดทค่าใช้จ่ายจริง ฿4,500 (ไม่มีเงินคืน)');

  RAISE NOTICE 'Seeded 5 advance test claims with numbers EXP-%-001..005 style', v_month;
END $$;
