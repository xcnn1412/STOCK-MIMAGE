-- IMPORTANT: Run this in Supabase SQL Editor to allow image uploads

-- 1. Allow Uploads (INSERT) for everyone (Authenticated & Anon) to 'login_selfies'
-- This is required because the login happens *before* the user has a session.
CREATE POLICY "Allow public uploads to login_selfies"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (bucket_id = 'login_selfies');

-- 2. Allow Deletion (DELETE) for everyone to 'login_selfies'
-- This is required for the Logout action to cleanup the image.
CREATE POLICY "Allow public delete from login_selfies"
ON storage.objects
FOR DELETE
TO public
USING (bucket_id = 'login_selfies');

-- 3. Allow Select (Read) is already handled by the "Public" bucket setting, 
-- but you can add this if you face reading issues:
CREATE POLICY "Allow public read from login_selfies"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'login_selfies');
