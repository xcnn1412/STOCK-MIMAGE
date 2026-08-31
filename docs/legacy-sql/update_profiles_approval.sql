-- Add approval status to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE;

-- Update existing users to be approved (so admin/existing staff don't get locked out)
UPDATE profiles SET is_approved = TRUE;
