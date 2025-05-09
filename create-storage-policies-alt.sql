-- Add the recent_files column to the clients table if it doesn't exist
ALTER TABLE clients ADD COLUMN IF NOT EXISTS recent_files JSONB DEFAULT '[]'::jsonb;

-- Create policies using Supabase's built-in functions
-- First enable RLS on the bucket if it's not already enabled
SELECT storage.enable_replication();

-- Create an INSERT policy for the client-files bucket
BEGIN;
  SELECT storage.create_policy(
    'client-files',                        -- bucket name
    'Allow authenticated uploads',         -- policy name
    'INSERT',                              -- operation
    'auth.role() = ''authenticated''',     -- policy definition
    ''                                     -- definition with check (can be empty for INSERT)
  );
COMMIT;

-- Create a SELECT policy for the client-files bucket
BEGIN;
  SELECT storage.create_policy(
    'client-files',                        -- bucket name
    'Allow authenticated downloads',       -- policy name
    'SELECT',                              -- operation
    'auth.role() = ''authenticated''',     -- policy definition
    ''                                     -- definition with check (can be empty for SELECT)
  );
COMMIT;

-- Create a DELETE policy for the client-files bucket
BEGIN;
  SELECT storage.create_policy(
    'client-files',                        -- bucket name
    'Allow authenticated deletions',       -- policy name
    'DELETE',                              -- operation
    'auth.role() = ''authenticated''',     -- policy definition
    ''                                     -- definition with check (can be empty for DELETE)
  );
COMMIT;

-- Create an UPDATE policy for the client-files bucket
BEGIN;
  SELECT storage.create_policy(
    'client-files',                        -- bucket name
    'Allow authenticated updates',         -- policy name
    'UPDATE',                              -- operation
    'auth.role() = ''authenticated''',     -- policy definition
    ''                                     -- definition with check (can be empty for UPDATE)
  );
COMMIT; 