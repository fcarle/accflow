-- Create storage policies for the client-files bucket
-- These simple policies allow any authenticated user to access the bucket

-- INSERT policy - allows authenticated users to upload files
INSERT INTO storage.policies (name, definition, owner, created_at, updated_at, bucket_id, operation)
VALUES 
  (
    'Allow authenticated uploads', 
    'auth.role() = ''authenticated''', 
    auth.uid(), 
    now(), 
    now(), 
    'client-files',
    'INSERT'
  )
ON CONFLICT (name, bucket_id) DO 
  UPDATE SET definition = 'auth.role() = ''authenticated''';

-- SELECT policy - allows authenticated users to download files
INSERT INTO storage.policies (name, definition, owner, created_at, updated_at, bucket_id, operation)
VALUES 
  (
    'Allow authenticated downloads', 
    'auth.role() = ''authenticated''', 
    auth.uid(), 
    now(), 
    now(), 
    'client-files',
    'SELECT'
  )
ON CONFLICT (name, bucket_id) DO 
  UPDATE SET definition = 'auth.role() = ''authenticated''';

-- DELETE policy - allows authenticated users to delete files
INSERT INTO storage.policies (name, definition, owner, created_at, updated_at, bucket_id, operation)
VALUES 
  (
    'Allow authenticated deletions', 
    'auth.role() = ''authenticated''', 
    auth.uid(), 
    now(), 
    now(), 
    'client-files',
    'DELETE'
  )
ON CONFLICT (name, bucket_id) DO 
  UPDATE SET definition = 'auth.role() = ''authenticated''';

-- UPDATE policy - allows authenticated users to update files
INSERT INTO storage.policies (name, definition, owner, created_at, updated_at, bucket_id, operation)
VALUES 
  (
    'Allow authenticated updates', 
    'auth.role() = ''authenticated''', 
    auth.uid(), 
    now(), 
    now(), 
    'client-files',
    'UPDATE'
  )
ON CONFLICT (name, bucket_id) DO 
  UPDATE SET definition = 'auth.role() = ''authenticated'''; 