-- Create personal_notes table
CREATE TABLE IF NOT EXISTS personal_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT,
    color TEXT DEFAULT '#ffffff',
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create private_tickets table
CREATE TABLE IF NOT EXISTS private_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    description TEXT,
    priority TEXT NOT NULL DEFAULT 'normal',
    status TEXT NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_personal_notes_user_id ON personal_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_private_tickets_user_id ON private_tickets(user_id);

-- Row Level Security — users can only access their own rows
ALTER TABLE personal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_tickets ENABLE ROW LEVEL SECURITY;

-- RLS Policies: user access (own rows only)
CREATE POLICY "personal_notes_user_policy"
    ON personal_notes
    FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "private_tickets_user_policy"
    ON private_tickets
    FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Service role (used server-side) bypasses RLS automatically.
-- Admin reads are done using createServiceClient() which uses the service key.
