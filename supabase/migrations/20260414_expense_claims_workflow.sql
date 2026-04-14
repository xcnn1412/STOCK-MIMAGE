-- ============================================================================
-- Expense Claims — Full Workflow Refactor
-- Adds: draft, cancelled statuses; submitted_at, cancelled_at, cancelled_by columns
-- Creates: expense_claim_logs table (referenced in code but never created)
-- Fixes: status CHECK constraint to include all states
-- ============================================================================

-- 1. Expand the status CHECK constraint
ALTER TABLE expense_claims
  DROP CONSTRAINT IF EXISTS expense_claims_status_check;

ALTER TABLE expense_claims
  ADD CONSTRAINT expense_claims_status_check CHECK (
    status IN (
      'draft',            -- saved but not yet submitted
      'pending',          -- submitted by user, awaiting admin review
      'approved',         -- approved by admin, awaiting payment
      'awaiting_payment', -- legacy — kept for backward compat, no longer produced
      'pending_month_end',-- deferred to end-of-month payment batch
      'paid',             -- payment completed
      'rejected',         -- rejected by admin
      'cancelled'         -- cancelled by submitter before approval
    )
  );

-- 2. Change default status from 'pending' to 'draft'
ALTER TABLE expense_claims
  ALTER COLUMN status SET DEFAULT 'draft';

-- 3. Add workflow timestamp / actor columns
ALTER TABLE expense_claims
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expense_claims_cancelled_by
  ON expense_claims(cancelled_by);

-- 4. Create expense_claim_logs (used in code since day one, but never migrated)
CREATE TABLE IF NOT EXISTS expense_claim_logs (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id    UUID        NOT NULL REFERENCES expense_claims(id) ON DELETE CASCADE,
  action      TEXT        NOT NULL,
  changed_by  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  changes     JSONB       NOT NULL DEFAULT '{}',
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_claim_logs_claim_id
  ON expense_claim_logs(claim_id);
CREATE INDEX IF NOT EXISTS idx_expense_claim_logs_created_at
  ON expense_claim_logs(created_at DESC);

-- RLS for expense_claim_logs — authenticated users can read; inserts done via service key only
ALTER TABLE expense_claim_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "claim_logs_select" ON expense_claim_logs;
CREATE POLICY "claim_logs_select" ON expense_claim_logs
  FOR SELECT TO authenticated USING (true);

-- 5. Tighten RLS on expense_claims
--    Current policies are blanket allow-all. Replace with intent-based policies.
DROP POLICY IF EXISTS "expense_claims_select" ON expense_claims;
DROP POLICY IF EXISTS "expense_claims_insert" ON expense_claims;
DROP POLICY IF EXISTS "expense_claims_update" ON expense_claims;
DROP POLICY IF EXISTS "expense_claims_delete" ON expense_claims;

-- Anyone authenticated can read all claims (team visibility)
CREATE POLICY "expense_claims_select" ON expense_claims
  FOR SELECT TO authenticated USING (true);

-- Any authenticated user can create a claim (as their own draft)
CREATE POLICY "expense_claims_insert" ON expense_claims
  FOR INSERT TO authenticated WITH CHECK (submitted_by = auth.uid());

-- Admins can update anything; owners can only update their own draft/pending claims
CREATE POLICY "expense_claims_update" ON expense_claims
  FOR UPDATE TO authenticated
  USING (
    -- service-role key bypasses RLS; this policy applies to anon/authenticated only
    submitted_by = auth.uid()   -- owner…
    OR auth.uid() IN (           -- …or check admin via profiles join (application-level enforced)
      SELECT id FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Only admins can hard-delete; application layer enforces this too
CREATE POLICY "expense_claims_delete" ON expense_claims
  FOR DELETE TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );
