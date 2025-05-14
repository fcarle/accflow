'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Bucket {
  id: string;
  name: string;
  owner: string | null;
  public: boolean;
  created_at?: string;
  updated_at?: string;
  file_size_limit?: number | null;
  allowed_mime_types?: string[] | null;
}

export function StorageDebugger() {
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [authStatus, setAuthStatus] = useState<string>('Checking...');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('');

  useEffect(() => {
    async function checkStorageConfig() {
      setLoading(true);
      setError(null);
      
      try {
        // Check auth status
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setAuthStatus(`Authenticated as ${session.user.email}`);
        } else {
          setAuthStatus('Not authenticated');
        }
        
        // List buckets
        const { data: bucketsData, error: bucketsError } = await supabase.storage.listBuckets();
        
        if (bucketsError) {
          setError(`Error listing buckets: ${bucketsError.message}`);
        } else {
          setBuckets(bucketsData || []);
        }
        
        // We can't directly get policies through the JS client so we'll use a debug message
        let info = '';
        info += `Session exists: ${session ? 'Yes' : 'No'}\n`;
        info += `User ID: ${session?.user?.id || 'None'}\n`;
        info += `Buckets found: ${bucketsData?.length || 0}\n`;
        if (bucketsData?.length) {
          info += `Bucket names: ${bucketsData.map(b => b.name).join(', ')}\n`;
          
          // For each bucket, try to list files to check access
          for (const bucket of bucketsData) {
            const { data: files, error: filesError } = await supabase.storage
              .from(bucket.name)
              .list();
              
            info += `\nBucket "${bucket.name}":\n`;
            info += `- Can list files: ${filesError ? 'No' : 'Yes'}\n`;
            info += filesError 
              ? `- Error: ${filesError.message}\n` 
              : `- Files found: ${files?.length || 0}\n`;
              
            // Try to create a test directory
            const testDirPath = `test-${Date.now()}`;
            const { error: uploadError } = await supabase.storage
              .from(bucket.name)
              .upload(`${testDirPath}/.keep`, new Blob([''], { type: 'text/plain' }));
              
            info += `- Can upload files: ${uploadError ? 'No' : 'Yes'}\n`;
            if (uploadError) {
              info += `- Upload error: ${uploadError.message}\n`;
            } else {
              info += `- Test file created successfully\n`;
              
              // Clean up test file
              await supabase.storage
                .from(bucket.name)
                .remove([`${testDirPath}/.keep`]);
            }
          }
        }
        
        setDebugInfo(info);
      } catch (err) {
        setError(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setLoading(false);
      }
    }
    
    checkStorageConfig();
  }, []);
  
  const handleCreateBucket = async () => {
    try {
      const { error } = await supabase.storage.createBucket('client-files', {
        public: false,
      });
      
      if (error) {
        setError(`Error creating bucket: ${error.message}`);
      } else {
        // Refresh the data
        window.location.reload();
      }
    } catch (err) {
      setError(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Storage Configuration Debugger</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-4">Loading storage configuration...</div>
        ) : error ? (
          <div className="text-red-500 p-4 border border-red-200 rounded bg-red-50">
            {error}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold">Authentication Status</h3>
              <p className={authStatus.includes('Not') ? 'text-red-500' : 'text-green-600'}>
                {authStatus}
              </p>
            </div>
            
            <div>
              <h3 className="font-semibold">Storage Buckets</h3>
              {buckets.length === 0 ? (
                <div className="flex items-center space-x-2">
                  <p className="text-amber-600">No buckets found.</p>
                  <Button onClick={handleCreateBucket} size="sm">
                    Create client-files bucket
                  </Button>
                </div>
              ) : (
                <ul className="list-disc pl-5">
                  {buckets.map((bucket) => (
                    <li key={bucket.id}>
                      {bucket.name} {bucket.public ? '(public)' : '(private)'}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            
            <div>
              <h3 className="font-semibold">Storage Debug Info</h3>
              <pre className="whitespace-pre-wrap bg-gray-100 p-4 rounded text-sm overflow-auto max-h-[300px]">
                {debugInfo}
              </pre>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
} 