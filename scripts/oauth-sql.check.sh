#!/usr/bin/env bash
# ตรวจ migration OAuth ของ MCP (20261008_oauth_mcp.sql) บน postgres:17 ชั่วคราว — ไม่แตะฐาน prod
# รัน: bash scripts/oauth-sql.check.sh (จาก root ของ repo, ต้องมี docker)
# ขั้นตอน: profiles จำลอง → รัน migration 2 รอบ (รอบแรกเป็น transaction เดียวแบบ SQL editor) → assert M1
# ส่ง SQL ผ่าน stdin ไม่ mount volume (path มีอักษรไทย + Git Bash แปลง path)
set -euo pipefail

cd "$(dirname "$0")/.."
MIGRATION="supabase/migrations/20261008_oauth_mcp.sql"
NAME="oauth-check-$$-$RANDOM"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$NAME" -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17 >/dev/null

# เซิร์ฟเวอร์ชั่วคราวตอน init ฟังแค่ unix socket — รอจนต่อผ่าน TCP ได้ = ตัวจริงพร้อมแล้ว
for _ in $(seq 1 60); do
  if docker exec "$NAME" psql -h 127.0.0.1 -U postgres -tAc 'select 1' >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$NAME" psql -h 127.0.0.1 -U postgres -tAc 'select 1' >/dev/null

psql_run() { docker exec -i "$NAME" psql -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -U postgres "$@"; }

# ── schema จำลอง prod ─────────────────────────────────────────────────────────
psql_run <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE TABLE profiles (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), full_name TEXT);
SQL

# ── migration 2 รอบ ────────────────────────────────────────────────────────────
psql_run --single-transaction < "$MIGRATION"
psql_run < "$MIGRATION"
echo "migration: รัน 2 รอบผ่าน"

# ── M1: โครงสร้าง ─────────────────────────────────────────────────────────────
psql_run <<'SQL'
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['oauth_clients', 'oauth_codes', 'oauth_tokens'] LOOP
    ASSERT to_regclass('public.' || t) IS NOT NULL, 'ไม่มีตาราง ' || t;
    ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass), t || ' ไม่ได้เปิด RLS';
    ASSERT (SELECT count(*) FROM pg_policies WHERE tablename = t) = 0, t || ' มี policy';
  END LOOP;

  -- คอลัมน์ตามสเปค
  ASSERT (SELECT count(*) FROM information_schema.columns WHERE table_name = 'oauth_clients'
           AND column_name IN ('client_id', 'client_name', 'redirect_uris', 'created_at')) = 4, 'oauth_clients ขาดคอลัมน์';
  ASSERT (SELECT is_nullable FROM information_schema.columns WHERE table_name = 'oauth_clients' AND column_name = 'redirect_uris') = 'NO',
    'redirect_uris ต้อง NOT NULL';
  ASSERT (SELECT count(*) FROM information_schema.columns WHERE table_name = 'oauth_codes'
           AND column_name IN ('code_hash', 'client_id', 'user_id', 'redirect_uri', 'code_challenge', 'scope', 'resource', 'expires_at', 'used_at')) = 9,
    'oauth_codes ขาดคอลัมน์';
  ASSERT (SELECT count(*) FROM information_schema.columns WHERE table_name = 'oauth_tokens'
           AND column_name IN ('id', 'user_id', 'client_id', 'client_name', 'access_hash', 'refresh_hash', 'scope',
                               'access_expires_at', 'refresh_expires_at', 'created_at', 'last_used_at', 'revoked_at')) = 12,
    'oauth_tokens ขาดคอลัมน์';

  -- unique บน access_hash / refresh_hash · index user_id
  ASSERT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'oauth_tokens' AND indexdef LIKE 'CREATE UNIQUE INDEX%(access_hash)'),
    'ไม่มี unique index บน access_hash';
  ASSERT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'oauth_tokens' AND indexdef LIKE 'CREATE UNIQUE INDEX%(refresh_hash)'),
    'ไม่มี unique index บน refresh_hash';
  ASSERT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'oauth_tokens' AND indexdef LIKE '%(user_id)'),
    'ไม่มี index บน user_id';
  -- รันซ้ำไม่สร้าง index ซ้ำ
  ASSERT (SELECT count(*) FROM pg_indexes WHERE tablename = 'oauth_tokens' AND indexdef LIKE '%(access_hash)') = 1,
    'index access_hash ซ้ำ';

  -- FK cascade: codes → clients/profiles · tokens → clients/profiles
  ASSERT (SELECT count(*) FROM pg_constraint
           WHERE contype = 'f' AND confdeltype = 'c'
             AND conrelid = 'oauth_codes'::regclass
             AND confrelid IN ('oauth_clients'::regclass, 'profiles'::regclass)) = 2,
    'oauth_codes ต้องมี FK cascade ไป oauth_clients และ profiles';
  ASSERT (SELECT count(*) FROM pg_constraint
           WHERE contype = 'f' AND confdeltype = 'c'
             AND conrelid = 'oauth_tokens'::regclass
             AND confrelid IN ('oauth_clients'::regclass, 'profiles'::regclass)) = 2,
    'oauth_tokens ต้องมี FK cascade ไป oauth_clients และ profiles';
END $$;

-- unique ใช้งานได้จริง + ลบผู้ใช้ / client แล้วแถวลูกหายตาม
INSERT INTO profiles (id) VALUES ('00000000-0000-0000-0000-0000000000a1');
INSERT INTO oauth_clients (client_id, client_name, redirect_uris) VALUES ('c1', 'Claude', ARRAY['https://claude.ai/api/mcp/auth_callback']);
INSERT INTO oauth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, expires_at)
  VALUES ('h-code', 'c1', '00000000-0000-0000-0000-0000000000a1', 'https://claude.ai/api/mcp/auth_callback', 'x', now() + interval '10 minutes');
INSERT INTO oauth_tokens (user_id, client_id, access_hash, refresh_hash, access_expires_at, refresh_expires_at)
  VALUES ('00000000-0000-0000-0000-0000000000a1', 'c1', 'h-a1', 'h-r1', now() + interval '1 hour', now() + interval '30 days');

DO $$
DECLARE
  failed BOOLEAN := false;
BEGIN
  BEGIN
    INSERT INTO oauth_tokens (user_id, client_id, access_hash, refresh_hash, access_expires_at, refresh_expires_at)
      VALUES ('00000000-0000-0000-0000-0000000000a1', 'c1', 'h-a1', 'h-r2', now(), now());
  EXCEPTION WHEN unique_violation THEN failed := true;
  END;
  ASSERT failed, 'access_hash ซ้ำได้';
  failed := false;
  BEGIN
    INSERT INTO oauth_tokens (user_id, client_id, access_hash, refresh_hash, access_expires_at, refresh_expires_at)
      VALUES ('00000000-0000-0000-0000-0000000000a1', 'c1', 'h-a2', 'h-r1', now(), now());
  EXCEPTION WHEN unique_violation THEN failed := true;
  END;
  ASSERT failed, 'refresh_hash ซ้ำได้';

  DELETE FROM profiles WHERE id = '00000000-0000-0000-0000-0000000000a1';
  ASSERT (SELECT count(*) FROM oauth_codes) = 0 AND (SELECT count(*) FROM oauth_tokens) = 0, 'ลบผู้ใช้แล้ว code/token ไม่หายตาม';
  ASSERT (SELECT count(*) FROM oauth_clients) = 1, 'ลบผู้ใช้แล้ว client หาย';
END $$;
SQL
echo "M1: ผ่าน"

echo "oauth-sql: ผ่านทั้งหมด"
