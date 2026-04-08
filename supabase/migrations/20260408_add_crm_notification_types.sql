-- Add crm_mentioned notification type and crm_lead reference type
-- This updates the CHECK constraints on the notifications table

-- Drop old type constraint (if it exists) and recreate with all types
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'job_assigned',
    'job_status_changed',
    'job_mentioned',
    'job_comment',
    'ticket_assigned',
    'ticket_reply',
    'ticket_status_changed',
    'expense_approved',
    'expense_rejected',
    'kpi_evaluated',
    'kpi_self_evaluated',
    'kpi_evaluation_reply',
    'crm_mentioned'
  ));

-- Drop old reference_type constraint and recreate with crm_lead
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_reference_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_reference_type_check CHECK (reference_type IN (
    'job',
    'ticket',
    'expense_claim',
    'kpi_evaluation',
    'crm_lead'
  ));
