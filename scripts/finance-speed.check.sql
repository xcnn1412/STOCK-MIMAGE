-- ตรวจ supabase/migrations/20261001_finance_speed.sql (ขั้น 3 · v1.27.0) บนฐานข้อมูลทดสอบเปล่า — ห้ามรันบนฐานข้อมูลจริง
-- Run (postgres 17 เปล่า เช่น docker run --rm -e POSTGRES_PASSWORD=x -p 55432:5432 postgres:17):
--   psql -X -q -v ON_ERROR_STOP=1 -h localhost -p 55432 -U postgres -d postgres -f scripts/finance-speed.check.sql
-- ไฟล์นี้ include migration ด้วย \ir (path เทียบกับโฟลเดอร์ scripts) — รันจากโฟลเดอร์ไหนก็ได้
--
-- สิ่งที่ตรวจ (ทุกข้อขึ้น NOTICE "ok …" · ข้อไหนไม่ผ่าน = RAISE EXCEPTION แล้ว psql หยุดด้วย exit code ≠ 0):
--   1. ยังไม่มีคอลัมน์ deleted_at → migration ล้มที่ guard และไม่สร้างอะไรเลย (ERROR ที่ psql พิมพ์ในขั้นนี้เป็นผลที่ตั้งใจ)
--   2. รันครั้งแรก (ยังไม่มี filed_at) → ดัชนี 5 ตัว ข้าม filed_at · รันครั้งที่สอง (มี filed_at แล้ว) → ครบ 6 ตัว · รันครั้งที่สามไม่เปลี่ยนอะไร
--   3. ไม่มีดัชนีบน claim_number จากไฟล์นี้ · ไม่มี policy · RLS ไม่เปลี่ยน
--   4. ฟังก์ชันทั้งสอง: search_path = public · anon / authenticated เรียกไม่ได้ · service_role เรียกได้
--   5. finance_claim_money = calcTax ของ lib/finance/money.ts บน 6 ชุดจาก `npx tsx scripts/finance-calc-tax.check.ts --sql-fixture` (2 ตำแหน่ง + นับที่ตรงทุกบิต)
--   6. finance_wht_cells บนใบทดสอบ 12 ใบ = ผลที่คิดด้วย lib/finance/money.ts (ตัวเลข 2 ตำแหน่ง · บัญชีธนาคารและเวลาตรงทุกตัว)
--      ครอบคลุม: ใบที่ซ่อน / อัตรา 0 / อัตราว่าง ไม่นับ · VAT รวมใน/แยก/ไม่มี/ว่าง · หลายใบในกลุ่มเดียว · ชื่อธนาคารว่าง ('') ข้าม
--      · ช่องว่างล้วน (' ') ถือว่ามีค่า · ใบใหม่สุดไม่มีชื่อธนาคาร → ใช้ของใบก่อนหน้าพร้อมเวลาของใบนั้น
-- จบแล้วลบทุกอย่างที่สร้าง (รันซ้ำได้) · บรรทัดสุดท้ายต้องเป็น NOTICE "finance-speed.check.sql: ผ่านทั้งหมด"

\set ON_ERROR_STOP on

-- ── 0) ฐานข้อมูลทดสอบเปล่าเท่านั้น + บทบาทแบบ Supabase ─────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.expense_claims') IS NOT NULL THEN
    RAISE EXCEPTION 'ใช้กับฐานข้อมูลทดสอบเปล่าเท่านั้น — พบตาราง public.expense_claims อยู่แล้ว (ห้ามรันบนฐานข้อมูลจริง)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;

-- คอลัมน์ที่ migration ใช้ (ชนิดเดียวกับ production) — ยังไม่มี deleted_at / filed_at
CREATE TABLE public.expense_claims (
  id                   uuid PRIMARY KEY,
  claim_number         text,
  submitted_by         uuid,
  status               text NOT NULL,
  expense_date         date NOT NULL,
  created_at           timestamptz DEFAULT now(),
  amount               numeric NOT NULL DEFAULT 0,
  vat_mode             text DEFAULT 'none',
  withholding_tax_rate numeric DEFAULT 0,
  bank_name            text,
  bank_account_number  text,
  account_holder_name  text,
  paid_at              timestamptz,
  pettycash_fund_id    uuid
);

-- ── 1) guard: ยังไม่มี deleted_at → ล้มก่อนสร้างอะไร ───────────────────────────────────────
\echo '── ขั้น 1: ERROR ด้านล่างเป็นผลที่ตั้งใจ (guard ต้องหยุด migration เมื่อยังไม่มีคอลัมน์ deleted_at) ──'
\set ON_ERROR_STOP off
BEGIN;
\ir ../supabase/migrations/20261001_finance_speed.sql
ROLLBACK;
\set ON_ERROR_STOP on

DO $$
BEGIN
  IF to_regprocedure('public.finance_wht_cells()') IS NOT NULL
     OR to_regprocedure('public.finance_claim_money(numeric, text, numeric)') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'expense_claims' AND indexname <> 'expense_claims_pkey') THEN
    RAISE EXCEPTION 'FAIL 1: migration ต้องไม่สร้างอะไรเมื่อยังไม่มี deleted_at';
  END IF;
  RAISE NOTICE 'ok 1: ยังไม่มี deleted_at → guard หยุด migration (ไม่มีดัชนี/ฟังก์ชันถูกสร้าง)';
END $$;

-- ── 2) รันจริง: ครั้งแรกยังไม่มี filed_at · ครั้งที่สองมีแล้ว · ครั้งที่สามไม่เปลี่ยนอะไร ─────────────────
ALTER TABLE public.expense_claims ADD COLUMN deleted_at timestamptz;
\ir ../supabase/migrations/20261001_finance_speed.sql

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'expense_claims' AND indexname <> 'expense_claims_pkey';
  IF n <> 5 OR to_regclass('public.expense_claims_filed_at_idx') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 2a: ครั้งแรก (ยังไม่มี filed_at) ต้องได้ดัชนี 5 ตัวและไม่มี expense_claims_filed_at_idx (ได้ % ตัว)', n;
  END IF;
  RAISE NOTICE 'ok 2a: รันครั้งแรก — ดัชนี 5 ตัว ข้าม filed_at ที่ยังไม่มีคอลัมน์';
END $$;

ALTER TABLE public.expense_claims ADD COLUMN filed_at timestamptz;
\ir ../supabase/migrations/20261001_finance_speed.sql
\ir ../supabase/migrations/20261001_finance_speed.sql

DO $$
DECLARE
  want text[][] := ARRAY[
    ['expense_claims_paid_at_idx',           '(paid_at DESC) WHERE (paid_at IS NOT NULL)'],
    ['expense_claims_pettycash_fund_idx',    '(pettycash_fund_id) WHERE (pettycash_fund_id IS NOT NULL)'],
    ['expense_claims_filed_at_idx',          '(filed_at) WHERE (filed_at IS NOT NULL)'],
    ['expense_claims_expense_date_idx',      '(expense_date)'],
    ['expense_claims_submitter_created_idx', '(submitted_by, created_at DESC, id)'],
    ['expense_claims_wht_submitter_idx',     '(submitted_by) WHERE (withholding_tax_rate > (0)::numeric)']
  ];
  def text;
  n int;
BEGIN
  FOR i IN 1 .. array_length(want, 1) LOOP
    SELECT indexdef INTO def FROM pg_indexes WHERE schemaname = 'public' AND indexname = want[i][1];
    IF def IS NULL OR position(want[i][2] IN def) = 0 THEN
      RAISE EXCEPTION 'FAIL 2b: ดัชนี % ต้องเป็น % (ได้ %)', want[i][1], want[i][2], def;
    END IF;
  END LOOP;
  SELECT count(*) INTO n FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'expense_claims' AND indexname <> 'expense_claims_pkey';
  IF n <> 6 THEN RAISE EXCEPTION 'FAIL 2b: ต้องมีดัชนี 6 ตัวพอดีหลังรันสามครั้ง (ได้ %)', n; END IF;
  RAISE NOTICE 'ok 2b: รันครั้งที่สอง (มี filed_at) และสาม — ดัชนีครบ 6 ตัวตามนิยาม ไม่ซ้ำ ไม่ error';
END $$;

-- ── 3) ไม่แตะ claim_number · ไม่มี policy · RLS ไม่เปลี่ยน ───────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'expense_claims' AND indexdef LIKE '%(claim_number%') THEN
    RAISE EXCEPTION 'FAIL 3: ไฟล์นี้ต้องไม่สร้างดัชนีบน claim_number (มีแล้วใน 20260930_claim_numbers.sql)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'expense_claims') THEN
    RAISE EXCEPTION 'FAIL 3: ไฟล์นี้ต้องไม่สร้าง policy';
  END IF;
  IF (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.expense_claims'::regclass) THEN
    RAISE EXCEPTION 'FAIL 3: ไฟล์นี้ต้องไม่เปลี่ยน RLS';
  END IF;
  RAISE NOTICE 'ok 3: ไม่มีดัชนี claim_number · ไม่มี policy · RLS เท่าเดิม';
END $$;

-- ── 4) สิทธิ์ + search_path ของฟังก์ชัน ─────────────────────────────────────────────────
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['public.finance_claim_money(numeric, text, numeric)', 'public.finance_wht_cells()'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = fn::regprocedure AND 'search_path=public' = ANY (proconfig)) THEN
      RAISE EXCEPTION 'FAIL 4: % ต้องตั้ง search_path = public', fn;
    END IF;
    IF has_function_privilege('anon', fn, 'EXECUTE') OR has_function_privilege('authenticated', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL 4: anon / authenticated ต้องเรียก % ไม่ได้', fn;
    END IF;
    IF NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL 4: service_role ต้องเรียก % ได้', fn;
    END IF;
  END LOOP;
  IF (SELECT provolatile FROM pg_proc WHERE oid = 'public.finance_claim_money(numeric, text, numeric)'::regprocedure) <> 'i'
     OR (SELECT provolatile FROM pg_proc WHERE oid = 'public.finance_wht_cells()'::regprocedure) <> 's' THEN
    RAISE EXCEPTION 'FAIL 4: finance_claim_money ต้องเป็น IMMUTABLE และ finance_wht_cells ต้องเป็น STABLE';
  END IF;
  RAISE NOTICE 'ok 4: ทั้งสองฟังก์ชัน search_path = public · anon/authenticated เรียกไม่ได้ · service_role เรียกได้ · IMMUTABLE/STABLE';
END $$;

-- ── 5) finance_claim_money = calcTax (6 ชุดจาก finance-calc-tax.check.ts --sql-fixture) ─────────────
DO $$
DECLARE
  r record;
  bad int := 0;
  exact int := 0;
  total int := 0;
BEGIN
  FOR r IN
    SELECT f.*, m.*
      FROM (VALUES
        (1250.5::numeric, 'included', 3::numeric, 1168.6915887850466::float8, 81.80841121495337::float8, 1250.5::float8, 35.060747663551396::float8, 1215.4392523364486::float8),
        (2501::numeric, 'excluded', 3::numeric, 2501::float8, 175.07000000000002::float8, 2676.07::float8, 75.03::float8, 2601.04::float8),
        (107::numeric, 'none', 1.5::numeric, 107::float8, 0::float8, 107::float8, 1.605::float8, 105.395::float8),
        (9999.99::numeric, 'included', 5::numeric, 9345.785046728972::float8, 654.204953271028::float8, 9999.99::float8, 467.2892523364486::float8, 9532.700747663552::float8),
        (0.1::numeric, 'excluded', 15::numeric, 0.1::float8, 0.007000000000000001::float8, 0.10700000000000001::float8, 0.015::float8, 0.09200000000000001::float8),
        (123456.78::numeric, 'included', NULL, 115380.16822429906::float8, 8076.611775700934::float8, 123456.78::float8, 0::float8, 123456.78::float8)
      ) AS f(amount, vat_mode, wht_rate, e_base, e_vat, e_total, e_wht, e_net)
      CROSS JOIN LATERAL public.finance_claim_money(f.amount, f.vat_mode, f.wht_rate) m
  LOOP
    total := total + 1;
    IF abs(r.base_amount - r.e_base) >= 0.005 OR abs(r.vat_amount - r.e_vat) >= 0.005 OR abs(r.total_with_vat - r.e_total) >= 0.005
       OR abs(r.wht_amount - r.e_wht) >= 0.005 OR abs(r.net_payable - r.e_net) >= 0.005 THEN
      bad := bad + 1;
      RAISE NOTICE 'ต่าง: (% , %, %) → ได้ (%, %, %, %, %) คาด (%, %, %, %, %)', r.amount, r.vat_mode, r.wht_rate,
        r.base_amount, r.vat_amount, r.total_with_vat, r.wht_amount, r.net_payable, r.e_base, r.e_vat, r.e_total, r.e_wht, r.e_net;
    END IF;
    IF r.base_amount = r.e_base AND r.vat_amount = r.e_vat AND r.total_with_vat = r.e_total AND r.wht_amount = r.e_wht AND r.net_payable = r.e_net THEN
      exact := exact + 1;
    END IF;
  END LOOP;
  IF total <> 6 OR bad > 0 THEN RAISE EXCEPTION 'FAIL 5: finance_claim_money ต่างจาก calcTax % ชุดจาก %', bad, total; END IF;
  RAISE NOTICE 'ok 5: finance_claim_money = calcTax ทั้ง 6 ชุด (2 ตำแหน่ง) · ตรงทุกบิต % จาก 6 ชุด', exact;
  -- ค่าว่างทั้งหมด = 0 (ยอด/อัตราว่าง = 0 · VAT ว่าง = ไม่มี VAT)
  SELECT * INTO r FROM public.finance_claim_money(NULL, NULL, NULL);
  IF r.base_amount <> 0 OR r.vat_amount <> 0 OR r.total_with_vat <> 0 OR r.wht_amount <> 0 OR r.net_payable <> 0 THEN
    RAISE EXCEPTION 'FAIL 5: finance_claim_money(NULL, NULL, NULL) ต้องเป็น 0 ทุกช่อง';
  END IF;
END $$;

-- ── 6) finance_wht_cells บนใบทดสอบ 12 ใบ ──────────────────────────────────────────────
INSERT INTO public.expense_claims
  (id, submitted_by, status, expense_date, created_at, amount, vat_mode, withholding_tax_rate, bank_name, bank_account_number, account_holder_name, deleted_at)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'paid', '2026-08-31', '2026-09-01T10:00:00+00:00', 1250.5, 'included', 3, 'KBank', '111-1', 'A One', NULL),
  ('00000000-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 'paid', '2026-08-15', '2026-08-16T10:00:00+00:00', 2501, 'excluded', 3, '', '222-2', NULL, NULL),
  ('00000000-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000001', 'paid', '2026-09-02', '2026-09-03T10:00:00+00:00', 107, 'none', 1.5, NULL, NULL, NULL, NULL),
  ('00000000-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000001', 'approved', '2026-09-10', '2026-09-11T10:00:00+00:00', 9999.99, 'included', 5, 'SCB', '333-3', 'A One', NULL),
  ('00000000-0000-4000-8000-000000000005', 'bbbbbbbb-0000-4000-8000-000000000002', 'paid', '2026-09-05', '2026-09-06T10:00:00+00:00', 0.1, 'excluded', 15, 'BBL', '444-4', 'B Two', NULL),
  ('00000000-0000-4000-8000-000000000006', 'bbbbbbbb-0000-4000-8000-000000000002', 'paid', '2026-09-20', '2026-09-21T10:00:00+00:00', 123456.78, 'included', 3, NULL, '555-5', 'B Two', NULL),
  ('00000000-0000-4000-8000-000000000007', 'bbbbbbbb-0000-4000-8000-000000000002', 'paid', '2026-09-25', '2026-09-26T10:00:00+00:00', 500, NULL, 3, 'KTB', '666-6', 'B Two', '2026-09-27T00:00:00+00:00'),
  ('00000000-0000-4000-8000-000000000008', 'bbbbbbbb-0000-4000-8000-000000000002', 'paid', '2026-09-26', '2026-09-27T10:00:00+00:00', 800, 'none', 0, 'KTB', '888-8', 'B Two', NULL),
  ('00000000-0000-4000-8000-000000000009', 'bbbbbbbb-0000-4000-8000-000000000002', 'paid', '2026-09-27', '2026-09-28T10:00:00+00:00', 300, 'none', NULL, 'KTB', '999-9', 'B Two', NULL),
  ('00000000-0000-4000-8000-000000000010', 'aaaaaaaa-0000-4000-8000-000000000001', 'paid', '2026-08-31', '2026-08-31T20:00:00+00:00', 1000, 'none', 3, 'KBank', '777-7', 'A One', NULL),
  ('00000000-0000-4000-8000-000000000011', 'bbbbbbbb-0000-4000-8000-000000000002', 'approved', '2026-10-01', '2026-10-01T02:00:00+00:00', 4500, 'excluded', 3, ' ', '101-0', 'B Two', NULL),
  ('00000000-0000-4000-8000-000000000012', 'aaaaaaaa-0000-4000-8000-000000000001', 'pending_month_end', '2026-07-31', '2026-08-05T05:00:00+00:00', 12000, 'included', 1, 'KBank', '111-1', 'A One', NULL);

DO $$
DECLARE
  r record;
  bad int := 0;
  rows_seen int := 0;
BEGIN
  FOR r IN
    SELECT e.*, g.submitted_by AS g_by, g.n AS g_n, g.gross AS g_gross, g.wht AS g_wht, g.net AS g_net,
           g.bank_name AS g_bank, g.bank_name_at AS g_bank_at, g.bank_account_number AS g_acct, g.bank_account_number_at AS g_acct_at,
           g.account_holder_name AS g_holder, g.account_holder_name_at AS g_holder_at
      FROM (VALUES
        ('aaaaaaaa-0000-4000-8000-000000000001'::uuid, 'approved', '2026-09', 1, 9999.99::float8, 467.2892523364486::float8, 9532.700747663552::float8, 'SCB', '2026-09-11T10:00:00+00:00'::timestamptz, '333-3', '2026-09-11T10:00:00+00:00'::timestamptz, 'A One', '2026-09-11T10:00:00+00:00'::timestamptz),
        ('aaaaaaaa-0000-4000-8000-000000000001'::uuid, 'paid', '2026-08', 3, 4751.5::float8, 140.09074766355138::float8, 4786.479252336449::float8, 'KBank', '2026-09-01T10:00:00+00:00'::timestamptz, '111-1', '2026-09-01T10:00:00+00:00'::timestamptz, 'A One', '2026-09-01T10:00:00+00:00'::timestamptz),
        ('aaaaaaaa-0000-4000-8000-000000000001'::uuid, 'paid', '2026-09', 1, 107::float8, 1.605::float8, 105.395::float8, NULL, NULL::timestamptz, NULL, NULL::timestamptz, NULL, NULL::timestamptz),
        ('aaaaaaaa-0000-4000-8000-000000000001'::uuid, 'pending_month_end', '2026-07', 1, 12000::float8, 112.14953271028037::float8, 11887.85046728972::float8, 'KBank', '2026-08-05T05:00:00+00:00'::timestamptz, '111-1', '2026-08-05T05:00:00+00:00'::timestamptz, 'A One', '2026-08-05T05:00:00+00:00'::timestamptz),
        ('bbbbbbbb-0000-4000-8000-000000000002'::uuid, 'approved', '2026-10', 1, 4500::float8, 135::float8, 4680::float8, ' ', '2026-10-01T02:00:00+00:00'::timestamptz, '101-0', '2026-10-01T02:00:00+00:00'::timestamptz, 'B Two', '2026-10-01T02:00:00+00:00'::timestamptz),
        ('bbbbbbbb-0000-4000-8000-000000000002'::uuid, 'paid', '2026-09', 2, 123456.88::float8, 3461.4200467289716::float8, 119995.46695327102::float8, 'BBL', '2026-09-06T10:00:00+00:00'::timestamptz, '555-5', '2026-09-21T10:00:00+00:00'::timestamptz, 'B Two', '2026-09-21T10:00:00+00:00'::timestamptz)
      ) AS e(submitted_by, status, month, n, gross, wht, net, bank_name, bank_name_at, bank_account_number, bank_account_number_at, account_holder_name, account_holder_name_at)
      FULL OUTER JOIN public.finance_wht_cells() g
        ON g.submitted_by = e.submitted_by AND g.status = e.status AND g.month = e.month
  LOOP
    rows_seen := rows_seen + 1;
    IF r.submitted_by IS NULL OR r.g_by IS NULL
       OR r.g_n <> r.n
       OR abs(r.g_gross - r.gross) >= 0.005 OR abs(r.g_wht - r.wht) >= 0.005 OR abs(r.g_net - r.net) >= 0.005
       OR r.g_bank IS DISTINCT FROM r.bank_name OR r.g_bank_at IS DISTINCT FROM r.bank_name_at
       OR r.g_acct IS DISTINCT FROM r.bank_account_number OR r.g_acct_at IS DISTINCT FROM r.bank_account_number_at
       OR r.g_holder IS DISTINCT FROM r.account_holder_name OR r.g_holder_at IS DISTINCT FROM r.account_holder_name_at THEN
      bad := bad + 1;
      RAISE NOTICE 'ต่าง: คาด (%, %, %, n=%, %, %, %, %/%, %/%, %/%) ได้ (%, n=%, %, %, %, %/%, %/%, %/%)',
        r.submitted_by, r.status, r.month, r.n, r.gross, r.wht, r.net, r.bank_name, r.bank_name_at, r.bank_account_number, r.bank_account_number_at,
        r.account_holder_name, r.account_holder_name_at,
        r.g_by, r.g_n, r.g_gross, r.g_wht, r.g_net, r.g_bank, r.g_bank_at, r.g_acct, r.g_acct_at, r.g_holder, r.g_holder_at;
    END IF;
  END LOOP;
  IF bad > 0 OR rows_seen <> 6 THEN RAISE EXCEPTION 'FAIL 6: finance_wht_cells ต่างจากที่คาด % กลุ่ม (เทียบ % แถว คาด 6)', bad, rows_seen; END IF;
  RAISE NOTICE 'ok 6: finance_wht_cells = ที่คาดครบ 6 กลุ่ม (ไม่นับใบที่ซ่อน/อัตรา 0/อัตราว่าง · ยอด 2 ตำแหน่ง · บัญชีธนาคารและเวลาตรง)';
END $$;

-- ── เก็บกวาด (รันซ้ำได้) ─────────────────────────────────────────────────────────────
DROP FUNCTION public.finance_wht_cells();
DROP FUNCTION public.finance_claim_money(numeric, text, numeric);
DROP TABLE public.expense_claims;

DO $$ BEGIN RAISE NOTICE 'finance-speed.check.sql: ผ่านทั้งหมด'; END $$;
