-- Block a user from the site entirely (admin toggle in /users).
-- Distinct from is_approved=false which means "pending approval".
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false;
