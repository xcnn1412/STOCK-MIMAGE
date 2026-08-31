# Jobs Module Documentation

## Overview

The `/jobs` module is a full-featured work management system built with Next.js App Router. It contains two independent workspaces:

1. **Shared Job Board** (`/jobs`) — Team-wide jobs and tickets stored in shared tables, visible to all users.
2. **My Job Workspace** (`/jobs/my-job`) — Personal jobs and tickets stored in **separate per-user tables**, fully configurable by each user independently.

---

## Route Map

| Route | Type | Description |
|---|---|---|
| `/jobs` | ƒ Server | Main team Kanban board (jobs + tickets) |
| `/jobs/[id]` | ƒ Server | Job detail page |
| `/jobs/tickets/[id]` | ƒ Server | Ticket detail page with replies + emoji reactions |
| `/jobs/my-job` | ƒ Server | Personal workspace (separate DB, per-user) |
| `/jobs/my-job/settings` | ƒ Server | Per-user settings for personal workspace |
| `/jobs/admin-job` | ƒ Server | Admin-only: view any user's personal workspace |
| `/jobs/archive` | ƒ Server | Archived jobs and tickets |
| `/jobs/report` | ƒ Server | Ticket analytics and usage report |
| `/jobs/settings` | ƒ Server | System-wide job settings (admin) |

All routes are wrapped by `app/(authenticated)/jobs/layout.tsx` which injects the `<JobsNav>` component. The `/jobs/admin-job` route is only accessible to users with `role = 'admin'` (enforced by server-side cookie check + redirect).

---

## Directory Structure

```
app/(authenticated)/jobs/
├── layout.tsx                    # Jobs layout — injects JobsNav
├── jobs-nav.tsx                  # Top navigation tabs (Board / My Job / Admin Job / Archive / Report / Settings)
├── page.tsx                      # /jobs — loads all team data, renders JobsDashboard
├── actions.ts                    # ALL server actions for shared/team data
├── jobs-dashboard.tsx            # Team Kanban board UI (client component)
│
├── [id]/
│   ├── page.tsx                  # /jobs/[id] — job detail server component
│   └── job-detail.tsx            # Job detail UI
│
├── tickets/
│   └── [id]/
│       ├── page.tsx              # /jobs/tickets/[id] — ticket detail server component
│       └── ticket-detail.tsx     # Ticket detail UI with replies + reactions
│
├── my-job/
│   ├── page.tsx                  # /jobs/my-job — loads personal data, auto-inits settings
│   ├── actions.ts                # ALL server actions for personal (my_*) tables
│   ├── my-job-dashboard.tsx      # Personal workspace Kanban UI (client component)
│   ├── components/
│   │   ├── my-job-kanban-board.tsx     # Drag-drop Kanban for personal jobs
│   │   ├── my-ticket-kanban-board.tsx  # Drag-drop Kanban for personal tickets
│   │   ├── add-my-job-dialog.tsx       # Create/edit dialog for personal jobs
│   │   └── add-my-ticket-dialog.tsx    # Create/edit dialog for personal tickets
│   └── settings/
│       ├── page.tsx              # /jobs/my-job/settings — settings server component
│       └── my-job-settings-view.tsx    # Tabbed settings UI (client component)
│
├── admin-job/
│   ├── page.tsx                  # /jobs/admin-job — admin-only, loads selected user's personal data
│   └── admin-job-dashboard.tsx   # User picker + readonly MyJobDashboard
│
├── archive/
│   ├── page.tsx                  # /jobs/archive — loads archived jobs + tickets
│   └── archive-view.tsx          # Archive UI
│
├── report/
│   ├── page.tsx                  # /jobs/report — loads ticket analytics
│   └── report-view.tsx           # Report/analytics UI
│
├── settings/
│   ├── page.tsx                  # /jobs/settings — loads system settings + checklist templates
│   └── settings-view.tsx         # Settings management UI
│
└── components/                   # Shared UI for team board
    ├── job-kanban-board.tsx       # Kanban board for team jobs
    ├── ticket-kanban-board.tsx    # Kanban board for team tickets
    ├── add-job-dialog.tsx         # Create/edit dialog for team jobs
    ├── add-ticket-dialog.tsx      # Create/edit dialog for team tickets
    ├── emoji-picker.tsx           # Custom emoji picker component
    └── reaction-bar.tsx           # Emoji reaction bar for tickets
```

---

## Database Architecture

### Shared (Team) Tables

Used by `/jobs`, `/jobs/[id]`, `/jobs/tickets/[id]`, `/jobs/archive`, `/jobs/report`, `/jobs/settings`.

| Table | Description |
|---|---|
| `jobs` | Team jobs. Fields: `id, job_type, status, assignee_id, title, description, tags[], priority, due_date, crm_lead_id, sort_order, archived_at, ...` |
| `tickets` | Team tickets/support requests. Fields: `id, subject, description, status, category, priority, outcome, assignee_id, archived_at, ...` |
| `job_settings` | System-wide pipeline/status config. Fields: `id, category, value, label_th, label_en, color, sort_order, is_active` |
| `ticket_replies` | Threaded replies on team tickets |
| `ticket_reactions` | Emoji reactions on team tickets |
| `ticket_emojis` | Standard emoji set |
| `custom_emojis` | User-uploaded custom emoji |
| `checklist_templates` | Reusable job checklist templates per job type |
| `job_checklists` | Checklist items attached to specific jobs |
| `job_activities` | Activity log entries for a job |

### Personal (My Job) Tables

Used **exclusively** by `/jobs/my-job` and `/jobs/admin-job`. Completely separate from the shared tables above.

| Table | Description |
|---|---|
| `my_job_settings` | Per-user pipeline/status/category config. Fields: `id, user_id, category, value, label_th, label_en, color, sort_order, is_active, created_at` |
| `my_jobs` | Personal jobs. Fields: `id, user_id, job_type, status, title, description, tags[], priority, due_date, notes, sort_order, created_at, updated_at, archived_at` |
| `my_tickets` | Personal tickets/tasks. Fields: `id, user_id, subject, description, status, category, priority, outcome, created_at, updated_at` |

**RLS Policies:**
- Regular users: `user_id = auth.uid()` — only own rows
- Admin read access: `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')`

---

## My Job Workspace

### Key Architecture Points

- **Completely isolated data** — no shared tables, no cross-contamination with team jobs/tickets.
- **Per-user settings** — each user configures their own pipelines, statuses, and ticket categories via `my_job_settings`.
- **Auto-initialization** — `initMyJobDefaultSettings()` is called on first visit to `/jobs/my-job`. It creates default settings (Personal + Work pipelines with statuses, ticket categories) if none exist. It is a no-op on subsequent visits.
- **`readonly` mode** — `MyJobDashboard` accepts a `readonly` prop. When `true`, all mutation buttons/dialogs are hidden (used by Admin Job view).
- **`showSettingsLink` prop** — Shows a gear icon link to `/jobs/my-job/settings` (shown on user's own view, hidden on admin view).

### Default Settings Created by `initMyJobDefaultSettings()`

**Job Types:** `personal`, `work`

**Statuses (per job type):**
- Personal: `todo`, `in_progress`, `done`
- Work: `todo`, `in_progress`, `review`, `done`

**Ticket Categories:** `bug`, `feature`, `question`

**Ticket Statuses:** `open`, `in_progress`, `resolved`, `closed`

### `my-job/actions.ts` — Exported Types

```typescript
export interface PersonalSetting {
    id: string
    user_id: string
    category: string       // 'job_type' | 'status_personal' | 'status_work' | 'ticket_category' | 'ticket_status'
    value: string
    label_th: string
    label_en: string
    color: string | null
    sort_order: number
    is_active: boolean
    created_at: string
}

export interface PersonalJob {
    id: string
    user_id: string
    job_type: string
    status: string
    title: string
    description: string | null
    tags: string[]
    priority: string
    due_date: string | null
    notes: string | null
    sort_order: number
    created_at: string
    updated_at: string
    archived_at: string | null
}

export interface PersonalTicket {
    id: string
    user_id: string
    subject: string
    description: string | null
    status: string
    category: string
    priority: string
    outcome: string | null
    created_at: string
    updated_at: string
}
```

### `my-job/actions.ts` — Server Actions

**Settings:**
| Function | Description |
|---|---|
| `getMyJobSettings(targetUserId?)` | Fetch all settings. Admins can pass `targetUserId`. |
| `createMyJobSetting(formData)` | Add a new setting entry |
| `updateMyJobSetting(id, formData)` | Update an existing setting |
| `deleteMyJobSetting(id)` | Delete a setting |
| `toggleMyJobSetting(id, is_active)` | Enable/disable a setting |
| `initMyJobDefaultSettings()` | Auto-init defaults on first visit (no-op if already initialized) |

**Jobs:**
| Function | Description |
|---|---|
| `getMyJobs(targetUserId?)` | Fetch all personal jobs. Admins can pass `targetUserId`. |
| `createMyJob(formData)` | Create a personal job |
| `updateMyJob(id, formData)` | Update a personal job |
| `updateMyJobStatus(id, status)` | Update job status (drag-drop) |
| `archiveMyJob(id)` | Archive a job |
| `deleteMyJob(id)` | Delete a job |

**Tickets:**
| Function | Description |
|---|---|
| `getMyTickets(targetUserId?)` | Fetch all personal tickets. Admins can pass `targetUserId`. |
| `createMyTicket(formData)` | Create a personal ticket |
| `updateMyTicket(id, formData)` | Update a personal ticket |
| `updateMyTicketStatus(id, status)` | Update ticket status (drag-drop) |
| `deleteMyTicket(id)` | Delete a ticket |

---

## My Job Settings Page (`/jobs/my-job/settings`)

**File:** `my-job/settings/my-job-settings-view.tsx`

A full tabbed CRUD interface for managing personal workspace configuration.

**Tabs (dynamic):**
1. `Job Types` — Manage `job_type` entries
2. `Status: <Job Type>` — One tab per active job type, manages `status_<job_type_value>` entries
3. `Ticket Categories` — Manage `ticket_category` entries
4. `Ticket Statuses` — Manage `ticket_status` entries

**Features:**
- Add form with: value, label (TH/EN), color picker, sort order
- Inline edit
- Toggle active/inactive
- "Reset to Defaults" button — calls `initMyJobDefaultSettings()` (re-creates defaults if all deleted)
- Back link to `/jobs/my-job`

---

## Admin Job Page (`/jobs/admin-job`)

**Files:** `admin-job/page.tsx`, `admin-job/admin-job-dashboard.tsx`

**Access:** Admin-only. Non-admins are redirected to `/jobs/my-job`.

**Behavior:**
- URL param: `/jobs/admin-job?user=<uuid>`
- Admin picks a user from a `<Select>` dropdown
- The selected user's `my_jobs`, `my_tickets`, and `my_job_settings` are fetched via `getMyJobs(userId)`, `getMyTickets(userId)`, `getMyJobSettings(userId)`
- Renders `<MyJobDashboard ... readonly basePath="/jobs/admin-job?user=<uuid>" />`
- All mutation buttons are hidden (`readonly={true}`)
- No user selection = empty dashboard with prompt to select a user

---

## Shared Team Board (`/jobs`)

**File:** `page.tsx` → `jobs-dashboard.tsx`

Data loaded server-side via `Promise.all`:
- `getJobs()` — all non-archived team jobs
- `getJobSettings()` — pipeline statuses config
- `getSystemUsers()` — all staff for assignee picker
- `getJobTypes()` — job type definitions
- `getTickets()` — all non-archived team tickets
- `getTicketCategories()` — ticket category config

**Features:**
- Kanban board with drag-drop status updates
- Jobs and Tickets tabs
- Filter by status, tags, job type / ticket category
- Search
- Table view mode

---

## Jobs Settings (`/jobs/settings`)

**File:** `settings/page.tsx` → `settings-view.tsx`

System-wide settings management (admin). Manages:
- Job pipeline statuses per job type (`job_settings` table)
- Job types (`job_types` table)
- Checklist templates (reusable checklists for specific job types/statuses)
- Custom emoji management (upload, toggle active, delete)

---

## `actions.ts` — Shared Server Actions (Selection)

### System
| Function | Description |
|---|---|
| `getSystemUsers()` | Fetch all active staff profiles |

### Job Settings
| Function | Description |
|---|---|
| `getJobSettings(category?)` | Fetch job_settings rows |
| `createJobSetting(formData)` | Add setting |
| `updateJobSetting(id, formData)` | Update setting |
| `deleteJobSetting(id)` | Delete setting |
| `toggleJobSetting(id, is_active)` | Enable/disable |
| `getJobTypes()` | Fetch all job types |
| `createJobType(formData)` | Add job type |
| `updateJobType(id, formData)` | Update job type |
| `deleteJobType(id)` | Delete job type |

### Jobs
| Function | Description |
|---|---|
| `getJobs(filters?)` | Fetch jobs with optional filters |
| `getJob(id)` | Fetch single job by ID |
| `createJob(formData)` | Create job |
| `updateJob(id, formData)` | Update job |
| `updateJobStatus(id, newStatus)` | Status update (drag-drop) |
| `updateJobTags(id, tags[])` | Update tags |
| `deleteJob(id)` | Delete job |
| `archiveJob(id)` | Archive job |
| `unarchiveJob(id)` | Unarchive job |
| `getArchivedJobs()` | Fetch archived jobs |
| `getJobActivities(jobId)` | Fetch activity log |
| `createJobActivity(jobId, formData)` | Add activity entry |
| `createJobsFromLead(leadId)` | Generate jobs from CRM lead |
| `getJobsByLeadId(leadId)` | Get sibling jobs for a CRM lead |
| `getCrmLeadForJob(leadId)` | Get CRM lead linked to a job |

### Checklists
| Function | Description |
|---|---|
| `getChecklistTemplates(jobType?, status?)` | Fetch templates |
| `createChecklistTemplate(formData)` | Create template |
| `updateChecklistTemplate(id, formData)` | Update template |
| `deleteChecklistTemplate(id)` | Delete template |
| `getJobChecklists(jobId)` | Fetch checklists for a job |
| `toggleChecklistItem(...)` | Check/uncheck checklist item |

### Tickets
| Function | Description |
|---|---|
| `getTickets(filters?)` | Fetch tickets |
| `getTicket(id)` | Fetch single ticket |
| `createTicket(formData)` | Create ticket |
| `updateTicketStatus(id, newStatus)` | Status update |
| `deleteTicket(id)` | Delete ticket |
| `archiveTicket(id)` | Archive ticket |
| `unarchiveTicket(id)` | Unarchive ticket |
| `getArchivedTickets()` | Fetch archived tickets |
| `getTicketReplies(ticketId)` | Fetch replies |
| `createTicketReply(ticketId, formData)` | Add reply |
| `getTicketCategories()` | Fetch ticket categories |
| `getTicketOutcomes()` | Fetch ticket outcomes |
| `getTicketReportData()` | Full analytics dataset |
| `uploadTicketAttachments(formData)` | Upload file attachments |
| `deleteTicketAttachment(url)` | Delete attachment from storage |
| `getTicketReactions(ticketId)` | Fetch emoji reactions |
| `toggleTicketReaction(...)` | Add/remove reaction |
| `getTicketEmojis()` | Fetch standard emoji set |
| `getCustomEmojis()` | Fetch active custom emojis |
| `getAllCustomEmojis()` | Fetch all custom emojis (admin) |
| `uploadCustomEmoji(formData)` | Upload custom emoji |
| `deleteCustomEmoji(id)` | Delete custom emoji |
| `toggleCustomEmoji(id, isActive)` | Enable/disable custom emoji |

---

## Navigation

`jobs-nav.tsx` renders the top navigation. Tabs and visibility:

| Tab | Key | Icon | Admin Only |
|---|---|---|---|
| Board | `board` | LayoutDashboard | No |
| My Job | `myJob` | User | No |
| Admin Job | `adminJob` | ShieldCheck | **Yes** |
| Archive | `archive` | Archive | No |
| Report | `report` | BarChart3 | No |
| Settings | `settings` | Settings | No |

Active detection: The "Board" tab is active for `/jobs`, `/jobs/[id]`, and `/jobs/tickets/[id]` but NOT for any named sub-routes. All other tabs use `pathname.startsWith(href)`.

---

## SQL Migration Files

| File | Purpose |
|---|---|
| `create_my_job_tables.sql` | Creates `my_job_settings`, `my_jobs`, `my_tickets` with RLS policies |
| `create_template_tables.sql` | Creates checklist template tables |
| `update_kit_contents_schema.sql` | Schema updates for kit contents |

Run `create_my_job_tables.sql` once in Supabase SQL editor before using `/jobs/my-job`.

---

## Build Output (confirmed routes)

```
ƒ /jobs
ƒ /jobs/admin-job
ƒ /jobs/archive
ƒ /jobs/[id]
ƒ /jobs/my-job
ƒ /jobs/my-job/settings     ← per-user personal settings
ƒ /jobs/report
ƒ /jobs/settings
ƒ /jobs/tickets/[id]
```

All `ƒ` = dynamic server-rendered routes (no static pre-rendering).
