-- ============================================================================
-- จัดซื้อ (/jobs/purchasing) — เช็กลิสต์จัดซื้อของงาน
-- สเปค: docs/specs/purchasing-checklist.md · ศัพท์: CONTEXT.md หัวข้อ "จัดซื้อ"
--
-- purchase_lists     เช็กลิสต์หนึ่งใบ — ผูกการ์ด CRM ได้งานละหนึ่งใบ หรือไม่ผูกงาน (ทั่วไป)
-- purchase_items     รายการหนึ่งข้อในเช็กลิสต์ (ซื้อ/สั่ง/อื่นๆ) สถานะ 4 ขั้น · ผูกใบเบิกได้ (expense_claim_id)
-- purchase_templates ชุดรายการสำเร็จรูป — กดแล้วได้รายการครบชุด
--
-- ทุกตารางเปิด RLS แต่ "ไม่มี policy": อ่าน/เขียนผ่าน service role ใน server action เท่านั้น
-- (ราคาและร้านค้าไม่ควรอ่านได้ด้วย anon key) — แบบเดียวกับ salary_slips
--
-- idempotent: รันซ้ำได้ (IF NOT EXISTS / ON CONFLICT)
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. purchase_lists
--    title = ชื่อที่แสดง: เช็กลิสต์ที่ผูกงานเก็บชื่อลูกค้า ณ ตอนสร้างไว้ด้วย
--    เผื่อการ์ด CRM ถูกลบ (crm_lead_id กลายเป็น NULL) เช็กลิสต์ยังอ่านรู้เรื่อง
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_lists (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_lead_id UUID        REFERENCES crm_leads(id) ON DELETE SET NULL,
  title       TEXT        NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  note        TEXT,
  budget      NUMERIC     CHECK (budget IS NULL OR budget >= 0),
  due_date    DATE,
  owner_id    UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_by  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  purchase_lists             IS 'เช็กลิสต์จัดซื้อ — ผูกการ์ด CRM งานละหนึ่งใบ หรือไม่ผูกงาน';
COMMENT ON COLUMN purchase_lists.crm_lead_id IS 'การ์ด CRM ที่ผูก — NULL = เช็กลิสต์ทั่วไป หรือการ์ดถูกลบไปแล้ว';
COMMENT ON COLUMN purchase_lists.due_date    IS 'ต้องได้ของภายใน — ใช้กับเช็กลิสต์ที่ไม่มีวันงานจาก CRM';
COMMENT ON COLUMN purchase_lists.owner_id    IS 'ผู้รับผิดชอบเช็กลิสต์ — ได้รับแจ้งเตือนเมื่อของครบ';
COMMENT ON COLUMN purchase_lists.updated_at  IS 'ถูกแตะทุกครั้งที่รายการในเช็กลิสต์เปลี่ยน — ใช้ตัดเช็กลิสต์เก่าออกจากหน้าหลัก';

-- งานหนึ่งงานมีเช็กลิสต์ได้ใบเดียว (เช็กลิสต์ทั่วไปมีได้ไม่จำกัด)
CREATE UNIQUE INDEX IF NOT EXISTS purchase_lists_lead_uidx
  ON purchase_lists (crm_lead_id) WHERE crm_lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS purchase_lists_updated_idx ON purchase_lists (updated_at DESC);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. purchase_items
--    est_price / actual_price = ยอดของทั้งรายการ (ไม่ใช่ราคาต่อหน่วย)
--    quantity เป็นข้อความอิสระ เช่น "2 กล่อง" — ไม่มีการคำนวณจากจำนวน
--    images = public URL ในบัคเก็ต purchase-attachments (สูงสุด 4 รูป บังคับในโค้ด)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_items (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id           UUID        NOT NULL REFERENCES purchase_lists(id) ON DELETE CASCADE,
  title             TEXT        NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  kind              TEXT        NOT NULL DEFAULT 'buy'
                    CHECK (kind IN ('buy', 'order', 'other')),
  status            TEXT        NOT NULL DEFAULT 'planning'
                    CHECK (status IN ('planning', 'purchasing', 'awaiting_delivery', 'done')),
  quantity          TEXT,
  est_price         NUMERIC     CHECK (est_price IS NULL OR est_price >= 0),
  actual_price      NUMERIC     CHECK (actual_price IS NULL OR actual_price >= 0),
  vendor            TEXT,
  link_url          TEXT,
  tracking_no       TEXT,
  assignee_id       UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  due_date          DATE,
  note              TEXT,
  images            TEXT[]      NOT NULL DEFAULT '{}',
  sort_order        INTEGER     NOT NULL DEFAULT 0,
  status_changed_at TIMESTAMPTZ,
  status_changed_by UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  done_at           TIMESTAMPTZ,
  created_by        UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  purchase_items              IS 'รายการจัดซื้อหนึ่งข้อในเช็กลิสต์';
COMMENT ON COLUMN purchase_items.kind         IS 'buy = ซื้อ · order = สั่ง · other = อื่นๆ';
COMMENT ON COLUMN purchase_items.status       IS 'planning = วางแผน · purchasing = กำลังจัดซื้อ · awaiting_delivery = รอจัดส่ง · done = เสร็จสิ้น';
COMMENT ON COLUMN purchase_items.est_price    IS 'งบของทั้งรายการ (บาท)';
COMMENT ON COLUMN purchase_items.actual_price IS 'ยอดจ่ายจริงของทั้งรายการ (บาท)';
COMMENT ON COLUMN purchase_items.due_date     IS 'ต้องได้ของภายใน — ว่าง = ใช้วันงานของเช็กลิสต์';
COMMENT ON COLUMN purchase_items.done_at      IS 'เวลาที่เปลี่ยนเป็นเสร็จสิ้น — ถอยสถานะแล้วกลับเป็น NULL';

CREATE INDEX IF NOT EXISTS purchase_items_list_idx ON purchase_items (list_id, sort_order, created_at);
-- หน้าหลักและแผงเตือนอ่านเฉพาะรายการที่ยังไม่เสร็จ
CREATE INDEX IF NOT EXISTS purchase_items_open_idx ON purchase_items (list_id) WHERE status <> 'done';

-- ────────────────────────────────────────────────────────────────────────────
-- 2b. ผูกรายการกับใบเบิก (expense_claims)
--     รายการหนึ่งข้อผูกได้ใบเบิกเดียว · ใบเบิกหนึ่งใบผูกได้หลายรายการ (ข้ามเช็กลิสต์ได้)
--     ต้นทุนของงานยังมาจากใบเบิกทางเดียว (Finance → Costs) — เช็กลิสต์ไม่ส่งยอดเข้าต้นทุนเอง จึงไม่นับซ้ำ
--     ใบเบิกถูกลบ = เลิกผูกเอง (ON DELETE SET NULL) รายการยังอยู่
--     ADD COLUMN IF NOT EXISTS: เครื่องที่รันไฟล์นี้รุ่นก่อน (ยังไม่มีคอลัมน์) รันซ้ำแล้วได้คอลัมน์เพิ่ม
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE purchase_items
  ADD COLUMN IF NOT EXISTS expense_claim_id UUID REFERENCES expense_claims(id) ON DELETE SET NULL;

COMMENT ON COLUMN purchase_items.expense_claim_id IS 'ใบเบิกที่รายการนี้ผูกอยู่ — NULL = ยังไม่ผูก (ใบเบิกหนึ่งใบผูกได้หลายรายการ)';

-- หน้าใบเบิกอ่านรายการที่ผูกกับใบนั้น · หน้าจัดซื้อนับจำนวนรายการต่อใบเบิก
CREATE INDEX IF NOT EXISTS purchase_items_claim_idx
  ON purchase_items (expense_claim_id) WHERE expense_claim_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. purchase_templates
--    items = [{ title, kind, quantity, est_price, vendor, link_url, note }]
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_templates (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  items      JSONB       NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(items) = 'array'),
  created_by UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE purchase_templates IS 'ชุดรายการสำเร็จรูปของเมนูจัดซื้อ';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. RLS — เปิด แต่ไม่มี policy (service role เท่านั้น)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE purchase_lists     ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_templates ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. บัคเก็ตรูปแนบ — public (เปิดดูด้วยลิงก์) แต่ไม่มี policy เขียน:
--    อัปโหลด/ลบทำผ่าน service role ใน server action เท่านั้น
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'purchase-attachments',
  'purchase-attachments',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
