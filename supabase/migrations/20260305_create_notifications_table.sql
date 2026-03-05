-- ============================================================================
-- Notifications Table
-- ============================================================================

CREATE TABLE notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'job_assigned',
    'job_status_changed',
    'job_mentioned',
    'job_comment',
    'ticket_assigned',
    'ticket_reply',
    'expense_approved',
    'expense_rejected'
  )),
  title TEXT NOT NULL,
  body TEXT,
  reference_type TEXT NOT NULL CHECK (reference_type IN ('job', 'ticket', 'expense_claim')),
  reference_id UUID NOT NULL,
  actor_id UUID REFERENCES profiles(id),
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_notifications_user_unread ON notifications(user_id) WHERE is_read = false;
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_reference ON notifications(reference_type, reference_id);

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select" ON notifications
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "notifications_insert" ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "notifications_update" ON notifications
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()));
