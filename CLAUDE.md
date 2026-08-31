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

## Stack

Next.js 16 (App Router, Turbopack, `reactCompiler: true`) · React 19 · TypeScript strict · Tailwind v4 · shadcn/ui (style "new-york", base "neutral") · Supabase (Postgres + Storage) · Recharts · TipTap · @react-pdf/renderer. Path alias: `@/*` → repo root. UI text is Thai-first with English fallbacks via `contexts/language-context.tsx`.

## Architecture

### Middleware lives in `proxy.ts`, not `middleware.ts`

The Next.js middleware file is named `proxy.ts` and exports `proxy(request)` (matcher excludes `/api`, `_next/*`, and any path with a dot). It is the **only** place that enforces module routing. Three gates run in order:

1. **License gate** — `getLicenseStatus()` reads `LICENSE_EXPIRES_AT`; fail-closed (missing/malformed env = expired). Expired instances redirect everywhere (even `/login`) to `LICENSE_EXPIRED_REDIRECT_URL`.
2. **Session gate** — verifies the HMAC-signed `session_token` cookie via Web Crypto (Edge runtime, see `verifySessionTokenEdge`), falls back to the legacy `session_user_id` cookie, then hits `profiles` to confirm `is_approved` and that `active_session_id` matches the cookie's `session_id` (single-session enforcement — logging in elsewhere kicks the previous session).
3. **Module gate** — maps the path to a `ModuleKey` via the inlined `MODULE_ROUTES` table and checks `profiles.allowed_modules`. The `admin` key additionally requires `session_role === 'admin'`.

`MODULE_ROUTES` in `proxy.ts` is **duplicated** from `lib/nav-config.ts` because the middleware runs in the Edge runtime and cannot import the lucide-react icons used in nav-config. **If you add a route to a module, update both.**

⚠️ **`MODULE_ROUTES` is currently a strict subset of `NAV_GROUPS`** — it only covers `stock`, `events`, `kpi`, `costs`, `crm`, `finance`, and `admin`. The `overview`, `jobs`, and `checkin` modules exist in `nav-config.ts` (and therefore hide from the sidebar for users who lack the module) but their URLs (`/overview*`, `/jobs*`, `/check-in*`) are **not** enforced by the proxy. Any authenticated user can reach them by typing the URL. If you need real route-level enforcement for those, add them to `MODULE_ROUTES` and/or guard inside the route's `page.tsx`.

### Authentication has two parallel cookie systems

The project is mid-migration from legacy plain-userId cookies to HMAC-signed tokens. Both must keep working:

- **New (preferred):** `session_token` = `userId:timestamp:hex-hmac-sha256` (7-day expiry), signed with `SESSION_SECRET`. Created by `lib/session.ts::createSessionToken`, verified server-side by `verifySessionToken` and in Edge by `verifySessionTokenEdge` in `proxy.ts`.
- **Legacy:** `session_user_id`, `session_role`, `session_id` cookies — still read as a fallback in both `proxy.ts` and server actions.

Server-side auth helpers in `lib/auth.ts`:
- `requireAuth()` — full check (token verify + DB lookup for `is_approved` + session match). Use in mutating server actions.
- `getSessionLight()` — token verify only, no DB. Use for non-critical reads (e.g., layouts).

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

### Database conventions

Supabase types are generated to `types/database.types.ts` and re-exported from `types/index.ts`. The repo accumulates **two flavors of SQL files**: ad-hoc patches archived in `docs/legacy-sql/` (`add_*.sql`, `create_*.sql`, `update_*.sql` — historical) and proper migrations in `supabase/migrations/` (datestamped, current convention). New schema changes go in `supabase/migrations/` only; the legacy SQL files are kept in `docs/legacy-sql/` for reference.

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

Pattern: **Fable5 วางแผน → Opus 4.8 ลงมือ → Fable5 ตรวจ → ไม่ผ่านวนใหม่ (สูงสุด 5 รอบ)**

> Executor ใช้ **Opus 4.8** — ตอน dispatch ผ่าน Agent tool เลือก tier `opus` ได้เท่านั้น (เลือกเวอร์ชันย่อยตรงๆ ไม่ได้) เวอร์ชันจริงตามที่ session/config ของ Claude Code resolve ให้

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
Fable5: สร้างแผน + acceptance criteria (lock ไว้) → cache

[Loop สูงสุด 5 รอบ]
Opus4.8: ลงมือ (รอบแรก = แผนเต็ม / รอบถัดไป = เฉพาะ failures)
Fable5: ตรวจกับ criteria → JSON {pass, score, passed_ids, failures}
  ┌─ pass = true ───────────→ จบทันที
  ├─ score >= pass_threshold ─→ จบ ("ดีพอ" แม้ไม่ perfect)
  ├─ score ไม่ขยับ 2 รอบติด ──→ จบ คืนผลงานดีสุดที่มี
  ├─ ครบ 5 รอบ ──────────────→ จบ คืนผลงานดีสุด + แจ้งว่าไม่ผ่านครบ
  └─ ไม่ผ่าน ────────────────→ ส่งเฉพาะ failures กลับ Opus 4.8, lock passed_ids (ไม่ตรวจซ้ำ)
```

### Role prompts

**Planner (Fable5 — ครั้งเดียว):** output JSON เท่านั้น `{"plan": [ขั้นตอนย่อยเรียงลำดับ], "acceptance_criteria": [{"id": "AC1", "check": "เกณฑ์วัดได้ ผ่าน/ไม่ผ่านชัดเจน"}], "pass_threshold": 0.85}` — เกณฑ์ต้องวัดได้เป็นข้อเท็จจริง ห้ามคลุมเครือ (❌ "โค้ดควรอ่านง่าย" ✅ "ทุกฟังก์ชันมี docstring") และถูก lock ตลอดทุกรอบ

**Executor (Opus 4.8):** รอบแรกรับแผนเต็ม + criteria ทำให้ครบ; รอบ 2+ รับเฉพาะ `{failed_section}` + `{failures}` — แก้เฉพาะจุดที่ตก ห้ามรื้อส่วนที่ผ่านแล้ว ห้าม regenerate ทั้งชิ้น ส่งเฉพาะ delta

**Critic (Fable5):** ตรวจเทียบเกณฑ์ที่ lock เท่านั้น ห้ามเพิ่มเกณฑ์ใหม่ ข้ามส่วนที่ lock แล้ว output JSON เท่านั้น `{"pass": bool, "score": 0.0-1.0, "passed_ids": [...], "failures": [{"loc", "ac_id", "issue"}]}` — issue สั้นที่สุดพอให้ Executor รู้ว่าแก้อะไร; pass=true → failures=[]

### กฎทอง

1. Planner ล็อกเกณฑ์ที่**วัดได้**ตั้งแต่แรก
2. Executor แก้**เฉพาะจุดที่ตก** ไม่ regenerate ทั้งชิ้น
3. Critic ตอบ **JSON สั้น** ห้ามเรียงความ
4. เปิด **prompt caching** กับส่วนที่คงที่
5. **Early exit** เมื่อผ่าน / score นิ่ง 2 รอบ / ถึง threshold

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
