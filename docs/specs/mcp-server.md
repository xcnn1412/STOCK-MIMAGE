# MCP ให้ Claude อ่านระบบ (v1.38.0)

ให้พนักงานเปิด claude.ai / Claude Desktop แล้วเพิ่ม "custom connector" ชี้มาที่แอปนี้ Claude จะอ่านข้อมูลสต็อก อีเวนต์ และติดตามงาน **ได้เฉพาะโมดูลที่คนนั้นมีสิทธิ์** · ตัดสินใจกับเจ้าของ 2026-10-04 · สถานะ: **แผนล็อกแล้ว ยังไม่เริ่มทำ**
branch `feature/mcp-server` · migration `supabase/migrations/20261008_oauth_mcp.sql` · เวอร์ชัน MINOR

## Problem Statement

Claude บน claude.ai / Desktop เข้าถึงข้อมูลในระบบไม่ได้ ทางลัดคือ Supabase MCP แต่มันเห็นทุกตาราง (เงินเดือน การเงิน) จึงให้ได้เฉพาะเจ้าของ ต้องการทางที่พนักงานทั่วไปใช้ได้โดยเห็นข้อมูลเท่าที่สิทธิ์ในแอปอนุญาต และตรวจย้อนหลังได้ว่าใครดึงอะไร

## คำตัดสินของเจ้าของ (2026-10-04)

| เรื่อง | คำตอบ |
|---|---|
| ใครเชื่อมได้ | ทุกคนที่มีบัญชี (is_approved, ไม่ถูกบล็อก) เห็นเฉพาะโมดูลใน `allowed_modules` · admin เห็นว่าใครเชื่อมอยู่และตัดได้ |
| ข้อมูลรอบแรก | สต็อก (`stock`) + อีเวนต์ (`events`) + ติดตามงาน (`jobs`) · ไม่มีเงิน เงินเดือน ข้อมูลลูกค้า CRM |
| บันทึก | ทุกครั้งที่ Claude เรียก tool: ใคร เมื่อไร tool อะไร พารามิเตอร์ จำนวนแถว (ไม่เก็บข้อความแชต) |

ค่าที่ผู้วางแผนเลือกเอง (เจ้าของยังไม่ได้ยืนยัน):
- **อ่านอย่างเดียว** ทุก tool ไม่มี tool เขียน
- ยืนยันตัวตนด้วย **หน้าล็อกอินเดิม** (เบอร์โทร + PIN พร้อม lockout/rate limit เดิม) แล้วมีหน้า "อนุญาตให้ Claude เข้าถึง" — ไม่สร้างฟอร์ม PIN ชุดที่สอง
- access token อายุ 1 ชั่วโมง · refresh token 30 วัน หมุนใหม่ทุกครั้งที่ใช้ · token ของ MCP **ไม่ผูกกับกติกา session เดียว** ของเว็บ (ล็อกอินเว็บเครื่องอื่นไม่ตัด Claude) แต่ตัดทันทีเมื่อถูกบล็อก/ยกเลิกอนุมัติ/ยกเลิกการเชื่อมต่อ
- ผลลัพธ์ต่อ tool ไม่เกิน 100 แถว · จำกัด 60 ครั้ง/นาที/การเชื่อมต่อ
- ใบอนุญาตหมดอายุ (`getLicenseStatus`) → ทุก endpoint ของ OAuth/MCP ตอบ 403

## สถาปัตยกรรม

```
claude.ai ──(1) GET /api/mcp ไม่มี token → 401 + WWW-Authenticate: resource_metadata=…
          ──(2) GET /.well-known/oauth-protected-resource        → authorization_servers: [<origin>]
          ──(3) GET /.well-known/oauth-authorization-server      → endpoints + S256 + DCR
          ──(4) POST /api/oauth/register (DCR)                   → client_id
          ──(5) เปิดเบราว์เซอร์ /oauth/authorize?…  → proxy พาไป /login?next=… ถ้ายังไม่ล็อกอิน
                                                     → หน้ายินยอม (แสดงโมดูลที่ Claude จะเห็น) → code
          ──(6) POST /api/oauth/token (code + PKCE)              → access + refresh
          ──(7) POST /api/mcp (Bearer) initialize / tools/list / tools/call
```

- `/api/*` และ path ที่มีจุด (`/.well-known/*`) ไม่ผ่าน `proxy.ts` อยู่แล้ว → route handler ตรวจสิทธิ์เอง · `/oauth/authorize` ผ่าน session gate ของ proxy ตามปกติ (ไม่ต้องแก้ proxy) ไม่อยู่ใน `MODULE_ROUTES` จึงทุกคนที่ล็อกอินเข้าได้
- origin ของ URL ทุกตัว = `requestOrigin()` (`lib/request-origin.ts`) — ห้าม hard-code โดเมน
- ไลบรารี: ใช้ `mcp-handler` (web-standard handler + `withMcpAuth` + `protectedResourceHandler`) กับ peer `@modelcontextprotocol/server` (หรือ `@modelcontextprotocol/sdk` ถ้า peer ชุดนั้นติดตั้ง/คอมไพล์กับ Next 16 ไม่ได้ — Executor เลือกแล้วรายงาน) + `zod` สำหรับ schema ของ tool · **ห้ามเพิ่ม dependency อื่น**

### ฐานข้อมูล (`20261008_oauth_mcp.sql`, idempotent, RLS เปิดไม่มี policy)

- `oauth_clients(client_id text pk, client_name text, redirect_uris text[] not null, created_at)`
- `oauth_codes(code_hash text pk, client_id → oauth_clients cascade, user_id → profiles cascade, redirect_uri, code_challenge text, scope text, resource text, expires_at, used_at)`
- `oauth_tokens(id uuid pk, user_id → profiles cascade, client_id → oauth_clients cascade, client_name text, access_hash text unique, refresh_hash text unique, scope text, access_expires_at, refresh_expires_at, created_at, last_used_at, revoked_at)` + index `(user_id)`, `(access_hash)`, `(refresh_hash)`
- เก็บเฉพาะ **sha256** ของ code/token ไม่เก็บค่าจริง

### Server

- `lib/oauth.ts` (pure + db): `randomToken()` (32 bytes base64url), `sha256()`, `pkceMatches(verifier, challenge)`, `validRedirect(uri, registered)` (ต้องตรงทั้งสตริง · https เท่านั้น ยกเว้น `http://localhost` / `http://127.0.0.1` เมื่อ `NODE_ENV !== 'production'`), `issueCode`, `exchangeCode`, `refreshTokens` (หมุน refresh เก่า = revoked), `revokeToken`, `verifyAccessToken(token) → { userId, role, modules, tokenId } | null` (เช็ก hash, ไม่หมดอายุ, ไม่ revoked, profile is_approved && !is_blocked; `modules` = `allowed_modules ?? ['stock']` + admin ได้ทุกโมดูล — กติกาเดียวกับ proxy/`hasModule`)
- `lib/mcp-tools.ts`: ประกาศ tool ทั้งหมดเป็นข้อมูล `{ name, module, description, schema, run(db, args) }` ไม่ผูกไลบรารี MCP ให้ `api/mcp/route.ts` ลงทะเบียนเฉพาะ tool ที่ `modules` ของ token อนุญาต · ทุก run คืน `{ summary: string (ไทย 1 บรรทัด), rows: unknown[] }` ตัดที่ 100 แถว + บอกว่ามีอีกกี่แถว
- Tools รอบแรก (9 ตัว)

| tool | module | ทำอะไร (อ่านอย่างเดียว) |
|---|---|---|
| `stock_summary` | stock | นับอุปกรณ์ตามสถานะ · กระเป๋าออกงาน/จองไว้/ในคลัง (`kitShelfState`) · วัสดุสิ้นเปลืองใกล้หมด (`loadShelfHealth`) |
| `search_items` | stock | ค้นอุปกรณ์ตามชื่อ/serial/หมวด/สถานะ/เฉพาะวัสดุสิ้นเปลือง · บอกกระเป๋าและชั้นที่อยู่ |
| `low_stock` | stock | วัสดุสิ้นเปลืองระดับ out/low พร้อมเหลือบนชั้น หน่วย ชั้น |
| `kit_status` | stock | กระเป๋าทุกใบหรือตามชื่อ: สถานะ, ชั้น, งานที่จอง, `packState` (นำออก x/y, ขาดชิ้นไหน) |
| `shelf_contents` | stock | ของบนชั้นตามรหัสชั้น + ผลตรวจนับล่าสุด |
| `upcoming_events` | events | อีเวนต์ที่ยังไม่ปิดใน N วัน: วัน เวลา สถานที่ กระเป๋าที่จอง จัดครบหรือยัง |
| `event_detail` | events | อีเวนต์หนึ่งงาน (id หรือชื่อ): กระเป๋า ของในกระเป๋า สถานะ ทีมงาน |
| `event_closures` | events | ประวัติปิดงานในช่วงวันที่: ของเสีย/หาย วัสดุสิ้นเปลืองที่ใช้ |
| `job_readiness` | jobs | งานที่ยังไม่พร้อมจาก `getTrackingSnapshot`: ลูกค้า วันงาน สิ่งที่ยังขาด (`missingLabel`) |

- `app/api/mcp/route.ts`: `withMcpAuth(handler, verifyAccessToken, { required: true, resourceMetadataPath: '/.well-known/oauth-protected-resource' })` · ทุก tools/call: rate limit (`checkRateLimit(\`mcp:${tokenId}\`)` ปรับ limit 60/นาที) → run → `logActivity('MCP_TOOL_CALL', { tool, args, rows }, undefined, userId)` → อัปเดต `last_used_at` (ไม่เกินนาทีละครั้ง) · error ของ tool คืนเป็น `isError: true` ข้อความไทย ไม่ throw
- `app/.well-known/oauth-protected-resource/route.ts` (+ variant path `/api/mcp`), `app/.well-known/oauth-authorization-server/route.ts`, `app/api/oauth/{register,token,revoke}/route.ts` — ทุกตัวตอบ CORS preflight (`OPTIONS`) และ JSON ตาม RFC 8414 / 9728 / 7591
- `app/oauth/authorize/page.tsx` (server, นอก `(authenticated)` เพื่อไม่มี sidebar; proxy บังคับล็อกอินให้แล้ว): ตรวจ `client_id`, `redirect_uri`, `code_challenge_method=S256`, `response_type=code`, `state`, `resource` → แสดงชื่อ client, โมดูลที่ Claude จะเห็น (ตัดจาก `allowed_modules` ∩ {stock, events, jobs}; ว่าง = บอกว่าไม่มีโมดูลที่ใช้ได้และไม่ให้กดอนุญาต) + รายการการเชื่อมต่อเดิมของตัวเอง · ปุ่ม **อนุญาต** → server action `grantAuthorization` → `logActivity('MCP_CONNECT')` → redirect `redirect_uri?code&state` · **ปฏิเสธ** → redirect `?error=access_denied&state`
- `app/(authenticated)/connected-apps/page.tsx` + `connected-apps-view.tsx`: ทุกคนเห็นการเชื่อมต่อของตัวเอง (client, สร้างเมื่อ, ใช้ล่าสุด, ปุ่มยกเลิก) · admin เห็นทุกคน · ลิงก์จาก sidebar ล่าง (ข้าง "มีอะไรใหม่") · ไม่อยู่ใน `MODULE_ROUTES` (ตั้งใจ)
- `lib/logger.ts`: `MCP_CONNECT`, `MCP_REVOKE`, `MCP_TOOL_CALL`
- `lib/dictionary.ts`: คีย์ของหน้า connected-apps และ sidebar (th + en)

## ไม่ทำในรอบนี้

tool เขียนข้อมูล · โมดูลเงิน/เงินเดือน/CRM/เอกสาร · scope ย่อยกว่าโมดูล · อนุมัติการเชื่อมต่อโดย admin · Claude Code/Cursor config ตัวอย่าง (ใช้ connector เดียวกันได้อยู่แล้ว) · prompts/resources ของ MCP (มีแต่ tools)

## Agent loop (ตาม CLAUDE.md)

Planner/Critic = Fable · Executor = Agent `model: opus` agent ใหม่ต่อแพ็กเกจ · ทำทีละแพ็กเกจ · รอบแก้ส่งเฉพาะ `failures`

การตรวจของ Critic: เช็กสคริปต์ที่รัน **route handler จริง** ด้วย `Request` web-standard กับฐานข้อมูลจำลองในหน่วยความจำ (เทคนิคเดียวกับ `scripts/proxy-session.check.ts`) · migration ทดสอบบน postgres:17 (เทคนิคเดียวกับ `scripts/consumables-sql.check.sh`) · tsc baseline 1 error · lint ไฟล์ใหม่ 0 error · `next build` ตอนจบ · **การเชื่อมกับ claude.ai จริงต้องทำโดยเจ้าของหลัง deploy** (ต้องมี URL สาธารณะ) — Critic ทดสอบได้ถึง MCP Inspector/สคริปต์ client ในเครื่องเท่านั้น

กติกา Executor: ไม่รัน `next build` · ไม่เปิด dev server · ไม่ commit · ไม่แตะ prod · ไม่แตะไฟล์นอกรายการ · ไม่แก้ `proxy.ts`/`MODULE_ROUTES` · ห้ามใช้ `any` / `eslint-disable` ในไฟล์ใหม่

```json
{
  "plan": [
    "WP0 (Critic): แตก feature/mcp-server · baseline tsc · ติดตั้ง dependency ที่ Executor เสนอหลังตรวจ compat",
    "WP1 OAuth server: migration + scripts/oauth-sql.check.sh · lib/oauth.ts + scripts/oauth-flow.check.ts · routes .well-known ×2, api/oauth ×3 · หน้า /oauth/authorize + action · logger types",
    "WP2 MCP: lib/mcp-tools.ts (9 tools + lib/mcp-tools.check.ts ด้วย db จำลอง) · app/api/mcp/route.ts (withMcpAuth, rate limit, MCP_TOOL_CALL) · scripts/mcp-e2e.check.ts (initialize → tools/list ตามโมดูล → tools/call → 401/403)",
    "WP3 UI + release: /connected-apps + sidebar link + ส่วน admin ใน /settings · dictionary · docs/mcp-setup.md (คู่มือเพิ่ม connector ภาษาไทยพร้อม URL) · package.json 1.38.0 · whats-new",
    "ปิดงาน (Critic): รันทุกเช็ก · MCP Inspector ต่อ dev server (ถ้าทำได้โดยไม่ล็อกอินเป็นเจ้าของ) · next build · tag v1.38.0 · merge --no-ff · ไม่ push · แจ้งเจ้าของ: รัน migration → deploy → เพิ่ม connector ตามคู่มือ"
  ],
  "acceptance_criteria": [
    { "id": "M1", "wp": 1, "blocking": true, "check": "`bash scripts/oauth-sql.check.sh` รัน migration 2 รอบบน postgres:17 ไม่ error; มี 3 ตาราง RLS เปิดไม่มี policy; unique บน access_hash/refresh_hash; FK cascade ตามสเปค; บรรทัดสุดท้าย `oauth-sql: ผ่านทั้งหมด`" },
    { "id": "M2", "wp": 1, "blocking": true, "check": "scripts/oauth-flow.check.ts รัน route handler จริง: (a) DCR คืน client_id และบันทึก redirect_uris; redirect_uri แบบ http ที่ไม่ใช่ localhost ถูกปฏิเสธ (b) token exchange: code ถูก + verifier ถูก → access/refresh; verifier ผิด → 400 invalid_grant; code ใช้ซ้ำ → 400 และ token ชุดแรกถูก revoke; redirect_uri ไม่ตรง → 400; code หมดอายุ (>10 นาที) → 400 (c) refresh: ได้คู่ใหม่ refresh เก่าใช้ซ้ำ → 400 (d) revoke แล้ว verifyAccessToken คืน null (e) ผู้ใช้ is_blocked / is_approved=false → verifyAccessToken null แม้ token ยังไม่หมดอายุ (f) ฐานข้อมูลไม่มีค่า token จริง มีแต่ sha256 (g) license หมดอายุ → token endpoint 403; บรรทัดสุดท้าย `oauth-flow: ผ่านทั้งหมด`" },
    { "id": "M3", "wp": 1, "blocking": true, "check": "GET /.well-known/oauth-authorization-server คืน issuer=origin, authorization_endpoint=<origin>/oauth/authorize, token_endpoint, registration_endpoint, revocation_endpoint, code_challenge_methods_supported=['S256'], grant_types=['authorization_code','refresh_token'], response_types=['code']; GET /.well-known/oauth-protected-resource (และ /api/mcp variant) คืน resource=<origin>/api/mcp และ authorization_servers=[origin]; origin มาจาก requestOrigin() (ทดสอบด้วย x-forwarded-host/proto); ทั้งหมดตอบ OPTIONS ด้วย CORS headers" },
    { "id": "M4", "wp": 1, "check": "หน้า /oauth/authorize: พารามิเตอร์ขาด/ไม่ตรง (client_id ไม่รู้จัก, redirect_uri ไม่ตรง, method ไม่ใช่ S256) → แสดง error ไม่มีปุ่มอนุญาต และไม่ redirect ไป redirect_uri ที่ไม่รู้จัก; ผู้ใช้ไม่มีโมดูล stock/events/jobs → ไม่มีปุ่มอนุญาต; grantAuthorization ตรวจ requireAuth + พารามิเตอร์ซ้ำฝั่ง server, ออก code อายุ 10 นาที, logActivity MCP_CONNECT; ปฏิเสธ → redirect error=access_denied พร้อม state" },
    { "id": "M5", "wp": 2, "blocking": true, "check": "lib/mcp-tools.ts มี 9 tools ตามตาราง แต่ละตัวมี module, zod schema, description ภาษาไทย; lib/mcp-tools.check.ts (db จำลอง) ตรวจทุก tool: คืน summary ไทย + rows; ตัดที่ 100 แถวและบอกจำนวนที่เหลือ; search_items ไม่คืนคอลัมน์ pin/price-ไม่จำเป็น; ไม่มี tool ใดเรียก insert/update/delete/rpc ที่เขียน (grep ใน lib/mcp-tools.ts ไม่เจอ .insert( .update( .delete( .upsert( และ rpc ที่ไม่ใช่อ่าน)" },
    { "id": "M6", "wp": 2, "blocking": true, "check": "scripts/mcp-e2e.check.ts เรียก app/api/mcp/route.ts ด้วย JSON-RPC: (a) ไม่มี Bearer → 401 มี WWW-Authenticate ที่มี resource_metadata ชี้ /.well-known/oauth-protected-resource (b) token ของผู้ใช้ stock-only: initialize สำเร็จ, tools/list มีเฉพาะ 5 tool ของ stock, tools/call job_readiness → error isError ข้อความไทย ไม่รัน (c) admin เห็นครบ 9 (d) tools/call สำเร็จแล้วมี activity_logs MCP_TOOL_CALL ที่มี tool, args, rows และ user_id ถูกต้อง (e) เรียกเกิน 60 ครั้ง/นาที → isError บอกให้รอ (f) token หมดอายุ → 401; บรรทัดสุดท้าย `mcp-e2e: ผ่านทั้งหมด`" },
    { "id": "M7", "wp": 2, "check": "last_used_at ของ token ถูกอัปเดตเมื่อ tools/call แต่ไม่เกินนาทีละครั้ง; tool ที่ throw ถูกจับเป็น isError (ไม่ 500); ขนาด response ต่อ tool ไม่เกิน ~64KB (ตัดแถวให้พอ)" },
    { "id": "M8", "wp": 3, "check": "/connected-apps: ผู้ใช้ทั่วไปเห็นเฉพาะ token ของตน (ยังไม่ revoke, refresh ยังไม่หมดอายุ) พร้อม client_name, created_at, last_used_at, ปุ่มยกเลิก; admin เห็นทุกคนพร้อมชื่อผู้ใช้; revokeConnection ตรวจว่าเป็นเจ้าของหรือ admin, logActivity MCP_REVOKE; sidebar มีลิงก์ข้าง มีอะไรใหม่; หน้าใช้ t() ทั้งหมด" },
    { "id": "M9", "wp": 3, "check": "docs/mcp-setup.md เป็นภาษาไทย: ขั้นตอนเพิ่ม connector ใน claude.ai และ Claude Desktop ด้วย URL `<โดเมน>/api/mcp`, สิ่งที่จะเห็นในหน้าอนุญาต, วิธียกเลิกที่ /connected-apps, ตัวอย่างคำถาม 5 ข้อ; package.json = 1.38.0; UPDATES[0] tag 'ใหม่' module 'สต็อก' date = `date +%F` ไทยไม่มีศัพท์เทคนิค (คำว่า Claude และ MCP ใช้ได้)" },
    { "id": "M10", "wp": "ทุกแพ็กเกจ", "blocking": true, "check": "`npx tsc --noEmit --incremental false` เหลือ baseline 1 error; eslint ของไฟล์ใหม่/ที่แตะ = 0 error; ไม่มี any / eslint-disable ในไฟล์ใหม่; proxy.ts, lib/nav-config.ts MODULE_ROUTES ไม่มี diff; dependency ที่เพิ่มมีแค่ mcp-handler (+peer ที่มันต้องการ) และ zod; consumable-logic / shelf-logic / room-logic / proxy-session check exit 0" },
    { "id": "M11", "wp": "ทุกแพ็กเกจ", "blocking": true, "check": "ความปลอดภัย: ทุก route ใต้ /api/oauth และ /api/mcp เรียก getLicenseStatus และตอบ 403 เมื่อหมดอายุ; token endpoint ไม่รับ grant_type อื่น; register จำกัด redirect_uris ≤ 10 และ client_name ≤ 100 ตัวอักษร; code/token เทียบด้วย hash เท่านั้น; ไม่มี console.log ค่า token; ไม่มี endpoint ใดใช้ supabase anon client" }
  ],
  "pass_threshold": 0.9
}
```

## หลัง merge — ของเจ้าของ

1. รัน `supabase/migrations/20261008_oauth_mcp.sql` บน prod **ก่อน** deploy
2. deploy (Railway ต้องส่ง `x-forwarded-host` / `x-forwarded-proto` — หน้า QR ใช้อยู่แล้วจึงมั่นใจได้)
3. เปิด claude.ai → Settings → Connectors → Add custom connector → URL `https://<โดเมน>/api/mcp` → ล็อกอินด้วยเบอร์โทร+PIN → กดอนุญาต → ถาม "ของอะไรใกล้หมดบ้าง"
4. ตรวจที่ `/connected-apps` และหน้า logs ว่ามีรายการ MCP_CONNECT / MCP_TOOL_CALL
