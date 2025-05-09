-- First add the recent_files column to the clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS recent_files JSONB DEFAULT '[]'::jsonb;

-- Storage bucket and policy setup for Supabase
-- Make sure you run this in the Supabase SQL editor

-- Create the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name)
VALUES ('client-files', 'client-files')
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on the bucket
UPDATE storage.buckets SET public = false WHERE id = 'client-files';

-- Create policies for the client-files bucket

-- Allow authenticated uploads
CREATE POLICY "Allow authenticated uploads"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'client-files');

-- Allow authenticated downloads
CREATE POLICY "Allow authenticated downloads"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'client-files');

-- Allow authenticated deletions
CREATE POLICY "Allow authenticated deletions"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'client-files');

-- Allow authenticated updates
CREATE POLICY "Allow authenticated updates"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'client-files');

-- NOTE: Run this script in the Supabase SQL Editor, not directly on the database
-- If policies already exist, you may need to drop them first with:
-- DROP POLICY IF EXISTS "policy_name" ON storage.objects; 