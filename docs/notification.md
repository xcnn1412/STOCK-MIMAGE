# Notification System

## Overview

The notification system delivers real-time in-app alerts to users when relevant events occur across Jobs, Tickets, Finance, and KPI modules. It combines a **Bell Dropdown** (persistent history) and **Toast Popups** (temporary desktop alerts).

---

## Architecture

```
Event (Server Action)
  └── createNotifications()          ← lib/notifications.ts
        └── INSERT → notifications table (Supabase)

Client Polling (every 15–30s)
  └── GET /api/notifications/count   ← app/api/notifications/count/route.ts
        └── returns { count: number }

Bell Dropdown opens
  └── getNotifications(30)           ← app/(authenticated)/notifications/actions.ts
        └── SELECT with actor JOIN

Toast Container
  └── polls count every 15s
      └── on increase → fetches newest items → renders ToastCard
```

---

## Database Schema

**Table: `notifications`**

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `user_id` | UUID → profiles | Recipient user |
| `type` | TEXT | Notification type (see below) |
| `title` | TEXT | Main notification text |
| `body` | TEXT | Optional detail/context |
| `reference_type` | TEXT | `job` / `ticket` / `expense_claim` / `kpi_evaluation` |
| `reference_id` | UUID | ID of the referenced record |
| `actor_id` | UUID → profiles | User who triggered the event |
| `is_read` | BOOLEAN | Default `false` |
| `read_at` | TIMESTAMPTZ | Timestamp when marked read |
| `created_at` | TIMESTAMPTZ | Auto-set on insert |

**Indexes:**
- `idx_notifications_user_unread` — fast unread count per user
- `idx_notifications_user_created` — ordered list per user
- `idx_notifications_reference` — lookup by reference

**Row Level Security:**
- `SELECT` — user sees only their own notifications (`user_id = auth.uid()`)
- `INSERT` — any authenticated user can create
- `UPDATE` — user can only update their own records

---

## Notification Types

| Type | Trigger | Icon |
|---|---|---|
| `job_assigned` | Job created/updated with new assignee | ⭐ |
| `job_status_changed` | Job status updated | 🔄 |
| `job_mentioned` | Comment with @mention in a job | 📣 |
| `job_comment` | Comment added to a job | 💬 |
| `ticket_assigned` | Ticket assigned to user | 🎫 |
| `ticket_reply` | Reply added to a ticket | 📝 |
| `ticket_status_changed` | Ticket status updated | 🔔 |
| `expense_approved` | Expense claim approved by admin | ✅ |
| `expense_rejected` | Expense claim rejected by admin | ❌ |
| `kpi_evaluated` | Admin evaluates a staff member's KPI | 📊 |
| `kpi_self_evaluated` | Staff submits their own self-evaluation | 📝 |
| `kpi_evaluation_reply` | Reply added to a KPI evaluation | 💬 |

---

## Reference Types & Deep Links

| `reference_type` | Navigation URL |
|---|---|
| `job` | `/jobs/{reference_id}` |
| `ticket` | `/jobs/tickets/{reference_id}` |
| `expense_claim` | `/finance` |
| `kpi_evaluation` | `/kpi/reports` |

---

## Core Function

**`createNotifications(params)`** — `lib/notifications.ts`

```ts
interface CreateNotificationParams {
  userIds: string[]       // Target recipients
  type: NotificationType
  title: string
  body?: string
  referenceType: ReferenceType
  referenceId: string
  actorId: string         // The user who triggered the event
}
```

**Self-notification prevention:** `actorId` is automatically removed from `userIds` before inserting.  
**Deduplication:** `Set` removes duplicate user IDs before batch insert.

---

## Trigger Points

### Jobs Module — `app/(authenticated)/jobs/actions.ts`

| Action | Notification Type | Recipients |
|---|---|---|
| `createJob` | `job_assigned` | All users in `assigned_to` |
| `updateJob` | `job_assigned` | Newly added assignees only |
| `updateJobStatus` | `job_status_changed` | `assigned_to` + `created_by` |
| `createJobActivity` (with @mention) | `job_mentioned` | Assigned + creator + mentioned users |
| `createJobActivity` (comment) | `job_comment` | Assigned + creator + mentioned users |
| `updateTicketStatus` | `ticket_status_changed` | `assigned_to` + `created_by` |
| `createTicketReply` | `ticket_reply` | `assigned_to` + `created_by` + mentioned |

### Finance Module — `app/(authenticated)/finance/actions.ts`

| Action | Notification Type | Recipients |
|---|---|---|
| `approveClaim` | `expense_approved` | Claim submitter |
| `rejectClaim` | `expense_rejected` | Claim submitter |

### KPI Module — `app/(authenticated)/kpi/actions.ts`

| Action | Notification Type | Recipients |
|---|---|---|
| `submitEvaluation` | `kpi_evaluated` | The evaluated staff member |
| `submitSelfEvaluation` | `kpi_self_evaluated` | All approved admins |
| `createEvaluationReply` | `kpi_evaluation_reply` | Evaluator + assignee + mentioned users |

---

## Server Actions

**File:** `app/(authenticated)/notifications/actions.ts`

| Function | Description |
|---|---|
| `getUnreadCount()` | Returns integer count of unread notifications for session user |
| `getNotifications(limit?)` | Returns up to `limit` (default 30) notifications, ordered by newest, with actor name |
| `markAsRead(id)` | Sets `is_read = true`, `read_at = now()` for a single notification |
| `markAllAsRead()` | Sets all unread notifications for the session user as read |

All actions use `getSessionLight()` to authenticate and scope results to the current user.

---

## REST API

**`GET /api/notifications/count`** — `app/api/notifications/count/route.ts`

Returns `{ count: number }` for the session user's unread notifications.  
Returns `{ count: 0 }` with HTTP 401 if not authenticated.

Used for polling from client components without calling a Server Action.

---

## Components

### NotificationBell — `components/notification-bell.tsx`

Rendered in the top navbar. Displays a bell icon with an unread badge.

**Behavior:**
- Polls `/api/notifications/count` every **30 seconds**
- Badge shows count (capped at `99+`)
- Click opens a dropdown showing up to 30 recent notifications
- Unread items highlighted with blue background + blue dot indicator
- Click on item → marks as read → navigates to the relevant page
- "อ่านทั้งหมด" button marks all as read instantly
- Closes on outside click

### NotificationToastContainer — `components/notification-toast.tsx`

Desktop-only popup notification stack. Rendered in providers/layout.

**Behavior:**
- Polls `/api/notifications/count` every **15 seconds**
- On count increase → fetches newest unread notifications
- Plays `/sounds/notification.wav` at 40% volume
- Renders up to **3 toast cards** simultaneously (LIFO order)
- Each toast auto-dismisses after **8 seconds** with a progress bar countdown
- Shows gradient accent strip, colored left border, and actor badge
- Click navigates to the relevant page and marks as read
- Hidden on mobile (`hidden md:flex`)

---

## Files Reference

| File | Role |
|---|---|
| `lib/notifications.ts` | Core `createNotifications()` utility + type definitions |
| `app/(authenticated)/notifications/actions.ts` | Server actions for reading/marking notifications |
| `app/api/notifications/count/route.ts` | REST endpoint for polling unread count |
| `components/notification-bell.tsx` | Bell icon + dropdown in navbar |
| `components/notification-toast.tsx` | Desktop toast popup container + card |
| `supabase/migrations/20260305_create_notifications_table.sql` | Database schema + RLS policies |

---

## Security Notes

- RLS enforces per-user data isolation at the database level.
- `markAsRead` and `markAllAsRead` verify `user_id = session_user_id` via the `.eq('user_id', userId)` filter — users cannot mark others' notifications as read.
- `actorId` exclusion prevents self-notification spam.
- The API route returns `{ count: 0 }` (not an error body) for unauthenticated requests to avoid information leakage.
