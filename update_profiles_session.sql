-- Add a column to store the active session ID
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS active_session_id UUID;

-- Optional: Index for performance if checking explicitly (though we usually query by ID)
-- CREATE INDEX IF NOT EXISTS idx_profiles_active_session_id ON profiles(active_session_id);
