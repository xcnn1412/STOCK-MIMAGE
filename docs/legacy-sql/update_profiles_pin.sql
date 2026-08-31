-- Run this in Supabase SQL Editor to add PIN support
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pin TEXT; -- Storing 6-digit PIN

-- Optional: Ensure phone is unique
ALTER TABLE profiles ADD CONSTRAINT profiles_phone_key UNIQUE (phone);
