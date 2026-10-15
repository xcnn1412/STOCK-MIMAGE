# MCP Personal Access Token — ใช้กับ Ollama และโปรแกรมที่ทำ OAuth ไม่ได้ (แผน 2026-10-16)

สถานะ: **แผน ยังไม่ลงมือ** · ต่อยอดจาก `docs/specs/mcp-server.md` (v1.38–1.39, deploy แล้ว) · เวอร์ชัน MINOR (v1.65.0) · branch `feature/mcp-personal-token`

## Problem Statement

MCP server ของระบบ (`/api/mcp`) รับเฉพาะ **OAuth 2.1 + Dynamic Client Registration + เบราว์เซอร์** ซึ่งเหมาะกับ claude.ai / ChatGPT / Gemini / Claude Code แต่ **Ollama ไม่มี MCP client ในตัว** (ณ ต.ค. 2026 ยังเป็น feature request) การใช้โมเดลบน Ollama กับ MCP ต้องผ่านโปรแกรมตัวกลาง เช่น `ollmcp` (mcp-client-for-ollama), `ollama-mcp-bridge`, Open WebUI ฯลฯ ซึ่งส่วนใหญ่ **รับได้แค่ URL + header** ไม่เปิดเบราว์เซอร์ทำ OAuth ได้

ต้องการให้ผู้ใช้สร้าง **token ส่วนตัวแบบอายุยาว** จากหน้าเว็บ แล้วเอาไปใส่เป็น `Authorization: Bearer <token>` ในโปรแกรมตัวกลางเหล่านั้น โดยสิทธิ์ การบันทึก และการยกเลิก **เหมือนการเชื่อมต่อผ่าน OAuth ทุกประการ**

## หลักคิด (ประหยัดสุด — ไม่แตะ `/api/mcp` และ `verifyAccessToken` เลย)

token ส่วนตัว = **แถวใน `oauth_tokens` เดิม** ที่ `client_id = 'personal-token'` และ `access_expires_at` ยาว → `verifyAccessToken` / rate limit / `MCP_TOOL_CALL` / หน้า "แอปที่เชื่อมต่อ" / ปุ่มยกเลิก / ตัดเมื่อถูกบล็อก ทำงานได้ทันทีโดยไม่แก้โค้ด

| เรื่อง | ค่าที่เลือก (เจ้าของยืนยัน/แก้ได้) |
|---|---|
| ใครสร้างได้ | ทุกคนที่ล็อกอิน (is_approved, ไม่ถูกบล็อก) — เหมือน OAuth · token เห็นเฉพาะโมดูลของคนนั้น |
| อายุ | **1 ปี** (ผู้ใช้เลือกสั้นกว่าได้: 30 วัน / 90 วัน / 1 ปี) · ไม่มี refresh · หมดแล้วสร้างใหม่ |
| จำนวนต่อคน | สูงสุด **5 token ที่ยังใช้ได้** (กันสร้างทิ้งขว้าง) |
| รูปแบบ | `stk_` + 32 bytes base64url (`randomToken()` เดิม) — prefix ให้รู้ว่าเป็นของระบบนี้เวลาเจอหลุด · DB เก็บ sha256 เท่านั้น เหมือนเดิม |
| แสดงค่าจริง | **ครั้งเดียว** ตอนสร้าง (กล่องคัดลอก) หลังปิดไม่มีทางดูอีก |
| ชื่อ | ผู้ใช้ตั้งเอง 1–60 ตัวอักษร (เช่น "Ollama โน้ตบุ๊กต้น") → `client_name` → ขึ้นในหน้าแอปที่เชื่อมต่อ |
| ยกเลิก | ปุ่มเดิมในหน้าแอปที่เชื่อมต่อ (`revokeConnection`) · แอดมินเห็น/ตัดได้ทุกคนเหมือนเดิม |
| บันทึก | `MCP_TOKEN_CREATE` (ActionType ใหม่) ตอนสร้าง · การเรียก tool ใช้ `MCP_TOOL_CALL` เดิม |
| scope / สิทธิ์ | `mcp:read` อ่านอย่างเดียว เหมือนเดิม — ไม่มี token เขียน |
| client แม่ | แถว `oauth_clients(client_id='personal-token', client_name='Personal access token', redirect_uris='{}')` — **upsert ตอนสร้าง token ครั้งแรก** ไม่ต้องมี migration |

สิ่งที่**ไม่ทำ**: scope ย่อยต่อ token (เลือกเฉพาะบางโมดูล) · token ของทีม/บริษัท (ไม่ผูกคน) · IP allowlist · หน้าดูสถิติการใช้ต่อ token — รอจนมีคนขอ

## สถาปัตยกรรม

```
ผู้ใช้  ──► /connected-apps  ปุ่ม "สร้าง token ส่วนตัว" → Dialog (ชื่อ · อายุ) → server action createPersonalToken
                                                       → แสดง stk_… ครั้งเดียว + ปุ่มคัดลอก + ตัวอย่าง config
ollmcp ──► POST /api/mcp  Authorization: Bearer stk_…   → verifyAccessToken เดิม (hash ตรง · ไม่หมดอายุ · ไม่ revoke · profile ผ่าน)
```

### ไฟล์ที่แตะ

| ไฟล์ | งาน |
|---|---|
| `lib/oauth.ts` | เพิ่ม `PERSONAL_CLIENT_ID = 'personal-token'`, `PERSONAL_TOKEN_PREFIX = 'stk_'`, `PERSONAL_TTL_DAYS = [30, 90, 365]`, `MAX_PERSONAL_TOKENS = 5` และ `issuePersonalToken(db, { userId, name, ttlDays })` → upsert client แม่ → นับ token ที่ยังใช้ได้ของคนนี้ (`client_id = PERSONAL_CLIENT_ID`, `revoked_at is null`, `access_expires_at > now`) ≥ 5 = error → insert แถว (access = refresh = หมดอายุพร้อมกัน, `refresh_hash` = sha256 ของค่าสุ่มที่ทิ้งไป เพราะคอลัมน์ NOT NULL unique) → คืนค่าจริงครั้งเดียว · **ห้ามแก้ `verifyAccessToken`** |
| `app/(authenticated)/connected-apps/actions.ts` | `createPersonalToken(input)` — `requireAuth` → ตรวจชื่อ (trim 1–60) และ ttl ∈ รายการ → `issuePersonalToken` → `logActivity('MCP_TOKEN_CREATE', { tokenId, name, ttlDays })` → `revalidatePath` → `{ token, expiresAt }` หรือ `{ error }` |
| `app/(authenticated)/connected-apps/connected-apps-view.tsx` | ปุ่ม "สร้าง token ส่วนตัว" (header ขวา) · `CreateTokenDialog` (ชื่อ · อายุ 3 ตัวเลือก · ปุ่มสร้าง) → หน้าผลลัพธ์ในกล่องเดียวกัน: token ตัวเต็มใน `<code>` + ปุ่มคัดลอก (fallback เลือกข้อความเมื่อคลิปบอร์ดใช้ไม่ได้ แบบ `CopyTextDialog` ของจัดซื้อ) + คำเตือน "เห็นครั้งเดียว" + ลิงก์คู่มือ Ollama · แถวในรายการ: ป้าย "token ส่วนตัว" เมื่อ `clientId === 'personal-token'` (เพิ่มฟิลด์ `kind` ใน `ConnectionRow`) · เปลี่ยน `confirm()` เดิมเป็น AlertDialog ถ้าแตะส่วนนั้นอยู่แล้ว (ไม่บังคับ) |
| `app/(authenticated)/connected-apps/page.tsx` | select เพิ่ม `client_id` → `kind: 'personal' \| 'oauth'` · เรียงให้ token ส่วนตัวอยู่กลุ่มเดียวกัน (ไม่บังคับ) |
| `lib/dictionary.ts` | ข้อความไทย/อังกฤษชุด `connectedApps.personal*` (ปุ่ม, ชื่อ dialog, label อายุ, คำเตือนเห็นครั้งเดียว, คัดลอกแล้ว, เพดาน 5) |
| `lib/logger.ts` | `ActionType` เพิ่ม `'MCP_TOKEN_CREATE'` |
| `docs/mcp-setup.md` | หัวข้อใหม่ "Ollama (ผ่าน ollmcp)" + "โปรแกรมที่รับแค่ URL + header" (ด้านล่าง) |
| `app/(authenticated)/whats-new/updates.ts` | entry 'ใหม่' โมดูล 'แอปที่เชื่อมต่อ' |
| `scripts/mcp-e2e.check.ts` (ขยาย) หรือ `scripts/mcp-personal-token.check.ts` (ใหม่, ใช้ `mcp-fake-db`) | เคส T1–T7 ด้านล่าง |

### คู่มือฝั่ง Ollama (ร่างสำหรับ `docs/mcp-setup.md`)

> Ollama ไม่มี MCP client ในตัว ต้องใช้โปรแกรมตัวกลาง — แนะนำ `ollmcp` (ติดตั้ง `pip install mcp-client-for-ollama` หรือ `uvx ollmcp`)

1. เว็บระบบ → **แอปที่เชื่อมต่อ** → **สร้าง token ส่วนตัว** → ตั้งชื่อ (เช่น `Ollama โน้ตบุ๊ก`) → คัดลอก `stk_…` เก็บไว้ (เห็นครั้งเดียว)
2. สร้างไฟล์ `stock-mcp.json`:
   ```json
   {
     "mcpServers": {
       "stock": {
         "type": "streamable_http",
         "url": "https://<โดเมนของระบบ>/api/mcp",
         "headers": { "Authorization": "Bearer stk_…" }
       }
     }
   }
   ```
3. รัน `ollmcp --servers-json stock-mcp.json --model qwen3:8b` (เลือกโมเดลที่รองรับ tool calling) แล้วถามเป็นภาษาไทยได้เลย
4. โปรแกรมอื่นที่รับ URL + header (ollama-mcp-bridge `UPSTREAM_HEADERS`, Open WebUI ผ่าน mcpo, LM Studio) ใช้ token เดียวกันใส่ header `Authorization: Bearer stk_…`
5. เครื่องหาย/สงสัยหลุด → ยกเลิกที่หน้าแอปที่เชื่อมต่อ token นั้นใช้ไม่ได้ทันที

หมายเหตุใน docs: ชื่อ flag/คีย์ของ `ollmcp` ให้ Executor ตรวจกับ README รุ่นล่าสุดตอนลงมือ (ค่าในแผนนี้มาจากเอกสาร ต.ค. 2026 ยังไม่ได้ทดสอบจริง) และย้ำว่าโมเดลเล็กบางตัวเรียก tool ไม่เก่ง

## เกณฑ์รับงาน (lock)

| id | เกณฑ์ (วัดได้) |
|---|---|
| AC1 | `issuePersonalToken` คืน token ขึ้นต้น `stk_` ยาว ≥ 40 ตัวอักษร · DB มีแค่ `access_hash = sha256(token)` ไม่มีค่าจริง (ตรวจ `fake.tables.oauth_tokens` ทุกคอลัมน์ไม่มีสตริง token) |
| AC2 | แถวที่สร้าง: `client_id = 'personal-token'`, `client_name` = ชื่อที่ตั้ง, `scope = 'mcp:read'`, `access_expires_at` = now + ttl ± 5 วินาที, `refresh_expires_at = access_expires_at`, `code_hash = null`, `revoked_at = null` และ `oauth_clients` มีแถว `personal-token` (upsert ซ้ำไม่ error) |
| AC3 | POST `/api/mcp` ด้วย `Bearer stk_…` ที่เพิ่งสร้าง → `tools/list` ได้เฉพาะ tool ของโมดูลผู้ใช้ และ `tools/call` ผ่าน + มี `activity_logs` `MCP_TOOL_CALL` (รัน route ตัวจริงแบบ `mcp-e2e.check.ts`) — **โดยไม่แก้ `app/api/mcp/route.ts` และ `verifyAccessToken`** (diff ของสองจุดนี้ต้องว่าง) |
| AC4 | token ที่ `revoked_at` ถูกตั้ง / `access_expires_at` ผ่านไปแล้ว / profile `is_blocked` หรือ `is_approved=false` → 401 ทั้ง 3 กรณี |
| AC5 | ต่อผู้ใช้มี token ส่วนตัวที่ยังใช้ได้ครบ 5 → `createPersonalToken` คืน `{ error }` ที่มีข้อความบอกเพดาน 5 · token ที่ revoke/หมดอายุแล้วไม่นับ (revoke 1 ใบแล้วสร้างได้) |
| AC6 | ชื่อว่าง/เกิน 60/ไม่ใช่สตริง, ttl นอกรายการ [30, 90, 365], ไม่ได้ล็อกอิน → `{ error }` ไม่เขียน DB (จำนวน `fake.writes` ที่ตาราง `oauth_tokens` เป็น 0) |
| AC7 | `createPersonalToken` สำเร็จ → `activity_logs` มี `MCP_TOKEN_CREATE` ของ `userId` นั้นพร้อม `tokenId`, `name`, `ttlDays` และ **ไม่มี** token จริงใน details |
| AC8 | หน้า `/connected-apps` (static render `ConnectedAppsView`) แสดง token ส่วนตัวด้วยป้าย "token ส่วนตัว" และปุ่มยกเลิกเดิม · `revokeConnection` ของเจ้าของและของแอดมินทำงานกับแถว personal ได้ (เคสเดิมผ่าน + เคสใหม่) |
| AC9 | Dialog สร้าง token: หลังสำเร็จแสดงค่า token ครั้งเดียวพร้อมปุ่มคัดลอก และข้อความเตือน "เห็นครั้งเดียว" (ตรวจจาก static render ของสถานะ "created" ว่ามีสตริง token และข้อความเตือน) · ปิดแล้ว state token ถูกล้าง (ไม่เก็บใน URL / localStorage) |
| AC10 | `docs/mcp-setup.md` มีหัวข้อ Ollama (ollmcp) พร้อม JSON config ตัวอย่างที่ header เป็น `Authorization: Bearer stk_…` และขั้นยกเลิก · What's New มี entry · `lib/dictionary.ts` มีทั้ง th และ en สำหรับทุกข้อความใหม่ (ไม่มี hardcode ไทยใน view) |
| AC11 | `npx tsc --noEmit --incremental false` = 1 error เดิม (`check-update-view.tsx`) · eslint ไฟล์ที่แตะไม่มี error เพิ่ม · ชุดตรวจเดิมผ่านครบ: `scripts/oauth-flow.check.ts`, `scripts/mcp-e2e.check.ts`, `lib/mcp-tools.check.ts`, `scripts/proxy-session.check.ts` |

`pass_threshold`: 0.9 — AC3 และ AC4 เป็นเกณฑ์ความปลอดภัย ต้องผ่านเสมอไม่ว่าคะแนนรวมเท่าไร

## ลำดับลงมือ (Executor 1 ตัว · branch เดียว · 2 commit)

1. **commit A — ฝั่ง server + ชุดตรวจ**: `lib/oauth.ts::issuePersonalToken` · `actions.ts::createPersonalToken` · `logger.ts` ActionType · `scripts/mcp-personal-token.check.ts` (T1 สร้างแล้วเรียก `/api/mcp` ผ่าน · T2 revoke → 401 · T3 หมดอายุ → 401 · T4 ถูกบล็อก → 401 · T5 เพดาน 5 · T6 input ผิด ไม่เขียน DB · T7 log ไม่มี token จริง) → รัน `oauth-flow` / `mcp-e2e` เดิมด้วย
2. **commit B — UI + docs + release**: view + page + dictionary + docs/mcp-setup.md + What's New + bump `1.65.0` + tag + merge `--no-ff` · static render หน้า connected-apps 2 สถานะ (รายการมี personal · dialog หลังสร้าง) ที่ 390px และ 1100px
3. ยังไม่ push จนกว่าเจ้าของสั่ง · **ไม่มี migration** ให้รันบน prod

## คำถามถึงเจ้าของ (ไม่ตอบ = ใช้ค่าในตาราง)

1. อายุ token เริ่มต้น 1 ปี โอเคไหม หรืออยากบังคับสั้นกว่า (เช่น สูงสุด 90 วัน)
2. ให้ **ทุกคน** สร้าง token ส่วนตัวได้ (เหมือน OAuth) หรือเฉพาะแอดมินสร้างให้
3. โปรแกรมตัวกลางฝั่ง Ollama ที่จะใช้จริงคือตัวไหน (ollmcp / Open WebUI / อื่น) — คู่มือจะเขียนให้ตรงตัวนั้นและทดสอบกับตัวนั้นหลัง deploy

## ความเสี่ยง

- token อายุยาวที่หลุด = อ่านข้อมูลได้ตามสิทธิ์คนนั้นจนกว่าจะยกเลิก — ลดด้วย prefix `stk_` (หาเจอง่ายเวลาสแกน repo/แชต), แสดงครั้งเดียว, `last_used_at` ในหน้าแอปที่เชื่อมต่อ, แอดมินตัดได้
- `mcp-fake-db.ts` ต้องรองรับ `upsert` บน `oauth_clients` (ถ้ายังไม่มี Executor เพิ่มใน fake db พร้อม test) — หรือเลี่ยงด้วย `select → insert เมื่อไม่พบ` ซึ่ง fake db รองรับอยู่แล้ว
- `ollmcp` เปลี่ยนชื่อ flag ได้ตลอด — คู่มือระบุรุ่นที่ตรวจและมีย่อหน้า "ติดปัญหา" ชี้ไปที่ README ของโปรแกรม
