-- Add the recent_files column to the clients table if it doesn't exist
ALTER TABLE clients ADD COLUMN IF NOT EXISTS recent_files JSONB DEFAULT '[]'::jsonb;

-- Create a simpler policy for the bucket that just checks if the user is authenticated
-- These are more permissive policies to test functionality first
INSERT INTO storage.policies (name, definition, owner, created_at, updated_at, bucket_id)
VALUES 
  (
    'Allow authenticated uploads', 
    'auth.role() = ''authenticated''', 
    auth.uid(), 
    now(), 
    now(), 
    'client-files'
  )
ON CONFLICT (name, bucket_id) DO 
  UPDATE SET definition = 'auth.role() = ''authenticated''';

-- Create SELECT and DELETE policies for authenticated users
INSERT INTO storage.policies (name, definition, owner, created_at, updated_at, bucket_id)
VALUES 
  (
    'Allow authenticated downloads', 
    'auth.role() = ''authenticated''', 
    auth.uid(), 
    now(), 
    now(), 
    'client-files'
  )
ON CONFLICT (name, bucket_id) DO 
  UPDATE SET definition = 'auth.role() = ''authenticated''';

INSERT INTO storage.policies (name, definition, owner, created_at, updated_at, bucket_id)
VALUES 
  (
    'Allow authenticated deletions', 
    'auth.role() = ''authenticated''', 
    auth.uid(), 
    now(), 
    now(), 
    'client-files'
  )
ON CONFLICT (name, bucket_id) DO 
  UPDATE SET definition = 'auth.role() = ''authenticated'''; 