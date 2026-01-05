-- Create a table to store login logs
CREATE TABLE IF NOT EXISTS login_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id),
    login_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    latitude NUMERIC,
    longitude NUMERIC,
    selfie_url TEXT
);

-- Note: You also need to create a public storage bucket named 'login_selfies' in Supabase Dashboard.
-- If you can run SQL to create buckets (requires specific extensions/permissions usually):
-- insert into storage.buckets (id, name, public) values ('login_selfies', 'login_selfies', true);
