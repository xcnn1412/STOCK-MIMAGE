-- =============================================================================
-- My Job Comment Tables
-- Comments on personal jobs and tickets (with sticker + image attachment support)
-- =============================================================================

-- -------------------------
-- Job Comments
-- -------------------------
CREATE TABLE IF NOT EXISTS my_job_comments (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id      uuid NOT NULL REFERENCES my_jobs(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content     text,
    attachments text[] NOT NULL DEFAULT '{}',
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS my_job_comments_job_id_idx     ON my_job_comments(job_id);
CREATE INDEX IF NOT EXISTS my_job_comments_created_at_idx ON my_job_comments(created_at);

ALTER TABLE my_job_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "my_job_comments_select" ON my_job_comments
    FOR SELECT USING (
        auth.uid() IS NOT NULL AND (
            user_id = auth.uid()
            OR job_id IN (SELECT id FROM my_jobs WHERE user_id = auth.uid())
            OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
        )
    );

CREATE POLICY "my_job_comments_insert" ON my_job_comments
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "my_job_comments_delete" ON my_job_comments
    FOR DELETE USING (
        user_id = auth.uid()
        OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    );

-- -------------------------
-- Ticket Comments
-- -------------------------
CREATE TABLE IF NOT EXISTS my_ticket_comments (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id   uuid NOT NULL REFERENCES my_tickets(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content     text,
    attachments text[] NOT NULL DEFAULT '{}',
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS my_ticket_comments_ticket_id_idx  ON my_ticket_comments(ticket_id);
CREATE INDEX IF NOT EXISTS my_ticket_comments_created_at_idx ON my_ticket_comments(created_at);

ALTER TABLE my_ticket_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "my_ticket_comments_select" ON my_ticket_comments
    FOR SELECT USING (
        auth.uid() IS NOT NULL AND (
            user_id = auth.uid()
            OR ticket_id IN (SELECT id FROM my_tickets WHERE user_id = auth.uid())
            OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
        )
    );

CREATE POLICY "my_ticket_comments_insert" ON my_ticket_comments
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "my_ticket_comments_delete" ON my_ticket_comments
    FOR DELETE USING (
        user_id = auth.uid()
        OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    );
