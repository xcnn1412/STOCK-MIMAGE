-- ============================================================================
-- Expense Claims — Add 'refund_confirmed' status for advance settlement
--
-- After a user settles an advance and uploads a refund transfer slip,
-- an admin reviews the slip and confirms receipt of the refund.
-- The claim transitions to 'refund_confirmed' (terminal state) so no further
-- edits are allowed and the workflow is considered complete.
--
-- Only applies to advance claims where refund_amount > 0 and
-- refund_slip_urls has been populated.
-- ============================================================================

-- 1. Expand status CHECK constraint to include 'refund_confirmed'
ALTER TABLE expense_claims DROP CONSTRAINT IF EXISTS expense_claims_status_check;

ALTER TABLE expense_claims ADD CONSTRAINT expense_claims_status_check CHECK (
  status IN (
    'draft',
    'pending',
    'approved',
    'awaiting_payment',
    'pending_month_end',
    'waiting_tax_invoice',
    'paid',
    'rejected',
    'cancelled',
    'refund_confirmed'
  )
);

-- 2. Audit columns — who confirmed, when
ALTER TABLE expense_claims
  ADD COLUMN IF NOT EXISTS refund_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_confirmed_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expense_claims_refund_confirmed_by
  ON expense_claims(refund_confirmed_by);

-- 3. Expand notifications.type CHECK constraint
-- Also backfills the two expense_* types the app already uses
-- (expense_waiting_tax_invoice, expense_tax_invoice_uploaded) plus the new one.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'job_assigned',
  'job_status_changed',
  'job_mentioned',
  'job_comment',
  'ticket_assigned',
  'ticket_reply',
  'ticket_status_changed',
  'expense_approved',
  'expense_rejected',
  'expense_waiting_tax_invoice',
  'expense_tax_invoice_uploaded',
  'expense_refund_confirmed',
  'kpi_evaluated',
  'kpi_self_evaluated',
  'kpi_evaluation_reply',
  'crm_mentioned'
));
