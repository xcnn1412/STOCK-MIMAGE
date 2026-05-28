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

Supabase types are generated to `types/database.types.ts` and re-exported from `types/index.ts`. The repo accumulates **two flavors of SQL files**: ad-hoc patches at the repo root (`add_*.sql`, `create_*.sql`, `update_*.sql` — historical) and proper migrations in `supabase/migrations/` (datestamped, current convention). New schema changes go in `supabase/migrations/` only; the root-level SQL files are kept for reference.

### Module-specific design docs

Several module-level design/spec markdowns live at the repo root (`Finance.md`, `KPI.md`, `job.md`, `jobs.md`, `notification.md`, `ACCESS_CONTROL.md`, `SECURITY_REPORT.md`, `PROJECT_ANALYSIS.md`). They are not part of the build; treat them as the closest thing to per-module requirements docs when changing those modules.

### Security headers

`next.config.ts` applies `X-Frame-Options: DENY` site-wide except `/api/pdf/*` (which uses `SAMEORIGIN` so PDFs can be embedded in the app's preview UI). Server actions accept up to 10mb (`serverActions.bodySizeLimit`).

## Conventions worth following

- Thai user-facing copy is normal — error messages returned from server actions are often Thai (e.g., `'เฉพาะ admin เท่านั้นที่สร้างอีเวนต์ได้'`). Use `useLanguage()` / `t()` for new UI strings rather than hardcoding.
- Buddhist Era (พ.ศ.) is used for date display in some modules — see `components/thai-date-picker.tsx`.
- Server actions return `{ error: string }` on failure or redirect/`revalidatePath` on success. The codebase is inconsistent here (some throw); prefer the `{ error }` shape for new actions to match the dominant pattern.
- shadcn components live in `components/ui/`. Shared business components (sidebar, navbar, notification bell, PDF renderers) live in `components/`. Per-module components live under `app/(authenticated)/<module>/components/`.
- Use `cn()` from `lib/utils.ts` for class merging; `compressImage()` in the same file is the standard pre-upload step (caps at 1600px, ~0.75 JPEG quality).
