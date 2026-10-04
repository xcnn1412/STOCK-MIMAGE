-- ============================================================================
-- OAuth 2.1 สำหรับ MCP (v1.38.0) — ให้ Claude (claude.ai / Desktop) อ่านข้อมูลแทนพนักงาน
--
-- oauth_clients  ลงทะเบียนแอปแบบอัตโนมัติ (Dynamic Client Registration, RFC 7591)
-- oauth_codes    authorization code ใช้ครั้งเดียว อายุ 10 นาที
-- oauth_tokens   access (1 ชม.) + refresh (30 วัน หมุนทุกครั้งที่ใช้) ต่อการเชื่อมต่อหนึ่งครั้ง
--
-- เก็บเฉพาะ sha256 (hex) ของ code / token — ไม่เก็บค่าจริง
-- อ่าน/เขียนผ่าน service role เท่านั้น: เปิด RLS ไม่มี policy
-- idempotent: รันซ้ำได้
-- ============================================================================

-- ── 1. oauth_clients ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id     TEXT PRIMARY KEY,
  client_name   TEXT,
  redirect_uris TEXT[] NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE oauth_clients IS 'แอปที่ลงทะเบียนเข้ามาเชื่อม MCP (DCR) — redirect_uris ต้องตรงทั้งสตริงตอนขอ code';

-- ── 2. oauth_codes ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oauth_codes (
  code_hash      TEXT PRIMARY KEY,
  client_id      TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  redirect_uri   TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  scope          TEXT,
  resource       TEXT,
  expires_at     TIMESTAMPTZ NOT NULL,
  used_at        TIMESTAMPTZ
);

COMMENT ON TABLE oauth_codes IS 'authorization code (sha256) — ใช้ครั้งเดียว · ใช้ซ้ำ = revoke token ที่ออกจาก code นี้';

-- ── 3. oauth_tokens ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client_id          TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  client_name        TEXT,
  access_hash        TEXT NOT NULL,
  refresh_hash       TEXT NOT NULL,
  scope              TEXT,
  access_expires_at  TIMESTAMPTZ NOT NULL,
  refresh_expires_at TIMESTAMPTZ NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at       TIMESTAMPTZ,
  revoked_at         TIMESTAMPTZ
);

COMMENT ON TABLE  oauth_tokens             IS 'การเชื่อมต่อ MCP — token (sha256) · revoked_at = ยกเลิกแล้ว / ถูกหมุนแทน';
COMMENT ON COLUMN oauth_tokens.client_name IS 'ชื่อแอปตอนออก token (สำเนา)';

-- code ที่ token มาจาก (ไว้ revoke เมื่อ code ถูกใช้ซ้ำ) — refresh ที่หมุนแล้วสืบต่อค่าเดิม
ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS code_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS oauth_tokens_access_hash_uidx  ON oauth_tokens (access_hash);
CREATE UNIQUE INDEX IF NOT EXISTS oauth_tokens_refresh_hash_uidx ON oauth_tokens (refresh_hash);
CREATE INDEX IF NOT EXISTS oauth_tokens_user_idx ON oauth_tokens (user_id);
CREATE INDEX IF NOT EXISTS oauth_tokens_code_hash_idx ON oauth_tokens (code_hash);

-- ── 4. RLS เปิด ไม่มี policy = anon / authenticated เข้าไม่ได้ ──────────────────
ALTER TABLE oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_codes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_tokens  ENABLE ROW LEVEL SECURITY;
