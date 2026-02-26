-- ============================================================================
-- Expense Claims — ระบบเบิกเงิน
-- ============================================================================

CREATE TABLE IF NOT EXISTS expense_claims (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    claim_number TEXT NOT NULL,
    claim_type TEXT NOT NULL CHECK (claim_type IN ('event', 'other')),
    job_event_id UUID REFERENCES job_cost_events(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'other',
    amount NUMERIC NOT NULL DEFAULT 0,
    quantity INT NOT NULL DEFAULT 1,
    total_amount NUMERIC GENERATED ALWAYS AS (amount * quantity) STORED,
    receipt_urls TEXT[] DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    submitted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    reject_reason TEXT,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_expense_claims_status ON expense_claims(status);
CREATE INDEX idx_expense_claims_submitted_by ON expense_claims(submitted_by);
CREATE INDEX idx_expense_claims_job_event_id ON expense_claims(job_event_id);
CREATE INDEX idx_expense_claims_created_at ON expense_claims(created_at DESC);

-- RLS
ALTER TABLE expense_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expense_claims_select" ON expense_claims FOR SELECT TO authenticated USING (true);
CREATE POLICY "expense_claims_insert" ON expense_claims FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "expense_claims_update" ON expense_claims FOR UPDATE TO authenticated USING (true);
CREATE POLICY "expense_claims_delete" ON expense_claims FOR DELETE TO authenticated USING (true);
