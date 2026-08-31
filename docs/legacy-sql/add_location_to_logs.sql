-- Add location columns to activity_logs table
ALTER TABLE activity_logs 
ADD COLUMN IF NOT EXISTS location text,
ADD COLUMN IF NOT EXISTS latitude double precision,
ADD COLUMN IF NOT EXISTS longitude double precision;
