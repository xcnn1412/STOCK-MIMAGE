-- ============================================================================
-- Document Control (โมดูล "เอกสาร") — schema + numbering engine + guards
-- spec: docs/specs/documents-module.md
-- ไฟล์นี้ idempotent — รันซ้ำได้
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. doc_brands — แบรนด์ = นิติบุคคลแยกกัน (หัวกระดาษ/เลขภาษี/ชุดเลขเอกสาร)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doc_brands (
  code             TEXT        PRIMARY KEY CHECK (code ~ '^[A-Z]{3}$'),
  name_th          TEXT        NOT NULL,
  name_en          TEXT,
  address          TEXT,
  tax_id           TEXT,
  branch           TEXT        DEFAULT 'สำนักงานใหญ่',
  phone            TEXT,
  email            TEXT,
  website          TEXT,
  logo_url         TEXT,
  vat_registered   BOOLEAN     NOT NULL DEFAULT false,
  default_vat_mode TEXT        NOT NULL DEFAULT 'none' CHECK (default_vat_mode IN ('none', 'exclusive', 'inclusive')),
  default_wht_rate NUMERIC     NOT NULL DEFAULT 0,
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  sort_order       INT         NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- แบรนด์เริ่มต้น — เจ้าของต้องกรอกที่อยู่/เลขผู้เสียภาษีเองในหน้าตั้งค่า
INSERT INTO doc_brands (code, name_th, name_en, sort_order) VALUES
  ('MIP', 'M Image', 'M Image', 1),
  ('PPB', 'Prince Photo Booth', 'Prince Photo Booth', 2),
  ('PLT', 'PhotoLand', 'PhotoLand', 3)
ON CONFLICT (code) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. doc_counters — ตัวนับเลขที่เอกสาร (brand × type × period)
--    period = 'YYMM' รายเดือน, 'YY' รายปี, และ 'draft' สำหรับเลขร่างกลาง ('*','*')
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doc_counters (
  brand_code  TEXT        NOT NULL,
  doc_type    TEXT        NOT NULL,
  period      TEXT        NOT NULL,
  last_number INT         NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  updated_by  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (brand_code, doc_type, period)
);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. doc_templates — แม่แบบต่อ brand × type (บันทึก = เวอร์ชันใหม่)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doc_templates (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_code     TEXT        NOT NULL REFERENCES doc_brands(code) ON DELETE CASCADE,
  doc_type       TEXT        NOT NULL,
  version        INT         NOT NULL DEFAULT 1,
  title          TEXT,
  terms          TEXT,   -- HTML จาก TipTap
  footer         TEXT,
  signer_label_1 TEXT,
  signer_label_2 TEXT,
  payment_info   TEXT,
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  created_by     UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (brand_code, doc_type, version)
);

-- มีได้เพียง 1 เวอร์ชันที่ active ต่อ brand × type
CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_templates_active
  ON doc_templates(brand_code, doc_type) WHERE is_active;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. documents
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  draft_no            TEXT        NOT NULL UNIQUE,
  doc_no              TEXT        UNIQUE,
  brand_code          TEXT        NOT NULL REFERENCES doc_brands(code) ON DELETE RESTRICT,
  doc_type            TEXT        NOT NULL CHECK (doc_type IN (
                        'QT','JO','IV','TX','RC','CN','PO','CT','DN','MM','JA','IA','RS')),
  status              TEXT        NOT NULL DEFAULT 'draft' CHECK (status IN (
                        'draft','pending_approval','rejected','issued','sent','void','closed')),
  template_version_id UUID        REFERENCES doc_templates(id) ON DELETE SET NULL,

  party_name          TEXT,
  party_company       TEXT,
  party_tax_id        TEXT,
  party_address       TEXT,
  party_phone         TEXT,
  party_email         TEXT,
  party_id_card       TEXT,
  party_birth_date    DATE,

  doc_date            DATE        DEFAULT CURRENT_DATE,
  meta                JSONB       NOT NULL DEFAULT '{}',

  vat_mode            TEXT        NOT NULL DEFAULT 'none' CHECK (vat_mode IN ('none','exclusive','inclusive')),
  wht_rate            NUMERIC     NOT NULL DEFAULT 0,
  subtotal            NUMERIC     NOT NULL DEFAULT 0,
  discount_total      NUMERIC     NOT NULL DEFAULT 0,
  vat_amount          NUMERIC     NOT NULL DEFAULT 0,
  wht_amount          NUMERIC     NOT NULL DEFAULT 0,
  total               NUMERIC     NOT NULL DEFAULT 0,
  net_payable         NUMERIC     NOT NULL DEFAULT 0,
  currency            TEXT        NOT NULL DEFAULT 'THB',

  ref_document_id     UUID        REFERENCES documents(id) ON DELETE SET NULL,
  notes               TEXT,

  created_by          UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  submitted_at        TIMESTAMPTZ,
  approved_by         UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at         TIMESTAMPTZ,
  issued_at           TIMESTAMPTZ,
  rejected_reason     TEXT,
  void_reason         TEXT,
  void_by             UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  void_at             TIMESTAMPTZ,
  sent_at             TIMESTAMPTZ,
  closed_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_status      ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_brand_type  ON documents(brand_code, doc_type);
CREATE INDEX IF NOT EXISTS idx_documents_created_by  ON documents(created_by);
CREATE INDEX IF NOT EXISTS idx_documents_doc_no      ON documents(doc_no);

-- ────────────────────────────────────────────────────────────────────────────
-- 5. document_items
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_items (
  id          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID    NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  line_no     INT     NOT NULL DEFAULT 1,
  description TEXT,
  quantity    NUMERIC NOT NULL DEFAULT 1,
  unit        TEXT,
  unit_price  NUMERIC NOT NULL DEFAULT 0,
  discount    NUMERIC NOT NULL DEFAULT 0,
  amount      NUMERIC NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_document_items_document_id ON document_items(document_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 6. document_logs — audit trail ต่อเอกสาร (pattern เดียวกับ expense_claim_logs)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_logs (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id   UUID        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  action        TEXT        NOT NULL,
  from_status   TEXT,
  to_status     TEXT,
  changed_by    UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  note          TEXT,
  self_approved BOOLEAN     NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_logs_document_id ON document_logs(document_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 7. profiles.signature_url — รูปลายเซ็นผู้อนุมัติ (ใช้บน PDF)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS signature_url TEXT;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. ผ่อน CHECK ของ notifications ให้รองรับ doc_* / 'document'
--    ชื่อ constraint ไม่แน่นอน → หาแบบ dynamic จาก pg_constraint
--    ponytail: ไม่ใส่ CHECK ของ type กลับ — โค้ดปัจจุบันส่ง type ที่ไม่อยู่ใน list เดิมอยู่แล้ว
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE rel.relname = 'notifications'
      AND ns.nspname = 'public'
      AND con.contype = 'c'
      AND (pg_get_constraintdef(con.oid) ILIKE '%type%' OR pg_get_constraintdef(con.oid) ILIKE '%reference_type%')
  LOOP
    EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_reference_type_check CHECK (
    reference_type IN ('job', 'ticket', 'expense_claim', 'kpi_evaluation', 'crm_lead', 'document')
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 9. Storage bucket 'doc-assets' (โลโก้แบรนด์) — อ่านสาธารณะ
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('doc-assets', 'doc-assets', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'doc_assets_public_read') THEN
    CREATE POLICY "doc_assets_public_read" ON storage.objects
      FOR SELECT TO public USING (bucket_id = 'doc-assets');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'doc_assets_insert') THEN
    CREATE POLICY "doc_assets_insert" ON storage.objects
      FOR INSERT TO authenticated WITH CHECK (bucket_id = 'doc-assets');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'doc_assets_update') THEN
    CREATE POLICY "doc_assets_update" ON storage.objects
      FOR UPDATE TO authenticated USING (bucket_id = 'doc-assets');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'doc_assets_delete') THEN
    CREATE POLICY "doc_assets_delete" ON storage.objects
      FOR DELETE TO authenticated USING (bucket_id = 'doc-assets');
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- RLS — permissive ตาม pattern repo; สิทธิ์จริงบังคับใน server actions + trigger
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['doc_brands','doc_counters','doc_templates','documents','document_items','document_logs']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_all') THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        t || '_all', t);
    END IF;
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 10. next_doc_counter — เพิ่มเลขในชุดตัวนับแบบล็อกแถว (กันเลขซ้ำเมื่อกดพร้อมกัน)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.next_doc_counter(
  p_brand  TEXT,
  p_type   TEXT,
  p_period TEXT,
  p_actor  UUID
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last INT;
BEGIN
  -- ล็อกแถวตัวนับ; ถ้ายังไม่มีก็สร้างแล้ววนกลับมาล็อก
  -- (การ INSERT ที่ยัง uncommitted ของ session อื่นจะมองไม่เห็นด้วย SELECT
  --  แต่ INSERT ของเราจะรอที่ unique index แล้วโยน unique_violation → วนใหม่)
  LOOP
    SELECT last_number INTO v_last
    FROM doc_counters
    WHERE brand_code = p_brand AND doc_type = p_type AND period = p_period
    FOR UPDATE;

    EXIT WHEN FOUND;

    BEGIN
      INSERT INTO doc_counters (brand_code, doc_type, period, last_number)
      VALUES (p_brand, p_type, p_period, 0);
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  v_last := COALESCE(v_last, 0) + 1;

  UPDATE doc_counters
  SET last_number = v_last, updated_at = now(), updated_by = p_actor
  WHERE brand_code = p_brand AND doc_type = p_type AND period = p_period;

  RETURN v_last;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 11. issue_document_number — ออกเลขจริง + เปลี่ยนสถานะ + เขียน log ในธุรกรรมเดียว
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.issue_document_number(
  p_doc_id              UUID,
  p_actor               UUID,
  p_template_version_id UUID DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc     documents%ROWTYPE;
  v_period  TEXT;
  v_yymm    TEXT;
  v_n       INT;
  v_doc_no  TEXT;
  v_tpl     UUID;
BEGIN
  SELECT * INTO v_doc FROM documents WHERE id = p_doc_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบเอกสาร (%)', p_doc_id;
  END IF;
  IF v_doc.doc_no IS NOT NULL THEN
    RAISE EXCEPTION 'เอกสารนี้ออกเลขไปแล้ว (%)', v_doc.doc_no;
  END IF;
  IF v_doc.status NOT IN ('draft', 'pending_approval') THEN
    RAISE EXCEPTION 'สถานะไม่อนุญาตให้ออกเลข (%)', v_doc.status;
  END IF;

  -- เวลาไทยเสมอ — เลขที่เอกสารต้องตรงกับวันที่ที่ผู้ใช้เห็น
  v_yymm := to_char(now() AT TIME ZONE 'Asia/Bangkok', 'YYMM');
  -- TX/RC/CN รันเลขต่อเนื่องทั้งปีตามกฎสรรพากร; ที่เหลือรีเซ็ตรายเดือน
  IF v_doc.doc_type IN ('TX', 'RC', 'CN') THEN
    v_period := to_char(now() AT TIME ZONE 'Asia/Bangkok', 'YY');
  ELSE
    v_period := v_yymm;
  END IF;

  v_n := public.next_doc_counter(v_doc.brand_code, v_doc.doc_type, v_period, p_actor);
  v_doc_no := v_doc.brand_code || '-' || v_doc.doc_type || '-' || v_yymm || '-' || lpad(v_n::TEXT, 4, '0');

  v_tpl := COALESCE(
    p_template_version_id,
    (SELECT id FROM doc_templates
      WHERE brand_code = v_doc.brand_code AND doc_type = v_doc.doc_type AND is_active
      LIMIT 1)
  );

  UPDATE documents
  SET doc_no              = v_doc_no,
      status              = 'issued',
      issued_at           = now(),
      approved_by         = p_actor,
      approved_at         = now(),
      template_version_id = v_tpl,
      updated_at          = now()
  WHERE id = p_doc_id;

  INSERT INTO document_logs (document_id, action, from_status, to_status, changed_by)
  VALUES (p_doc_id, 'issue', v_doc.status, 'issued', p_actor);

  RETURN v_doc_no;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 12. Guard — เอกสารที่ออกเลขแล้วแก้เนื้อหาไม่ได้ ลบไม่ได้ (แม้ service role)
--     ยกเว้นเมื่อ GUC app.allow_doc_purge = 'on' (ใช้โดย purge_test_documents)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.documents_guard_issued()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(current_setting('app.allow_doc_purge', true), '') = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.doc_no IS NOT NULL THEN
      RAISE EXCEPTION 'ห้ามลบเอกสารที่ออกเลขแล้ว (%)', OLD.doc_no;
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.doc_no IS NOT NULL THEN
    -- อนุญาตเฉพาะ: status, void_reason, void_by, void_at, sent_at, closed_at, updated_at
    IF NEW.doc_no              IS DISTINCT FROM OLD.doc_no
    OR NEW.draft_no            IS DISTINCT FROM OLD.draft_no
    OR NEW.id                  IS DISTINCT FROM OLD.id
    OR NEW.brand_code          IS DISTINCT FROM OLD.brand_code
    OR NEW.doc_type            IS DISTINCT FROM OLD.doc_type
    OR NEW.template_version_id IS DISTINCT FROM OLD.template_version_id
    OR NEW.party_name          IS DISTINCT FROM OLD.party_name
    OR NEW.party_company       IS DISTINCT FROM OLD.party_company
    OR NEW.party_tax_id        IS DISTINCT FROM OLD.party_tax_id
    OR NEW.party_address       IS DISTINCT FROM OLD.party_address
    OR NEW.party_phone         IS DISTINCT FROM OLD.party_phone
    OR NEW.party_email         IS DISTINCT FROM OLD.party_email
    OR NEW.party_id_card       IS DISTINCT FROM OLD.party_id_card
    OR NEW.party_birth_date    IS DISTINCT FROM OLD.party_birth_date
    OR NEW.doc_date            IS DISTINCT FROM OLD.doc_date
    OR NEW.meta                IS DISTINCT FROM OLD.meta
    OR NEW.vat_mode            IS DISTINCT FROM OLD.vat_mode
    OR NEW.wht_rate            IS DISTINCT FROM OLD.wht_rate
    OR NEW.subtotal            IS DISTINCT FROM OLD.subtotal
    OR NEW.discount_total      IS DISTINCT FROM OLD.discount_total
    OR NEW.vat_amount          IS DISTINCT FROM OLD.vat_amount
    OR NEW.wht_amount          IS DISTINCT FROM OLD.wht_amount
    OR NEW.total               IS DISTINCT FROM OLD.total
    OR NEW.net_payable         IS DISTINCT FROM OLD.net_payable
    OR NEW.currency            IS DISTINCT FROM OLD.currency
    OR NEW.ref_document_id     IS DISTINCT FROM OLD.ref_document_id
    OR NEW.notes               IS DISTINCT FROM OLD.notes
    OR NEW.created_by          IS DISTINCT FROM OLD.created_by
    OR NEW.submitted_at        IS DISTINCT FROM OLD.submitted_at
    OR NEW.approved_by         IS DISTINCT FROM OLD.approved_by
    OR NEW.approved_at         IS DISTINCT FROM OLD.approved_at
    OR NEW.issued_at           IS DISTINCT FROM OLD.issued_at
    OR NEW.rejected_reason     IS DISTINCT FROM OLD.rejected_reason
    OR NEW.created_at          IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'ห้ามแก้ไขเอกสารที่ออกเลขแล้ว (%)', OLD.doc_no;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_documents_guard_issued ON documents;
CREATE TRIGGER trg_documents_guard_issued
  BEFORE UPDATE OR DELETE ON documents
  FOR EACH ROW EXECUTE FUNCTION public.documents_guard_issued();

-- ────────────────────────────────────────────────────────────────────────────
-- 13. Guard สำหรับรายการ — แตะไม่ได้เมื่อเอกสารแม่มีเลขแล้ว
--     (CASCADE delete ของแม่ถูกบล็อกโดย guard ของแม่อยู่แล้ว)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.document_items_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_doc_id UUID;
  v_doc_no TEXT;
BEGIN
  IF COALESCE(current_setting('app.allow_doc_purge', true), '') = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  v_doc_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.document_id ELSE NEW.document_id END;
  SELECT doc_no INTO v_doc_no FROM documents WHERE id = v_doc_id;

  IF v_doc_no IS NOT NULL THEN
    RAISE EXCEPTION 'ห้ามแก้ไขรายการของเอกสารที่ออกเลขแล้ว (%)', v_doc_no;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

DROP TRIGGER IF EXISTS trg_document_items_guard ON document_items;
CREATE TRIGGER trg_document_items_guard
  BEFORE INSERT OR UPDATE OR DELETE ON document_items
  FOR EACH ROW EXECUTE FUNCTION public.document_items_guard();

-- ────────────────────────────────────────────────────────────────────────────
-- purge_test_documents — ทางออกเดียวที่ลบเอกสารที่ออกเลขแล้วได้
-- ใช้กับแบรนด์ทดสอบ 'ZZT' เท่านั้น (scripts/doc-control-check.ts)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.purge_test_documents(p_brand TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_brand IS DISTINCT FROM 'ZZT' THEN
    RAISE EXCEPTION 'purge_test_documents ใช้ได้เฉพาะแบรนด์ทดสอบ ZZT เท่านั้น';
  END IF;

  PERFORM set_config('app.allow_doc_purge', 'on', true);

  DELETE FROM document_logs  WHERE document_id IN (SELECT id FROM documents WHERE brand_code = p_brand);
  DELETE FROM document_items WHERE document_id IN (SELECT id FROM documents WHERE brand_code = p_brand);
  UPDATE documents SET ref_document_id = NULL WHERE brand_code = p_brand;
  DELETE FROM documents      WHERE brand_code = p_brand;
  DELETE FROM doc_counters   WHERE brand_code = p_brand;
  DELETE FROM doc_templates  WHERE brand_code = p_brand;
  DELETE FROM doc_brands     WHERE code = p_brand;

  PERFORM set_config('app.allow_doc_purge', 'off', true);
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 14. Grants
-- ────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.next_doc_counter(TEXT, TEXT, TEXT, UUID)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.issue_document_number(UUID, UUID, UUID)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.purge_test_documents(TEXT)                     TO authenticated, service_role;
