-- Create event_closures table to store event closure history
CREATE TABLE IF NOT EXISTS event_closures (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_name TEXT NOT NULL,
    event_date TIMESTAMP WITH TIME ZONE,
    event_location TEXT,
    closed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    closed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    -- Store kit and item details as JSONB for historical reference
    kits_snapshot JSONB,  -- Array of { kitId, kitName, items: [{ itemId, itemName, serialNumber, status, imageUrl }] }
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE event_closures ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all authenticated users to view closures
DROP POLICY IF EXISTS "Allow authenticated read" ON event_closures;
CREATE POLICY "Allow authenticated read"
  ON event_closures FOR SELECT
  USING (true);

-- Policy: Allow insert from server actions
DROP POLICY IF EXISTS "Allow insert" ON event_closures;
CREATE POLICY "Allow insert"
  ON event_closures FOR INSERT
  WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_event_closures_closed_at ON event_closures(closed_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_closures_closed_by ON event_closures(closed_by);

-- Comment
COMMENT ON TABLE event_closures IS 'Historical record of event closures including kit/item snapshots';
