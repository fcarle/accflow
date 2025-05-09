'use client';

import { useState } from 'react';
import { Upload, X, File } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';

interface FileUploaderProps {
  clientId: string;
  onUploadComplete: (fileUrl: string, fileName: string) => void;
}

export function FileUploader({ clientId, onUploadComplete }: FileUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleFileReset = () => {
    setFile(null);
    setError(null);
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file to upload');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      console.log("Starting upload process...");
      console.log("Client ID:", clientId);

      // First verify the storage bucket exists
      const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
      
      if (bucketError) {
        console.error("Error listing buckets:", bucketError);
        throw new Error(`Bucket list error: ${bucketError.message}`);
      }
      
      console.log("Available buckets:", buckets?.map(b => b.name));
      
      // Check if our bucket exists
      const bucketExists = buckets?.some(b => b.name === 'client-files');
      
      if (!bucketExists) {
        console.error("The 'client-files' bucket does not exist");
        throw new Error("Storage bucket 'client-files' does not exist");
      }

      // Create a unique file name to avoid collisions
      const fileExt = file.name.split('.').pop();
      const fileName = `${uuidv4()}.${fileExt}`;
      const filePath = `clients/${clientId}/${fileName}`;
      
      console.log("Uploading file to path:", filePath);

      // Upload file to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('client-files')
        .upload(filePath, file);

      if (uploadError) {
        console.error("Upload error details:", uploadError);
        throw new Error(uploadError.message);
      }

      console.log("Upload successful, data:", uploadData);

      // Get the public URL for the file
      const { data } = supabase.storage
        .from('client-files')
        .getPublicUrl(filePath);

      console.log("Public URL:", data.publicUrl);

      // Save file metadata to client's record
      const originalName = file.name;
      onUploadComplete(data.publicUrl, originalName);
      
      // Reset the file input
      setFile(null);
    } catch (error) {
      console.error('Error uploading file:', error);
      setError(error instanceof Error ? error.message : 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Input
          type="file"
          onChange={handleFileChange}
          className="flex-1"
          id="file-upload"
        />
        {file && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleFileReset}
            aria-label="Clear file selection"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {file && (
        <div className="flex items-center gap-2 text-sm">
          <File className="h-4 w-4" />
          <span className="truncate">{file.name}</span>
          <span className="text-gray-500">({(file.size / 1024).toFixed(1)} KB)</span>
        </div>
      )}

      {error && (
        <div className="text-red-500 text-sm p-2 border border-red-200 rounded bg-red-50">
          Error: {error}
        </div>
      )}

      <Button 
        onClick={handleUpload} 
        disabled={!file || uploading}
        className="w-full"
      >
        {uploading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
              <circle 
                className="opacity-25" 
                cx="12" 
                cy="12" 
                r="10" 
                stroke="currentColor" 
                strokeWidth="4"
                fill="none"
              />
              <path 
                className="opacity-75" 
                fill="currentColor" 
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Uploading...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Upload
          </span>
        )}
      </Button>
    </div>
  );
} 