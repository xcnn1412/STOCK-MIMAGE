-- Add staff column to events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS staff TEXT;

-- Add event_id to kits table to link a kit to an event
ALTER TABLE kits ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES events(id) ON DELETE SET NULL;
