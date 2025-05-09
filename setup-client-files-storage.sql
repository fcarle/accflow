-- Add the recent_files column to the clients table if it doesn't exist
ALTER TABLE clients ADD COLUMN IF NOT EXISTS recent_files JSONB DEFAULT '[]'::jsonb;

-- Enable storage extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create a function to check if the authenticated user owns the requested client
-- This is used for storage policies
CREATE OR REPLACE FUNCTION auth.user_owns_client(client_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = client_id AND created_by = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- After executing this SQL, you need to go to the Supabase dashboard:
-- 1. Go to Storage > Create new bucket
-- 2. Create a bucket named "client-files" 
-- 3. Make it private (not public)
-- 4. Then add these policies for the bucket in the dashboard:

/*
  Policy Name: Allow authenticated users to upload files to their own client folders
  Policy Type: INSERT
  Definition: ((bucket_id = 'client-files'::text) AND (auth.user_owns_client(((storage.foldername(path))[2])::uuid)))
  
  Policy Name: Allow authenticated users to read files from their own client folders
  Policy Type: SELECT
  Definition: ((bucket_id = 'client-files'::text) AND (auth.user_owns_client(((storage.foldername(path))[2])::uuid)))
  
  Policy Name: Allow authenticated users to delete files from their own client folders
  Policy Type: DELETE
  Definition: ((bucket_id = 'client-files'::text) AND (auth.user_owns_client(((storage.foldername(path))[2])::uuid)))
*/ 