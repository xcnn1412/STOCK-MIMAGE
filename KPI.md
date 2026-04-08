# KPI Framework

## Overview

The KPI (Key Performance Indicator) framework is a full-stack module for tracking, evaluating, and reporting employee performance. It supports template-based KPI definitions, per-employee monthly assignments, admin and self-evaluations, weighted scoring, visual dashboards, threaded feedback, and data export.

---

## Directory Structure

```
app/(authenticated)/kpi/
├── actions.ts               # All server actions (full CRUD for templates, assignments, evaluations, replies)
├── types.ts                 # KPI_MODES, KPI_CYCLES, KPI_STATUSES constants + type aliases
├── kpi-nav.tsx              # Tab navigation bar (client component)
├── layout.tsx               # Shared layout — injects <KpiNav> above all sub-pages
├── page.tsx                 # Redirects → /kpi/dashboard
│
├── dashboard/               # Overview screen (role-aware)
├── templates/               # Admin: define reusable KPI templates
├── assignments/             # Admin: assign KPIs to employees per month
├── evaluate/                # Admin: enter evaluation results
├── reports/                 # Analysis, charts, threaded feedback (role-aware)
└── download/                # Export to CSV / JSON (role-aware)
```

---

## Database Schema

### `kpi_templates`
Reusable KPI definitions managed by admins.

| Column | Type | Description |
|---|---|---|
| `id` | string | Primary key |
| `name` | string | Template name |
| `mode` | string | `task` \| `sales` \| `cost_reduction` |
| `config` | Json | Free-form configuration object |
| `default_target` | number | Default numeric target |
| `target_unit` | string | Unit label (e.g. `฿`, `pcs`, `%`) |
| `description` | string\|null | Optional description |
| `created_by` | string\|null | FK → profiles |
| `created_at` | string | Timestamp |

### `kpi_assignments`
One record = one employee's KPI for one specific month.

| Column | Type | Description |
|---|---|---|
| `id` | string | Primary key |
| `template_id` | string\|null | FK → kpi_templates (null for custom KPIs) |
| `assigned_to` | string | FK → profiles |
| `custom_name` | string\|null | Name override when no template |
| `custom_mode` | string\|null | Mode override when no template |
| `custom_config` | Json\|null | Config override when no template |
| `target` | number | Numeric target for this month |
| `target_unit` | string | Unit label |
| `cycle` | string | `weekly` \| `monthly` \| `yearly` |
| `period_start` | string | First day of the month |
| `period_end` | string | Last day of the month |
| `status` | string | `active` \| `paused` \| `completed` |
| `weight` | number | Relative weight for scoring (0–100, sum per person should equal 100) |
| `created_by` | string\|null | FK → profiles |
| `created_at` | string | Timestamp |

### `kpi_evaluations`
Evaluation results submitted against an assignment.

| Column | Type | Description |
|---|---|---|
| `id` | string | Primary key |
| `assignment_id` | string | FK → kpi_assignments |
| `score` | number\|null | Auto-calculated, clamped 0–100 |
| `actual_value` | number\|null | Actual result entered |
| `difference` | number\|null | `actual_value − target` |
| `achievement_pct` | number\|null | `(actual / target) × 100`, 1 decimal place |
| `comment` | string\|null | Evaluator's comment/notes |
| `evaluation_date` | string | Date the evaluation was recorded |
| `period_label` | string\|null | Human-readable label (e.g. "Week 8, Feb 2026") |
| `evaluated_by` | string | FK → profiles (admin or self-evaluating staff) |
| `created_at` | string | Timestamp |

### `kpi_evaluation_replies`
Threaded discussion on evaluations (feedback timeline).

| Column | Description |
|---|---|
| `id` | Primary key |
| `evaluation_id` | FK → kpi_evaluations |
| `content` | Rich HTML content |
| `attachments` | `string[]` — image URLs |
| `created_by` | FK → profiles |
| `created_at` | Timestamp |

---

## Constants

Defined in `kpi/types.ts`:

```ts
KPI_MODES    = ['task', 'sales', 'cost_reduction']
KPI_CYCLES   = ['weekly', 'monthly', 'yearly']
KPI_STATUSES = ['active', 'paused', 'completed']
```

---

## Scoring & Metrics Calculation

All calculations are performed server-side inside `actions.ts` on evaluation submission.

### Per-Evaluation Metrics
```
achievement_pct = round((actual_value / target) * 1000) / 10    // 1 decimal
score           = clamp(round(achievement_pct), 0, 100)
difference      = actual_value − target
```

### Cumulative Actual
An assignment represents exactly one month. Multiple evaluation records can exist per assignment (re-evaluations are supported). The **cumulative actual** is the **sum of all `actual_value`s** across all evaluation records for that assignment — used for progress bars and gauge charts.

### Weighted Score (per person, per period)
Each assignment carries a `weight` (0–100). The system enforces that the total weight across a person's active KPIs equals 100 when updating via `updateAssignmentWeight`.

```
weighted_score = Σ(achievement_pct × weight) / Σ(weight)
```

This weighted average is surfaced in the Dashboard employee ranking, Reports summary cards, and the employee breakdown popover.

---

## Server Actions (`actions.ts`)

All actions authenticate via session cookies (`session_user_id`, `session_role`). Mutating actions are admin-only unless noted. All successful mutations call `revalidatePath` and `logActivity`.

| Action | Role | Description |
|---|---|---|
| `createTemplate` | admin | Insert a new KPI template |
| `updateTemplate` | admin | Update name, mode, target, config |
| `deleteTemplate` | admin | Blocked if linked assignments exist |
| `createAssignment` | admin | Insert one assignment per month. Supports bulk multi-month creation. Supports both template-linked and fully custom KPIs |
| `updateAssignment` | admin | Generic partial update |
| `deleteAssignment` | admin | Blocked if linked evaluations exist |
| `updateAssignmentWeight` | admin | Validates total weight ≤ 100 for that person |
| `submitEvaluation` | admin | Calculates difference / achievement / score. Sends `kpi_evaluated` notification to staff |
| `submitSelfEvaluation` | any user | Same math. Ownership check: `assignment.assigned_to === userId`. Sends `kpi_self_evaluated` to all admins |
| `updateEvaluation` | admin | Generic partial update of an evaluation |
| `deleteEvaluation` | admin | Delete a single evaluation record |
| `deleteAllEvaluationsByAssignment` | admin | Delete all evaluations for an assignment |
| `getEvaluationReplies` | any authenticated | Read replies for a given evaluation |
| `createEvaluationReply` | any authenticated | Insert reply + send `kpi_evaluation_reply` notification to participants and @mentioned users |

---

## Screens & UI

### `/kpi/dashboard`
Role-aware overview of KPI performance.

- **Stat cards**: template count, active KPI count, total evaluations, weighted average score with emoji indicator
- **Month filter**: auto-derived from `period_start` values and `evaluation_date` values in the data
- **Horizontal bar chart**: target vs. cumulative actual per KPI (Recharts)
- **Trend chart**: achievement % per period over time (Recharts)
- **Gauge grid**: `RadialBarChart` per KPI — cumulative achievement %, color-coded (green ≥ 100%, orange, red)
- **Employee ranking table**: sorted by weighted score descending
- **Staff self-evaluation form**: staff can submit their own `actual_value` directly from the dashboard

### `/kpi/templates` *(admin-only)*
Manage reusable KPI definitions.

- Card grid listing all templates with mode badge, default target, and unit
- Create / Edit via `TemplateForm` dialog (name, mode, description, default target, unit)
- Delete with guard (blocked if assignments reference the template)

### `/kpi/assignments` *(admin-only)*
Assign KPIs to employees on a per-month basis.

- **Two-column layout**: sticky employee list (left) + detail panel (right)
- Month filter (defaults to current month)
- Summary bar: employee count, total KPIs, evaluated KPIs, completion %
- Employee list: shows KPI count and total weight (highlighted if ≠ 100%)
- Detail panel: assignments sorted by `period_start`; each shows month badge, KPI name, weight badge (click-to-edit inline), mode / cycle / status badges
- Inline target edit (pencil icon → input → save)
- Past months are grayed out and locked
- Progress bar: cumulative actual / target, color-coded

### `/kpi/evaluate` *(admin-only)*
Enter evaluation results for assigned KPIs.

- Same two-column layout as Assignments
- Month filter
- Each KPI card: circular progress ring, "Evaluate" button, dropdown for history / delete all
- **Eval dialog**: `actual_value` input (with thousands-comma formatting), `evaluation_date`, `period_label`, `comment` — difference + achievement % + score are auto-calculated and saved

### `/kpi/reports`
Analysis and feedback for admins and staff.

- **Filters**: employee (admin only), department (admin only), KPI name, month
- **Summary stat cards**: person count, KPI count, weighted avg score, achievement %
- **Bar chart**: target vs. cumulative actual by KPI
- **Trend chart**: weighted average achievement % by period
- **Employee summary table**: ranked by weighted score with popover showing per-KPI breakdown
- **Detail table**: all evaluation records with local sub-filters
- **FeedbackTimeline**: threaded comment/reply UI per evaluation — `RichTextEditor` + `FileUploadZone` + image lightbox, @mention notifications

### `/kpi/download`
Export KPI data to CSV or JSON.

- Month filter
- **Quick Export All**: combined CSV (Excel-ready), separate CSV files, or JSON
- **Individual export cards**: Templates CSV (admin only), Assignments CSV, Evaluations CSV
- **Data preview**: counts before download
- CSV files include a UTF-8 BOM (`\uFEFF`) for correct Thai character display in Excel
- JSON export includes `exported_at` timestamp and `month` metadata

---

## Notifications

Notifications are sent via `lib/notifications.ts`. All KPI notifications use `referenceType: 'kpi_evaluation'` and `referenceId: assignment_id`.

| Type | Trigger | Recipients |
|---|---|---|
| `kpi_evaluated` | Admin submits an evaluation | The evaluated staff member |
| `kpi_self_evaluated` | Staff submits a self-evaluation | All approved admins |
| `kpi_evaluation_reply` | Anyone replies in the feedback timeline | Assignment owner + evaluator + @mentioned users |

---

## Access Control

| Section | Staff | Admin |
|---|---|---|
| Dashboard | View own KPIs + self-evaluate | View all employees |
| Templates | — | Full CRUD |
| Assignments | — | Full CRUD |
| Evaluate | — | Submit evaluations |
| Reports | View own reports + add replies | View all + full filters |
| Download | Own data CSV/JSON | All data CSV/JSON |

Role is read from the `session_role` cookie set at login. Admin actions re-verify the role server-side in every action function.

---

## Navigation

Defined in `lib/nav-config.ts` and rendered by `kpi-nav.tsx`:

| Tab | Route | Icon |
|---|---|---|
| Dashboard | `/kpi/dashboard` | `LayoutDashboard` |
| Templates | `/kpi/templates` | `FileText` |
| Assignments | `/kpi/assignments` | `UserCheck` |
| Evaluate | `/kpi/evaluate` | `ClipboardCheck` |
| Reports | `/kpi/reports` | `BarChart3` |
| Download | `/kpi/download` | *(nav bar only)* |

---

## Architecture

```
Browser
  └── layout.tsx  (reads role cookie → renders <KpiNav>)
        ├── /kpi/dashboard   → page.tsx (server, role-aware) → DashboardView (client, Recharts)
        ├── /kpi/templates   → page.tsx (admin guard)        → TemplatesView → TemplateForm
        ├── /kpi/assignments → page.tsx (admin guard)        → AssignmentsView → AssignmentForm
        ├── /kpi/evaluate    → page.tsx (admin guard)        → EvaluateView
        ├── /kpi/reports     → page.tsx (role-aware)         → ReportsView → FeedbackTimeline
        └── /kpi/download    → page.tsx (role-aware)         → DownloadView

actions.ts  (Next.js server actions)
  ├── Auth:          session_user_id + session_role cookies
  ├── DB client:     createServiceClient() — Supabase service-role
  ├── Audit:         logActivity() → activity_logs table
  ├── Notifications: createNotifications() → notifications table
  └── Cache:         revalidatePath() on mutating actions
```

### Key Design Decisions

- **1 assignment = 1 month**: Rather than a single long-running assignment, each calendar month gets its own `kpi_assignments` row. Bulk creation allows admins to create 3, 6, or 12 months at once.
- **Multiple evaluations per assignment**: Re-evaluations are supported. Cumulative actual is the sum of all `actual_value` entries for an assignment.
- **Weight enforcement**: Total weight per person should equal 100. The system warns (and optionally blocks) when weights are off.
- **Custom KPIs**: Assignments can exist without a template by supplying `custom_name`, `custom_mode`, and `custom_config` directly.
- **Role-aware rendering**: Server pages pass the user's role down to client components; admin-only UI elements are hidden (not just disabled) for staff.
