# Jobs Feature Documentation

## Overview

Jobs (`/jobs`) is a dual-purpose project management system combining a **Kanban job board** for internal task tracking and a **Ticket support system** for handling requests and issues. It integrates with the CRM module, supports @mention notifications, and includes file attachments, emoji reactions, and configurable checklist templates.

---

## Navigation

File: `app/(authenticated)/jobs/jobs-nav.tsx`

| Tab | Route | Icon |
|-----|-------|------|
| Board | `/jobs` | LayoutDashboard |
| Archive | `/jobs/archive` | Archive |
| Report | `/jobs/report` | BarChart3 |
| Settings | `/jobs/settings` | Settings |

The nav tab **Board** stays active for `/jobs`, `/jobs/[id]`, and `/jobs/tickets/[id]` — but not for `/jobs/settings`, `/jobs/archive`, or `/jobs/report`.

---

## Routes & Files

```
app/(authenticated)/jobs/
├── layout.tsx                      # Wraps all pages with JobsNav
├── page.tsx                        # SSR: fetches all data → JobsDashboard
├── jobs-dashboard.tsx              # Main client component (board/tickets switcher)
├── jobs-nav.tsx                    # Top navigation tabs
├── actions.ts                      # All server actions (jobs + tickets)
├── components/
│   ├── job-kanban-board.tsx        # Drag & drop Kanban for jobs
│   ├── ticket-kanban-board.tsx     # Drag & drop Kanban for tickets
│   ├── add-job-dialog.tsx          # Dialog to create a new job
│   ├── add-ticket-dialog.tsx       # Dialog to create a new ticket
│   ├── emoji-picker.tsx            # Full emoji picker (standard + custom)
│   └── reaction-bar.tsx            # Discord-style emoji reactions
├── [id]/
│   ├── page.tsx                    # SSR: job detail page
│   └── job-detail.tsx              # Full job detail client component
├── tickets/[id]/
│   ├── page.tsx                    # SSR: ticket detail page
│   └── ticket-detail.tsx           # Full ticket detail client component
├── archive/
│   ├── page.tsx                    # SSR: archive page
│   └── archive-view.tsx            # Archive list for jobs + tickets
├── report/
│   ├── page.tsx                    # SSR: report page
│   └── report-view.tsx             # Ticket statistics dashboard
└── settings/
    ├── page.tsx                    # SSR: settings page
    └── settings-view.tsx           # Full settings management UI
```

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `jobs` | All job records |
| `job_settings` | Configurable lookup values (statuses, types, tags, ticket categories, etc.) |
| `job_activities` | Activity log entries per job (comments, status changes) |
| `job_checklist_templates` | Checklist group templates linked to job type + status |
| `job_checklist_items` | Per-job checkbox state (checked/unchecked) |
| `tickets` | All support ticket records |
| `ticket_replies` | Reply thread per ticket |
| `ticket_reactions` | Emoji reactions on tickets or ticket replies |
| `custom_emojis` | Uploaded custom emoji images for reactions |

---

## Part 1: Jobs (Kanban Board)

### Job Data Model

```typescript
interface Job {
    id: string
    crm_lead_id: string | null      // Linked CRM lead (optional)
    job_type: string                // Dynamic: e.g. 'graphic', 'onsite'
    status: string                  // Dynamic per job_type
    title: string
    description: string | null
    assigned_to: string[]           // Primary assignees (user IDs)
    assigned_graphics: string[]     // Graphic designer assignees
    assigned_staff: string[]        // On-site staff assignees
    tags: string[]                  // Tag values from job_settings.tag
    priority: string                // 'low' | 'medium' | 'high' | 'urgent'
    due_date: string | null
    event_date: string | null
    event_location: string | null
    customer_name: string | null
    notes: string | null
    created_by: string | null
    created_at: string
    updated_at: string
    archived_at: string | null
}
```

### Job Types

Job types are stored dynamically in `job_settings` with `category = 'job_type'`. Default types include `graphic` and `onsite`. Types can be created/edited/deleted from the Settings page.

### Job Statuses

Statuses are stored per job type in `job_settings` with `category = 'status_{jobType}'`. Each job type has its own independent set of statuses. Statuses have a `color` field for visual display and a `sort_order` for column ordering in the Kanban board.

**Priority levels** (hardcoded):
| Value | Thai | Color |
|-------|------|-------|
| `low` | ต่ำ | zinc |
| `medium` | ปานกลาง | blue |
| `high` | สูง | amber |
| `urgent` | เร่งด่วน | red |

### Jobs Kanban Board

File: `components/job-kanban-board.tsx`

- **Columns**: One column per active status in the current pipeline tab (job type)
- **Drag & Drop**: HTML5 drag API — dragging a card between columns calls `updateJobStatus()`
- **Optimistic UI**: `useOptimistic` used so the card moves immediately before server confirms
- **Card Info**: Title, customer name, assignees, due date, event date, location, priority flag, tags, archive button

### Job Detail

Route: `/jobs/[id]`  
File: `[id]/job-detail.tsx`

The detail page is a rich edit view with:
- **Edit mode**: Inline editing of title, description, dates, location, customer name, priority
- **Assignee management**: Multi-select dropdowns for `assigned_to`, `assigned_graphics`, `assigned_staff`
- **Tags**: Multi-select from configured tags
- **Status selector**: Dropdown of available statuses for the job's type
- **CRM Panel** (collapsible): Shows linked CRM lead data — package, payment installments, staff assignments, contact info
- **Checklist Panel**: Per-status checklist templates with toggle checkboxes
- **Activity Timeline**: Log of comments and status changes, latest first
- **Comment Input**: `MentionTextarea` for `@mention` support; mentioned user IDs passed as `notify_users`
- **Archive / Delete** actions

### Job Activities

Table: `job_activities`

```typescript
{
    id, job_id, created_by, created_at,
    activity_type: 'status_change' | 'note',
    description: string,
    old_status: string | null,
    new_status: string | null,
}
```

An activity is auto-created when:
- Status changes via drag or status selector
- A user adds a comment via the activity input

### Checklist Templates

Templates (stored in `job_checklist_templates`) are groups of checklist items tied to a specific `job_type` + `status`. When a job enters that status, the relevant checklist groups appear.

Per-job checkbox state is stored in `job_checklist_items` using an upsert with unique key `(job_id, template_id, item_index)`.

---

## Part 2: Tickets (Support System)

### Ticket Data Model

```typescript
interface Ticket {
    id: string
    ticket_number: string           // Auto-generated: TK-001, TK-002, ...
    subject: string
    category: string                // From job_settings.ticket_category
    description: string | null
    priority: string                // 'urgent' | 'high' | 'normal'
    desired_outcome: string | null  // From job_settings.ticket_outcome
    attachments: string[]           // Storage URLs
    status: string                  // From job_settings.status_ticket
    created_by: string | null
    assigned_to: string[]
    closed_at: string | null
    archived_at: string | null
    created_at, updated_at: string
}
```

Ticket number is auto-generated as `TK-{padded count}` (e.g. `TK-001`) using the total count of all existing tickets.

### Ticket Categories & Statuses

Both are managed through `job_settings`:
- Categories: `category = 'ticket_category'`
- Statuses: `category = 'status_ticket'`
- Outcomes: `category = 'ticket_outcome'`

### Tickets Kanban Board

File: `components/ticket-kanban-board.tsx`

- **Desktop**: Multi-column layout (one column per ticket status) — collapsible columns
- **Mobile**: Tab-based view (one tab per status)
- **Drag & Drop**: Calls `updateTicketStatus()` with optimistic update
- **Category filter**: Only shows tickets matching the selected category tab

### Ticket Detail

Route: `/jobs/tickets/[id]`  
File: `tickets/[id]/ticket-detail.tsx`

Features:
- **Reply thread**: Chronological list of replies rendered as a conversation
- **Reply types**: `comment` (normal reply), `status_change` (auto-added when status changes)
- **Rich text editor**: Full `RichTextEditor` for writing replies
- **File attachments**: `FileUploadZone` supporting images (jpg, png, gif, webp), PDF, docx, xlsx, zip/rar/7z up to 50MB each
- **Image lightbox**: Preview attached images in a full-screen lightbox
- **Emoji reactions**: `ReactionBar` — Discord-style; supports standard emoji + custom uploaded emoji; reactions can be placed on the ticket or on individual replies
- **Status change**: Dropdown to change status directly from the detail page
- **Auto-transition**: When a non-creator staff member replies to an `open` ticket, status automatically moves to `answered`
- **Archive / Delete** actions

### Ticket Replies

Table: `ticket_replies`

```typescript
{
    id, ticket_id, reply_type: 'comment' | 'status_change',
    content: string | null,
    attachments: string[],
    created_by, created_at
}
```

### Emoji Reactions

Table: `ticket_reactions`

```typescript
interface TicketReaction {
    id, ticket_id,
    reply_id: string | null,    // null = reaction on the ticket itself
    emoji: string,              // Unicode char or custom shortcode ':name:'
    user_id, created_at,
    profiles?: { full_name }
}
```

Custom emojis are stored in `custom_emojis` table and uploaded via `uploadCustomEmoji()`. They are referenced in reactions using `:shortcode:` syntax.

---

## Part 3: Archive

Route: `/jobs/archive`  
File: `archive/archive-view.tsx`

- Toggle between **Jobs** and **Tickets** archive
- Filter archived jobs by job type; archived tickets by category
- Search by title/subject
- **Restore**: calls `unarchiveJob()` or `unarchiveTicket()` — sets `archived_at = null`
- Archived jobs are excluded from the main board (`getJobs()` filters `is null archived_at` by default)

---

## Part 4: Report

Route: `/jobs/report`  
File: `report/report-view.tsx`

Statistics are computed server-side by `getTicketReportData()` (all tickets including archived).

**Metrics:**
| Metric | Description |
|--------|-------------|
| Total Tickets | Count of all tickets |
| Open | Open & not archived |
| Closed | Status is `closed` or `closed_at` set |
| Archived | `archived_at` not null |
| Avg Resolution Time | Mean hours from `created_at` to `closed_at` |
| By Category | Count per category, sorted descending |
| By Status | Count per status value |
| By Priority | Count per priority level |
| Monthly Trend | Last 6 months — ticket creation count per month |
| Closed by Category | Total vs closed per category |
| Top Creators | Top 10 users by ticket count + breakdown by category |
| Recent Closed | Last 10 closed tickets |

---

## Part 5: Settings

Route: `/jobs/settings`  
File: `settings/settings-view.tsx`

Settings are organized into tabs, dynamically generated:

| Tab Key | Content |
|---------|---------|
| `status_{jobType}` | One tab per job type — manage statuses (label_th, label_en, color, sort_order, active) |
| `tag` | Tags with per-job-type sub-tabs |
| `checklist` | Checklist template CRUD (grouped by job type + status) |
| `job_type` | Add/edit/delete pipeline types |
| `ticket_category` | Manage ticket category values |
| `status_ticket` | Manage ticket status values |
| `ticket_outcome` | Manage expected outcome options |
| `custom_emoji` | Upload/toggle/delete custom emoji images for reactions |

All settings entries have: `value`, `label_th`, `label_en`, `color`, `sort_order`, `is_active`.

---

## CRM Integration

Jobs can be directly linked to CRM leads via `crm_lead_id`.

### Create Jobs from Lead

`createJobsFromLead(leadId)` — called from the CRM lead detail page. It:
1. Fetches the CRM lead data
2. Finds the default first status for both `graphic` and `onsite` pipelines
3. Creates two jobs simultaneously — one for graphic design, one for on-site work
4. Copies `customer_name`, `event_date`, `event_location`, `notes` from the lead
5. Assigns `assigned_graphics` to the graphic job and `assigned_staff` to the onsite job
6. Logs a CRM activity: `ส่งต่องานแล้ว: กราฟฟิก + ออกหน้างาน`
7. Revalidates `/jobs`, `/crm`, and `/crm/[leadId]`

### Job Detail CRM Panel

When a job has a `crm_lead_id`, the detail page shows a collapsible CRM card (matching CRM UI style) with:
- Package/service info
- Payment installments (with paid/unpaid status)
- Staff assignments (from `crm_lead_staff` junction table)
- Contact details (phone, email, Line ID)

---

## Notification Triggers

All notifications use `createNotifications()` from `lib/notifications.ts`.

| Event | Type | Recipients |
|-------|------|-----------|
| Job created with assignees | `job_assigned` | `assigned_to` users |
| Job updated — new assignees | `job_assigned` | Newly added `assigned_to` users |
| Job status changed | `job_status_changed` | `assigned_to` + `created_by` |
| Job activity/comment added | `job_comment` | `assigned_to` + `created_by` |
| Job activity with @mentions | `job_mentioned` | `assigned_to` + `created_by` + mentioned users |
| Ticket status changed | `ticket_status_changed` | `assigned_to` + `created_by` |
| Ticket reply posted | `ticket_reply` | `assigned_to` + `created_by` + mentioned users |

**@mention flow**: The `MentionTextarea` component extracts mentioned user IDs and passes them as `notify_users` (comma-separated) in the `FormData`. The server action reads this field and includes those users in the notification recipients.

---

## Server Actions Reference

File: `app/(authenticated)/jobs/actions.ts`

### Job Settings
| Function | Description |
|----------|-------------|
| `getJobSettings(category?)` | Fetch all settings, optionally filtered by category |
| `createJobSetting(formData)` | Create new setting entry |
| `updateJobSetting(id, formData)` | Update setting entry |
| `deleteJobSetting(id)` | Delete setting entry |
| `toggleJobSetting(id, is_active)` | Toggle active state |

### Job Types
| Function | Description |
|----------|-------------|
| `getJobTypes()` | Fetch `job_settings` where `category = 'job_type'` |
| `createJobType(formData)` | Create job type |
| `updateJobType(id, formData)` | Update label/color |
| `deleteJobType(id)` | Delete job type |

### Jobs
| Function | Description |
|----------|-------------|
| `getJobs(filters?)` | Fetch jobs (excl. archived by default); supports `job_type`, `status`, `search`, `includeArchived` |
| `getJob(id)` | Fetch single job |
| `createJob(formData)` | Create job; notifies assignees |
| `updateJob(id, formData)` | Update job; notifies new assignees |
| `updateJobStatus(id, newStatus)` | Update status; logs activity; notifies assigned + creator |
| `updateJobTags(id, tags)` | Update tags array |
| `deleteJob(id)` | Hard delete |
| `archiveJob(id)` | Set `archived_at`; logs activity |
| `unarchiveJob(id)` | Clear `archived_at`; logs activity |

### Job Activities
| Function | Description |
|----------|-------------|
| `getJobActivities(jobId)` | Fetch all activities for a job (with profile join) |
| `createJobActivity(jobId, formData)` | Add comment/note; notifies participants and @mentioned users |

### CRM Integration
| Function | Description |
|----------|-------------|
| `createJobsFromLead(leadId)` | Create graphic + onsite jobs from a CRM lead |
| `getJobsByLeadId(leadId)` | Get all jobs linked to a lead |
| `getCrmLeadForJob(leadId)` | Get full CRM lead data for job detail panel |

### Checklist
| Function | Description |
|----------|-------------|
| `getChecklistTemplates(jobType?, status?)` | Fetch templates |
| `createChecklistTemplate(formData)` | Create template group |
| `updateChecklistTemplate(id, formData)` | Update template |
| `deleteChecklistTemplate(id)` | Delete template |
| `getJobChecklists(jobId)` | Fetch per-job checkbox states |
| `toggleChecklistItem(jobId, templateId, itemIndex, checked)` | Upsert/update checkbox state |

### Tickets
| Function | Description |
|----------|-------------|
| `getTickets(filters?)` | Fetch tickets; supports `category`, `status`, `search`, `includeArchived` |
| `getTicket(id)` | Fetch single ticket |
| `createTicket(formData)` | Create ticket with auto-number |
| `updateTicketStatus(id, newStatus)` | Update status; inserts status-change reply; notifies participants |
| `getTicketReplies(ticketId)` | Fetch reply thread |
| `createTicketReply(ticketId, formData)` | Add reply; auto-transition to `answered`; notifies participants |
| `deleteTicket(id)` | Hard delete |
| `archiveTicket(id)` | Set `archived_at` |
| `unarchiveTicket(id)` | Clear `archived_at` |
| `getTicketCategories()` | Fetch active ticket categories |
| `getTicketOutcomes()` | Fetch active ticket outcomes |

### Archive & Report
| Function | Description |
|----------|-------------|
| `getArchivedJobs()` | Fetch all archived jobs |
| `getArchivedTickets()` | Fetch all archived tickets |
| `getTicketReportData()` | Aggregate ticket statistics (all-time) |

### File Attachments
| Function | Description |
|----------|-------------|
| `uploadTicketAttachments(formData)` | Upload files to Supabase Storage; validates MIME type and 50MB size limit |

**Allowed MIME types**: `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `application/pdf`, `.docx`, `.xlsx`, `application/zip`, `.rar`, `.7z`

### Reactions & Custom Emoji
| Function | Description |
|----------|-------------|
| `getTicketReactions(ticketId)` | Fetch all reactions for a ticket (including on replies) |
| `toggleTicketReaction(ticketId, replyId, emoji, userId)` | Add or remove a reaction |
| `getCustomEmojis()` | Fetch active custom emojis |
| `getAllCustomEmojis()` | Fetch all custom emojis (including inactive) |
| `uploadCustomEmoji(formData)` | Upload custom emoji image to storage |
| `deleteCustomEmoji(id)` | Delete custom emoji |
| `toggleCustomEmoji(id, isActive)` | Toggle custom emoji active state |

---

## Key Component Patterns

### Optimistic UI
Both Kanban boards use `useOptimistic` (React 18) for instant visual feedback when dragging cards. The optimistic state is updated immediately; if the server action fails, React rolls back automatically.

### MentionTextarea
`components/mention-textarea.tsx` is used in job activity comments. It parses `@username` patterns and resolves them to user IDs. Mentioned user IDs are passed as `notify_users` in FormData to server actions.

### Search Input Sanitization
`getJobs()` and `getTickets()` sanitize the search string by stripping `. , ( )` before building the `ilike` query to prevent SQL injection via ILIKE patterns.

### Emoji Reactions (ReactionBar)
- Groups reactions by emoji
- Shows tooltip with reactor names on hover
- Supports both Unicode emoji (via `TwemojiImg`) and custom shortcode emoji (`:shortcode:`)
- Toggle: clicking an existing reaction you own removes it; clicking a new one adds it
- Picker: full emoji picker with custom emoji section
