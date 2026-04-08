-- =============================================================================
-- My Job Tables — Personal workspace separate from main jobs/tickets system
-- Run in Supabase SQL editor
-- =============================================================================

-- 1) my_job_settings: per-user kanban configuration
--    categories: job_type | status_{jobType} | tag | ticket_category | status_ticket | ticket_outcome
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS my_job_settings (
    id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    category    text        NOT NULL,
    value       text        NOT NULL,
    label_th    text        NOT NULL DEFAULT '',
    label_en    text        NOT NULL DEFAULT '',
    color       text,
    sort_order  int         NOT NULL DEFAULT 0,
    is_active   boolean     NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE my_job_settings ENABLE ROW LEVEL SECURITY;

-- Users can fully manage their own settings
CREATE POLICY "my_job_settings: own user"
    ON my_job_settings FOR ALL TO authenticated
    USING  (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Admins can read all (for admin-job view)
CREATE POLICY "my_job_settings: admin read all"
    ON my_job_settings FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE INDEX IF NOT EXISTS my_job_settings_user_id_category_idx ON my_job_settings(user_id, category);


-- 2) my_jobs: personal kanban cards
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS my_jobs (
    id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    job_type    text        NOT NULL DEFAULT 'personal',
    status      text        NOT NULL DEFAULT 'todo',
    title       text        NOT NULL,
    description text,
    tags        text[]      NOT NULL DEFAULT '{}',
    priority    text        NOT NULL DEFAULT 'medium',
    due_date    date,
    notes       text,
    sort_order  int         NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    archived_at timestamptz
);

ALTER TABLE my_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "my_jobs: own user"
    ON my_jobs FOR ALL TO authenticated
    USING  (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "my_jobs: admin read all"
    ON my_jobs FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE INDEX IF NOT EXISTS my_jobs_user_id_idx ON my_jobs(user_id);
CREATE INDEX IF NOT EXISTS my_jobs_user_archived_idx ON my_jobs(user_id, archived_at);


-- 3) my_tickets: personal tickets
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS my_tickets (
    id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    subject     text        NOT NULL,
    description text,
    status      text        NOT NULL DEFAULT 'open',
    category    text        NOT NULL DEFAULT 'general',
    priority    text        NOT NULL DEFAULT 'medium',
    outcome     text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE my_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "my_tickets: own user"
    ON my_tickets FOR ALL TO authenticated
    USING  (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "my_tickets: admin read all"
    ON my_tickets FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE INDEX IF NOT EXISTS my_tickets_user_id_idx ON my_tickets(user_id);
