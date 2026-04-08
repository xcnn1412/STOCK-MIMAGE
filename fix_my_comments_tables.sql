-- =============================================================================
-- FIX: my_job_comments & my_ticket_comments
-- 
-- Two issues:
-- 1) user_id referenced auth.users(id) but this app uses profiles(id)
--    → FK constraint fails on insert
-- 2) RLS policies used auth.uid() but this app uses custom cookie-based auth
--    → auth.uid() is always NULL → all operations blocked
--
-- Fix: Change FK to profiles(id) and disable RLS (auth is enforced in
-- server actions via getSession(), and service role client bypasses RLS anyway)
-- =============================================================================

-- -------------------------------------------------------
-- 1) Fix my_job_comments
-- -------------------------------------------------------

-- Drop existing RLS policies
DROP POLICY IF EXISTS "my_job_comments_select" ON my_job_comments;
DROP POLICY IF EXISTS "my_job_comments_insert" ON my_job_comments;
DROP POLICY IF EXISTS "my_job_comments_delete" ON my_job_comments;

-- Disable RLS (server actions enforce auth; service role bypasses RLS anyway)
ALTER TABLE my_job_comments DISABLE ROW LEVEL SECURITY;

-- Fix FK: change from auth.users(id) to profiles(id)
ALTER TABLE my_job_comments DROP CONSTRAINT IF EXISTS my_job_comments_user_id_fkey;
ALTER TABLE my_job_comments
    ADD CONSTRAINT my_job_comments_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- -------------------------------------------------------
-- 2) Fix my_ticket_comments
-- -------------------------------------------------------

-- Drop existing RLS policies
DROP POLICY IF EXISTS "my_ticket_comments_select" ON my_ticket_comments;
DROP POLICY IF EXISTS "my_ticket_comments_insert" ON my_ticket_comments;
DROP POLICY IF EXISTS "my_ticket_comments_delete" ON my_ticket_comments;

-- Disable RLS
ALTER TABLE my_ticket_comments DISABLE ROW LEVEL SECURITY;

-- Fix FK: change from auth.users(id) to profiles(id)
ALTER TABLE my_ticket_comments DROP CONSTRAINT IF EXISTS my_ticket_comments_user_id_fkey;
ALTER TABLE my_ticket_comments
    ADD CONSTRAINT my_ticket_comments_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
