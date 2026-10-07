# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Next.js dev server → http://localhost:3000 (Turbopack by default in Next 15+)
npm run build    # Production build (plain `next build` — no --turbopack flag is passed)
npm run start    # Run the production build
npm run lint     # ESLint (next/core-web-vitals + next/typescript)
npx tsc --noEmit # Type-check without emitting (no test runner is configured)
```

There is no test suite. `.env.local` must contain `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `LICENSE_EXPIRES_AT`, and `LICENSE_EXPIRED_REDIRECT_URL`. `next.config.ts` sets `typescript.ignoreBuildErrors: true` — this is a deliberate workaround for OOM on Windows, **not** a license to merge code with TS errors; always validate with `npx tsc --noEmit`.

One-off operational scripts live in `scripts/` (e.g., `create-admin.js`, `hash-existing-pins.ts`, `revert-rls.ts`, `seed-advance-test.ts`). They are not wired to `package.json` — invoke them directly via `node` / `tsx` as needed.

### ชุดตรวจ (ไม่มี test runner — ใช้สคริปต์ `*.check.ts`)

ทุกโมดูลสำคัญมีชุดตรวจแบบไม่แตะฐานข้อมูลจริง รันด้วย `npx tsx <ไฟล์>` บรรทัดสุดท้ายต้องเป็น `<ชื่อ>: ผ่านทั้งหมด` (อ่าน header ของแต่ละไฟล์ก่อน — บางตัวแตะ DB จริง เช่น `scripts/salary-check.ts`, `scripts/mcp-e2e.check.ts`, `scripts/tracking-snapshot-check.ts`):
- กติกาบริสุทธิ์ข้างไฟล์: `app/(authenticated)/finance/*.check.ts`, `crm/types.check.ts`, `salary/compute-event-schedule.check.ts`, `jobs/**/*-logic.check.ts`, `shelves/*-logic.check.ts`, `reports/report-stats.check.ts`, `lib/finance/*.check.ts`, `packing/packing-logic.check.ts`, `packing/usage-logic.check.ts`, `packages/package-logic.check.ts`, `stock/settings/category-logic.check.ts`
- flow กับฐานข้อมูลจำลองในหน่วยความจำ (ดัก `Module._load` แทน `next/*`, `@/lib/supabase-server`, `@/lib/logger`): `scripts/finance-*.check.ts`, `scripts/claim-*.check.ts`, `scripts/crm-leads-load.check.ts`, `scripts/purchasing-flow.check.ts`, `scripts/salary-edit-flow.check.ts`, `scripts/layout-requests.check.ts`, `scripts/session-hardening.check.ts`, `scripts/proxy-session.check.ts`, `scripts/packing-flow.check.ts` (ใบจัดของทั้งเส้น เลือกของ → คืนชั้น)
- static render เทียบ HTML: `scripts/crm-lead-detail-render.check.ts` (หน้า lead 3 ชุดข้อมูล + การ์ดการเงินโหมดแก้ไข) — แก้ส่วนแสดงผลที่ไม่ตั้งใจเปลี่ยนหน้าตา ให้ render ก่อน/หลังแล้ว `cmp` ต้องเท่ากันทุกไบต์ · อุปกรณ์: `scripts/packing-render.check.ts`, `scripts/package-picker-render.check.ts`, `scripts/packages-render.check.ts`, `scripts/usage-render.check.ts`, `scripts/stock-settings-render.check.ts`

**ฐานข้อมูลจำลองมีรายการคอลัมน์ของแต่ละตาราง (SCHEMA) และตัดผลที่ 1,000 แถวเหมือน PostgREST** — เพิ่มคอลัมน์ใน select ของโค้ดจริงแล้วต้องเติมใน SCHEMA ของสคริปต์ที่เกี่ยว ไม่งั้นชุดตรวจล้ม (เคยพลาดกับ `events.event_time` ใน finance-access/finance-integrity) และเปลี่ยนกติกาธุรกิจ (เช่น บล็อกเบิกเมื่อมีใบค้าง) ต้องไล่แก้ fixture ที่คาดผลเดิม · หลังแก้โมดูลไหน ให้รันชุดตรวจทุกตัวที่ import ไฟล์นั้น (grep path ใน `scripts/`)

**Baseline ที่ใช้เทียบ:** `npx tsc --noEmit --incremental false` = error เดิม 1 จุด (`check-update-view.tsx`) · eslint: โฟลเดอร์ `kits`, `events`, `crm` ต้องเป็น 0 ปัญหา (ทั้ง error และ warning) ตลอด ส่วนที่เหลือมี error เก่าราว 300 จุด กติกาคือ "ไฟล์ที่แตะต้องไม่มี error เพิ่ม" · นับ eslint จากบรรทัดสรุป `✖ N problems` หรือ `-f json` — อย่า grep path ด้วย `^[^:]*:` เพราะ drive letter ของ Windows มี `:` (เคยได้ 0 ปลอม)

## Versioning & release (semver `MAJOR.MINOR.PATCH`)

เลข version ตาม semver — ขยับเลขไหนดูจากขนาดของงาน:

| งาน | ขยับ | ตัวอย่าง |
|---|---|---|
| fix เล็กๆ / แก้บั๊ก / ปรับข้อความ UI | **PATCH** (ตัวท้าย) | v1.4.1 → v1.4.2 |
| ฟีเจอร์ใหม่ / โมดูลใหม่ (ไม่พังของเดิม) | **MINOR** (ตัวกลาง, PATCH กลับเป็น 0) | v1.4.2 → v1.5.0 |
| เปลี่ยนแบบพังของเดิม (schema/auth/โครงใหญ่) | **MAJOR** | v1.5.0 → v2.0.0 |

ขั้นตอน release (ทำตามลำดับ ทุกครั้ง):

1. แตก branch จาก `main` — fix ใช้ `hotfix-vX.Y.Z`, ฟีเจอร์ใช้ `feature/<name>` (**ห้ามตั้งชื่อ `hotfix/...`** — มี branch ชื่อ `hotfix` เดิมค้างอยู่ ทำให้ git สร้างชื่อซ้อนไม่ได้)
2. bump `"version"` ใน `package.json` ให้ตรงกับ tag ใน commit เดียวกับงาน
3. commit → `git tag vX.Y.Z`
4. `git merge --no-ff` เข้า `main`
5. push เฉพาะเมื่อผู้ใช้สั่ง: `git push origin main <branch> vX.Y.Z` (tag ไม่ push อัตโนมัติ)

`.claude/settings.local.json` ห้ามรวมเข้า commit งาน — เป็นไฟล์ตั้งค่า local

## Stack

Next.js 16 (App Router, Turbopack, `reactCompiler: true`) · React 19 · TypeScript strict · Tailwind v4 · shadcn/ui (style "new-york", base "neutral") · Supabase (Postgres + Storage) · Recharts · TipTap · @react-pdf/renderer. Path alias: `@/*` → repo root. UI text is Thai-first with English fallbacks via `contexts/language-context.tsx`.

## Architecture

### Middleware lives in `proxy.ts`, not `middleware.ts`

The Next.js middleware file is named `proxy.ts` and exports `proxy(request)` (matcher excludes `/api`, `_next/*`, and any path with a dot). It is the **only** place that enforces module routing. Three gates run in order:

1. **License gate** — `getLicenseStatus()` reads `LICENSE_EXPIRES_AT`; fail-closed (missing/malformed env = expired). Expired instances redirect everywhere (even `/login`) to `LICENSE_EXPIRED_REDIRECT_URL`.
2. **Session gate** — verifies the HMAC-signed `session_token` cookie via Web Crypto (Edge runtime, see `verifySessionTokenEdge`), then reads `profiles` with the service-role key to confirm `is_approved`, `!is_blocked`, and that a **non-null** `active_session_id` equals the cookie's `session_id` (single-session enforcement — logging in elsewhere kicks the previous session; logout nulls it). No token, no `session_id`, or a null `active_session_id` → `/login`.
3. **Module gate** — maps the path to a `ModuleKey` via the inlined `MODULE_ROUTES` table and checks `profiles.allowed_modules`. The `admin` key additionally requires `profiles.role === 'admin'` (from the DB row, never from a cookie). One narrow exception: a kit QR path matching exactly `/kits/<id>/check` passes with `stock` **or** `events` (the rest of `/kits` still needs `stock`). The `stock` module also covers the equipment routes `/packages`, `/packing`, `/stock/settings`, `/stock/usage`. A second exception: the pickup-spot QR `/pickup/<id>` is not in `MODULE_ROUTES` and passes with `stock` **or** `events`.

`MODULE_ROUTES` in `proxy.ts` is **duplicated** from `lib/nav-config.ts` because the middleware runs in the Edge runtime and cannot import the lucide-react icons used in nav-config. **If you add a route to a module, update both.**

⚠️ **`MODULE_ROUTES` is currently a strict subset of `NAV_GROUPS`** — it only covers `stock`, `events`, `kpi`, `costs`, `crm`, `finance`, and `admin`. The `overview`, `jobs`, and `checkin` modules exist in `nav-config.ts` (and therefore hide from the sidebar for users who lack the module) but their URLs (`/overview*`, `/jobs*`, `/check-in*`) are **not** enforced by the proxy. Any authenticated user can reach them by typing the URL. If you need real route-level enforcement for those, add them to `MODULE_ROUTES` and/or guard inside the route's `page.tsx`.

### Authentication: signed token + session id only

Since v1.24.2 a user is recognised **only** by:

- `session_token` = `userId:timestamp:hex-hmac-sha256` (7-day expiry), signed with `SESSION_SECRET`. Created by `lib/session.ts::createSessionToken`, verified server-side by `verifySessionToken` and in Edge by `verifySessionTokenEdge` in `proxy.ts`; **and**
- `session_id`, which must equal the profile's non-null `active_session_id`.

The old unsigned cookies `session_user_id` and `session_role` are **never read** — anyone can set them. Login no longer writes them; login/logout/proxy only delete leftovers. Role and admin rights always come from `profiles.role`. `scripts/session-hardening.check.ts` and `scripts/proxy-session.check.ts` enforce this (including a static scan for cookie reads).

Server-side auth helpers in `lib/auth.ts`:
- `requireAuth()` — the single verified session (token + `session_id` + DB row: `is_approved`, non-null matching `active_session_id`), `cache()`d per request. Use it everywhere identity or role matters.
- `getSessionLight()` — same result as `requireAuth()` reduced to `{ userId, role, sessionId }`; kept for older call sites (it is DB-backed now, but cached).
- Module helpers (`finance/viewer.ts`, `documents/session.ts`, `salary/session.ts`) delegate to `requireAuth()`; new code should call it directly.

`SESSION_SECRET` still falls back to the anon key when unset (so a missing Railway variable does not lock everyone out); the non-null session-id rule keeps a forged token useless, but production must set a real secret.

### Two Supabase clients with different trust levels

- `lib/supabase.ts` → `createBrowserClient` (anon key). Use in `'use client'` components.
- `lib/supabase-server.ts` → `createServiceClient()` (service role key, **bypasses RLS**). Use in server actions, server components, and route handlers. The exported `supabaseServer` is a Proxy that re-creates the client per access — never assume a stable singleton. **Never** import `supabase-server.ts` into a client component.

The deprecated `lib/supabase.ts` also exports a module-level `supabase` singleton; prefer calling `createClient()` per component.

### Route layout

```
app/
├── layout.tsx              root: Inter font + <Providers>
├── page.tsx                redirects → /dashboard or /login based on cookie
├── login/                  public
├── api/                    not auth-guarded by proxy.ts (matcher excludes /api)
│   ├── pdf/                react-pdf renderers (gets X-Frame-Options: SAMEORIGIN)
│   ├── ai-analyze/         Gemini integration
│   ├── migrations/, schema/, health/
└── (authenticated)/        all routes here are session-guarded
    ├── layout.tsx          Sidebar + NotificationBell + LicenseBanner + ProfileCompletionChecker
    └── <module>/
        ├── page.tsx        Server Component — fetches data, reads cookies, passes to view
        ├── *-view.tsx      Client Component — interactive UI
        └── actions.ts      'use server' — all mutations for the module
```

The `page.tsx` (server) + `*-view.tsx` (client) split is the standard pattern — preserve it when adding pages. Each module owns its own `actions.ts`; some are very large (`jobs/actions.ts` ~1.4k LOC, `finance/actions.ts` ~1.6k LOC, `crm/actions.ts` ~1k LOC) — when adding actions, keep them colocated with the module rather than centralizing.

### Module-based RBAC

`profiles.allowed_modules` is a Postgres text[] of `ModuleKey` values: `overview`, `crm`, `events`, `stock`, `costs`, `finance`, `kpi`, `jobs`, `checkin`, `admin`. `lib/nav-config.ts` is the source of truth for **nav visibility** (`NAV_GROUPS`, `hasAccessToRoute`); `proxy.ts::MODULE_ROUTES` is the source of truth for **route enforcement**. Admins are auto-granted `admin` and `overview` in the authenticated layout regardless of `allowed_modules`. Individual nav items can be flagged `adminOnly: true` (e.g., KPI templates/assignments/evaluate) — these are hidden in nav and should additionally be guarded in their `page.tsx` (proxy alone won't block them since they live under the `kpi` module).

### Activity logging

`lib/logger.ts::logActivity(action, details, targetUserId?, overrideUserId?)` writes to `activity_logs` and is the audit trail. The `ActionType` union is exhaustive — when adding a new mutating action, **add a new `ActionType` literal and call `logActivity`**. `overrideUserId` exists because login/register run before the cookie is set. Geo enrichment reads `x-vercel-ip-*` / `cf-ip*` / `x-geo-*` headers; the inline GeoIP lookup is commented out due to serverless constraints.

### Data flow between modules

```
CRM (lead) ──► Events ──► Event Closures ──► Costs ──► Finance (expense claims) ──► PDF
              └► Jobs ─────────────────────────┘                                └► KPI
```

CRM leads can spawn Events (`crm_lead_id` FK) and Jobs (`CREATE_JOBS_FROM_LEAD`). Events can be imported into the Costs module (`IMPORT_EVENT_TO_COSTS`, `job_cost_events` table). Finance generates PDF expense vouchers with QR codes via `@react-pdf/renderer` under `/api/pdf/*`. When touching these handoffs, log the link/unlink with the matching `LINK_*`/`UNLINK_*`/`SYNC_*` action types.

### PostgREST ตัดทุกคำขอที่ 1,000 แถว (db-max-rows)

Supabase ของโปรเจกต์นี้คืนไม่เกิน 1,000 แถวต่อคำขอ **แม้ใส่ `.range(0, 4999)`** และไม่แจ้งเตือน (เคยทำให้ /finance และ /crm เห็นข้อมูลไม่ครบ) การอ่านใดที่อาจเกิน 1,000 แถวต้องวน `.range()` ทีละหน้าผ่าน `lib/read-all-rows.ts::readAllRows(build)` โดย `build(from, to)` ต้องเรียงแบบคงที่ (เช่น `created_at` + `id`) — Finance ใช้ `finance/claim-db.ts::readAllRows` ของตัวเอง (มี retry คอลัมน์ที่ยังไม่ migrate) ส่วนโค้ดอื่นใช้ตัวใน `lib/` · dropdown ที่ใส่ `.limit()` ตั้งใจไว้ไม่นับ

โค้ดอ่านใหม่ **ไม่ใช้ `.or()`** — ฐานข้อมูลจำลองในชุดตรวจ throw ทันที ให้อ่านแยกชุดแล้วรวมด้วย id แทน (แบบ `getQueueClaims`, `getOutstandingClaims`, `getLeads` แบบ window)

### Database conventions

Supabase types are generated to `types/database.types.ts` and re-exported from `types/index.ts`. The repo accumulates **two flavors of SQL files**: ad-hoc patches archived in `docs/legacy-sql/` (`add_*.sql`, `create_*.sql`, `update_*.sql` — historical) and proper migrations in `supabase/migrations/` (datestamped, current convention). New schema changes go in `supabase/migrations/` only; the legacy SQL files are kept in `docs/legacy-sql/` for reference.

### CRM module (โครงหลัง refactor 2026-10-07, v1.43.2–v1.45.3)

- `crm/types.ts` เป็นที่เดียวของ type และกติกา: `CrmLead` (เต็ม), `BoardLead` (`Pick` ตาม `BOARD_LEAD_KEYS` + `total_installments_paid` + `installments`), `CrmSetting`, `SystemUser`, `boardStatuses/unknownStatuses` (คอลัมน์บอร์ด = สถานะที่ตั้งค่า + สถานะที่มีในข้อมูลจริง — การ์ดห้ามหายจากบอร์ด), `isWonStatus/isFirstWon/NOT_WON_STATUSES` (นิยาม "ปิดการขาย" เดียวทั้งระบบ **ห้ามเทียบ `=== 'accepted'`** — jobs/tracking/reports/sales-board/pl ใช้ตัวนี้ผ่าน re-export ใน `sales-board/commission-logic.ts`), `staleLeadIds` (กฎเก็บเข้าคลัง), `bangkokToday/addDays`
- `getLeads({ window: { days }, full, includeArchived })`: บอร์ด /crm โหลดเฉพาะงานที่แตะใน 60 วันหรือวันงานยังไม่ถึง (`?all=1`, `?days=`, `?q=`) ด้วยคอลัมน์แบบเบา `BOARD_COLUMNS` — มุมมองที่รับ `BoardLead` อ่านคอลัมน์ที่ไม่ได้โหลดจะไม่ผ่าน tsc · dashboard และ download โหลดทุกแถวรวม archived (download ใช้ `full: true`)
- สถานะ kanban ที่ยังมี lead ใช้อยู่ ลบ/ปิดไม่ได้ (`kanbanStatusInUse`) · เก็บเข้าคลังเป็นชุด (`archiveStaleLeads`) และ `deleteLead` = แอดมินเท่านั้น · สร้างใบงานอัตโนมัติเมื่อเข้าสถานะ won ครั้งแรก (`isFirstWon`)
- หน้า lead: `crm/[id]/lead-detail.tsx` เป็นตัวคุม state (≤ 500 บรรทัด) ส่วนแสดงผลอยู่ใน `crm/[id]/components/*` + `shared.tsx` · กล่องยืนยันใช้ `finance/use-confirm.tsx` + `toast` ห้าม `window.confirm/alert` · ไม่ต้อง `router.refresh()` หลัง action ที่ `revalidatePath('/crm/[id]')` อยู่แล้ว
- `crm_*` ยังไม่อยู่ใน `types/database.types.ts` (regenerate ต้องใช้ Supabase access token) — ใช้ type เขียนมือใน `crm/types.ts` และ `.overrideTypes<T>()` / `.single<T>()` ที่ขอบเขต query
- migration `20261007_crm_status_seed_and_credit.sql` เพิ่มแถวสถานะ `lead`/`rejected` และเปลี่ยนค่าสถานะ "รายรับเงินสดย่อย Office" เป็น `credit` — รันซ้ำได้ โค้ดมี fallback ให้บอร์ดถูกก่อนรัน

### อุปกรณ์ / ใบจัดของ (เฟส 1–6, v1.47–v1.52)

- ประเภทอุปกรณ์ (`equipment_categories`) → แพ็กเกจ (`packages`, ทีมขายเลือกต่องานผ่าน `lead_packages`) → **ใบจัดของอีเวนต์ละ 1 ใบ** (`packing_lists`/`packing_list_items`, สถานะ เลือกของ → กำลังหยิบ → พร้อมรับ → ออกงาน → คืนแล้ว → คืนชั้นแล้ว) · แผนเต็ม `docs/specs/equipment-flow.md`
- สถานะอุปกรณ์เปลี่ยนตั้งแต่ **หยิบ** (`in_use`) จนถึง **คืนชั้น** (ตามสภาพ) — ช่วงวางที่จุดรับของยังเป็น `in_use` โดยตั้งใจ · บรรทัดกระเป๋าในใบเขียน `event_kits` ให้เอง
- คืนของตามใบ = ปิดอีเวนต์ผ่าน core เดียวกับ flow กระเป๋าเดิม (`processEventReturn` โหมดไม่แตะ `items.status`) · `/events/[id]/return` ของอีเวนต์ที่มีใบแสดงสรุปจากใบ ไม่มีใบ = หน้าเดิม
- **การจองกระเป๋าตรงถูกถอดแล้ว** (v1.52.0): ฟอร์มสร้าง/แก้อีเวนต์ไม่มี KitPicker, `createEvent/updateEvent` ไม่แตะ `event_kits`, พูลไม่มีปุ่มจอง (`bookKitForLead/unbookKitForLead` ลบแล้ว) — การจองแบบเดิมของอีเวนต์เก่าแสดงอ่านอย่างเดียว · QR กระเป๋าและ `/events/[id]/check-kits` ยังใช้ (มีใบ = แบนเนอร์ลิงก์ไปใบ)
- `items.category` (text) เป็นค่า derived จาก `category_id` — เขียนได้เฉพาะ `stock/categories.ts::resolveCategory` และ sync ใน `updateCategory` ห้าม hardcode รายชื่อประเภท · `crm_settings` หมวด `package` เลิกใช้ (migration `20261014_crm_package_names.sql` แปลง `package_name` เป็นชื่อ) ผู้อ่าน `package_name` ทุกจุดต้องแสดงค่าดิบเมื่อไม่มี mapping

### กติกา Finance / Salary ที่เพิ่ม 2026-10-06

- **ใบค้างเคลียร์** (`finance/claim-rules.ts::outstandingKind`): ทดลองจ่ายที่จ่ายแล้วยังไม่เคลียร์ · เคลียร์แล้วแต่ยังมีเงินต้องคืนและแอดมินยังไม่ยืนยัน · รอใบกำกับภาษี → `createClaim` และการยื่น (`submitCore`) ปฏิเสธ **ทุกคนรวมแอดมิน** · โหลดด้วย `finance/outstanding-data.ts::getOutstandingClaims(userId, all)` (cache ต่อ request รับค่าเดี่ยว) แสดงด้วย `OutstandingAlert/OutstandingPill` ที่ sidebar (`badges['/finance']`), แท็บใบเบิก, คิว, รายการ, หน้าสร้าง, หน้าใบเบิก · ใบ paid/refund_confirmed ใช้ banner เขียว `data-testid="paid-banner"`
- **เวลาตามอีเวนต์** (`salary/compute.ts::applyEventSchedule`): เช็คอิน onsite ที่ผูกอีเวนต์ซึ่งมี `event_time` ใช้ `event_date + event_time/event_end_time` เป็นเวลาเข้า/ออกตอนคิดสลิป — ทำที่ชั้น mapping ใน `salary/actions.ts` (`rawToCheckinInput`, `toSlipCheckinRow`) เวลากดจริงใน `staff_checkins` ไม่ถูกแก้ · แถว `schedule_source === 'event'` ล็อกช่องเวลาในสลิป · เพดานที่รู้: query ช่วงงวดยังกรองด้วยเวลากดจริง

### What's New (/whats-new)

หน้า "มีอะไรใหม่" แสดง changelog ฝั่งผู้ใช้ เข้าจากลิงก์ล่างซ้ายของ sidebar (ไอคอน Sparkles) — อยู่ใต้ `(authenticated)` แต่**ไม่อยู่ใน `MODULE_ROUTES`** ดังนั้นทุก user ที่ล็อกอินเห็นได้ (ตั้งใจ ไม่ต้องเพิ่ม module key)

วิธีทำงาน: ข้อมูลทั้งหมดเป็น static array ใน `app/(authenticated)/whats-new/updates.ts` (ไม่มี DB, ไม่มี admin UI) หน้า `page.tsx` เป็น server component ล้วน render จาก array ตรงๆ จัดกลุ่มตามวันที่

**กติกาสำหรับ Claude: ทุกครั้งที่ ship การเปลี่ยนแปลงที่ผู้ใช้สัมผัสได้ (ฟีเจอร์ใหม่ / ปรับปรุง / แก้บั๊กที่ user เห็น) ให้เติม `UpdateEntry` ไว้ "บนสุด" ของ `UPDATES` ใน commit เดียวกัน** โดย:
- `date` = วันที่ ship (YYYY-MM-DD ค.ศ.), `tag` = `'ใหม่' | 'ปรับปรุง' | 'แก้บั๊ก'`
- `title`/`points` เขียนภาษาไทยมุมมองผู้ใช้ — ห้ามศัพท์เทคนิค (❌ "refactor buildHealth" ✅ "แก้ตัวเลขการ์ดให้ถูกต้อง")
- งาน internal ล้วน (refactor, security ภายใน, script) ไม่ต้องลง

### Module-specific design docs

Several module-level design/spec markdowns live in `docs/` (`Finance.md`, `KPI.md`, `job.md`, `jobs.md`, `notification.md`, `ACCESS_CONTROL.md`, `SECURITY_REPORT.md`, `PROJECT_ANALYSIS.md`). They are not part of the build; treat them as the closest thing to per-module requirements docs when changing those modules.

### Security headers

`next.config.ts` applies `X-Frame-Options: DENY` site-wide except `/api/pdf/*` (which uses `SAMEORIGIN` so PDFs can be embedded in the app's preview UI). Server actions accept up to 10mb (`serverActions.bodySizeLimit`).

## Agent Workflow (Plan → Execute → Verify Loop)

Pattern: **Fable 5.1 วางแผน → Opus 5.5 ลงมือ → Fable 5.1 ตรวจ → ไม่ผ่านวนใหม่ (สูงสุด 5 รอบ)**

> รุ่น ณ 2026-10: Planner/Critic = session หลัก (**Fable 5.1**, `claude-fable-5-1`) · Executor = **Opus 5.5** (`claude-opus-5-5`) — ตอน dispatch ผ่าน Agent tool เลือกได้แค่ tier (`fable` / `opus` / `sonnet` / `haiku`) ใช้ `model: "opus"` เวอร์ชันจริงตามที่ Claude Code resolve ให้ · งานง่ายๆ (lint เฉพาะไฟล์, ย้ายโค้ดตรงๆ) ใช้ `sonnet` (Sonnet 5.5) ได้

### หลักการสำคัญ (ประหยัด token 50–70% ในงานที่วนหลายรอบ)

| หลักการ | ทำอะไร |
|---|---|
| ส่ง delta ไม่ส่ง context เต็ม | รอบ 2+ ส่ง Executor เฉพาะส่วนที่ตก ไม่ใช่งานทั้งชิ้น |
| Critic ตอบ JSON สั้น | ห้ามเรียงความ ใช้ structured output |
| Lock acceptance criteria ตั้งแต่แรก | Planner ออกเกณฑ์วัดได้ ใช้ตลอดทุกรอบ ห้ามเปลี่ยน |
| Prompt caching | cache แผน + criteria + system prompt ของแต่ละ role |
| Early exit 3 ชั้น | หยุดก่อนครบ 5 รอบเมื่อเข้าเงื่อนไข |

### Loop

```
[รอบวางแผน — ครั้งเดียว]
Fable 5.1: สร้างแผน + acceptance criteria (lock ไว้) → cache

[Loop สูงสุด 5 รอบ]
Opus 5.5: ลงมือ (รอบแรก = แผนเต็ม / รอบถัดไป = เฉพาะ failures)
Fable 5.1: ตรวจกับ criteria → JSON {pass, score, passed_ids, failures}
  ┌─ pass = true ───────────→ จบทันที
  ├─ score >= pass_threshold ─→ จบ ("ดีพอ" แม้ไม่ perfect)
  ├─ score ไม่ขยับ 2 รอบติด ──→ จบ คืนผลงานดีสุดที่มี
  ├─ ครบ 5 รอบ ──────────────→ จบ คืนผลงานดีสุด + แจ้งว่าไม่ผ่านครบ
  └─ ไม่ผ่าน ────────────────→ ส่งเฉพาะ failures กลับ Opus 5.5, lock passed_ids (ไม่ตรวจซ้ำ)
```

### Role prompts

**Planner (Fable 5.1 — ครั้งเดียว):** output JSON เท่านั้น `{"plan": [ขั้นตอนย่อยเรียงลำดับ], "acceptance_criteria": [{"id": "AC1", "check": "เกณฑ์วัดได้ ผ่าน/ไม่ผ่านชัดเจน"}], "pass_threshold": 0.85}` — เกณฑ์ต้องวัดได้เป็นข้อเท็จจริง ห้ามคลุมเครือ (❌ "โค้ดควรอ่านง่าย" ✅ "ทุกฟังก์ชันมี docstring") และถูก lock ตลอดทุกรอบ

**Executor (Opus 5.5):** รอบแรกรับแผนเต็ม + criteria ทำให้ครบ; รอบ 2+ รับเฉพาะ `{failed_section}` + `{failures}` — แก้เฉพาะจุดที่ตก ห้ามรื้อส่วนที่ผ่านแล้ว ห้าม regenerate ทั้งชิ้น ส่งเฉพาะ delta

**Critic (Fable 5.1):** ตรวจเทียบเกณฑ์ที่ lock เท่านั้น ห้ามเพิ่มเกณฑ์ใหม่ ข้ามส่วนที่ lock แล้ว output JSON เท่านั้น `{"pass": bool, "score": 0.0-1.0, "passed_ids": [...], "failures": [{"loc", "ac_id", "issue"}]}` — issue สั้นที่สุดพอให้ Executor รู้ว่าแก้อะไร; pass=true → failures=[]

### กฎทอง

1. Planner ล็อกเกณฑ์ที่**วัดได้**ตั้งแต่แรก
2. Executor แก้**เฉพาะจุดที่ตก** ไม่ regenerate ทั้งชิ้น
3. Critic ตอบ **JSON สั้น** ห้ามเรียงความ
4. เปิด **prompt caching** กับส่วนที่คงที่
5. **Early exit** เมื่อผ่าน / score นิ่ง 2 รอบ / ถึง threshold

### ทำคู่ขนานด้วย worktree (ใช้กับ executor หลายตัว)

- `git worktree add -b <branch> ../stock-wt-<x> main` แล้วทำ junction `cmd /c mklink /J "<wt>\node_modules" "<repo>\node_modules"` (path ไทยใช้ได้) + copy `.env.local` → executor แต่ละตัวแก้ได้เฉพาะชุดไฟล์ของตัวเอง (ระบุใน prompt) ห้าม commit · planner เป็นคน commit, bump version, ใส่ What's New, tag, merge
- branch ที่สองให้ `git rebase main` หลัง branch แรก merge แล้วค่อย bump เป็นเลขถัดไป (ไฟล์ release ไม่ชนกัน)
- **ก่อน `git worktree remove --force` ต้องลบ junction ก่อน** ด้วย PowerShell `[IO.Directory]::Delete('<wt>\node_modules')` (ลบเฉพาะลิงก์) — ถ้าปล่อยให้ git ลบแบบ recursive จะตามลิงก์เข้าไปลบ `node_modules` จริง · `cmd /c rmdir` กับ path ไทยจาก Git Bash ใช้ไม่ได้
- ก่อน bump version ให้ `git fetch` แล้วดู version บน `main` ก่อนเสมอ (เคยมี session คู่ขนาน merge เลขสูงกว่าไปแล้ว)

## Conventions worth following

- Thai user-facing copy is normal — error messages returned from server actions are often Thai (e.g., `'เฉพาะ admin เท่านั้นที่สร้างอีเวนต์ได้'`). Use `useLanguage()` / `t()` for new UI strings rather than hardcoding.
- Buddhist Era (พ.ศ.) is used for date display in some modules — see `components/thai-date-picker.tsx`.
- Server actions return `{ error: string }` on failure or redirect/`revalidatePath` on success. The codebase is inconsistent here (some throw); prefer the `{ error }` shape for new actions to match the dominant pattern.
- shadcn components live in `components/ui/`. Shared business components (sidebar, navbar, notification bell, PDF renderers) live in `components/`. Per-module components live under `app/(authenticated)/<module>/components/`.
- Use `cn()` from `lib/utils.ts` for class merging; `compressImage()` in the same file is the standard pre-upload step (caps at 1600px, ~0.75 JPEG quality).

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `xcnn1412/STOCK-MIMAGE` (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root (created lazily by `/domain-modeling`). See `docs/agents/domain.md`.
