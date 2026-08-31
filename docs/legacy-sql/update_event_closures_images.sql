-- Add image_urls column to event_closures table
ALTER TABLE event_closures ADD COLUMN IF NOT EXISTS image_urls TEXT[];

-- Create storage bucket for event closures if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('event_closures', 'event_closures', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: Allow authenticated uploads to event_closures
CREATE POLICY "Allow authenticated uploads to event_closures"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'event_closures');

-- Policy: Allow public read from event_closures
CREATE POLICY "Allow public read from event_closures"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'event_closures');
