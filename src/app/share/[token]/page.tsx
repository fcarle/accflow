'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase'; // Assuming supabase is configured
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input'; // For file input, or use a dedicated uploader
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface ClientData {
  id: string;
  clientName: string;
}

type UploadCategory = 'bankStatements' | 'receipts' | 'payrollSummaries' | 'other';

interface FileToUpload {
  file: File;
  category: UploadCategory;
}

export default function SharePage() {
  const params = useParams();
  const token = params?.token as string | undefined;

  const [client, setClient] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Record<UploadCategory, File[]>>({
    bankStatements: [],
    receipts: [],
    payrollSummaries: [],
    other: [],
  });
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  useEffect(() => {
    if (token) {
      const fetchClientByToken = async () => {
        setLoading(true);
        setError(null);
        const { data, error: dbError } = await supabase
          .from('clients')
          .select('id, client_name') // Only fetch necessary fields
          .eq('shareable_link_token', token)
          .single();

        if (dbError || !data) {
          setError('Invalid or expired link. Please request a new link from your accountant.');
          console.error('Error fetching client by token:', dbError);
          setClient(null);
        } else {
          setClient({ id: data.id, clientName: data.client_name });
        }
        setLoading(false);
      };
      fetchClientByToken();
    } else {
      setError('No token provided. This link is invalid.');
      setLoading(false);
    }
  }, [token]);

  const handleFileChange = (category: UploadCategory, event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setSelectedFiles(prev => ({
        ...prev,
        [category]: Array.from(event.target.files!),
      }));
      setUploadSuccess(false); // Reset success message on new file selection
    }
  };

  const handleSubmitUpload = async () => {
    if (!client) {
      setError('Client not identified. Cannot upload files.');
      return;
    }

    const filesToUploadList: FileToUpload[] = [];
    (Object.keys(selectedFiles) as UploadCategory[]).forEach(category => {
      selectedFiles[category].forEach(file => {
        filesToUploadList.push({ file, category });
      });
    });

    if (filesToUploadList.length === 0) {
      toast.error('Please select at least one file to upload.');
      return;
    }

    setIsUploading(true);
    setError(null);
    setUploadSuccess(false);

    let allUploadsSuccessful = true;
    const uploadedFilePaths: string[] = []; // To store paths of successfully uploaded files

    for (const { file, category } of filesToUploadList) {
      const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`.toLowerCase();
      const filePath = `clients/${client.id}/${category}/${fileName}`;

      // Enhanced Logging
      console.log('Attempting to upload file:', {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        generatedFilePath: filePath,
        category,
      });

      try {
        const { error: uploadError } = await supabase.storage
          .from('client-files') // Use the correct bucket name
          .upload(filePath, file);

        if (uploadError) {
          // Log the raw error object from Supabase, especially if it's empty or unusual
          console.error(`Supabase upload error for ${file.name} to ${category}:`, JSON.stringify(uploadError, null, 2));

          if (uploadError.message) {
            setError(`Failed to upload ${file.name}. Please try again. Error: ${uploadError.message}`);
          } else {
            setError(`Failed to upload ${file.name}. An unexpected error occurred with Supabase. Please try again.`);
          }
          allUploadsSuccessful = false;
          break;
        } else {
          console.log(`Successfully uploaded ${file.name} to ${filePath}`);
          uploadedFilePaths.push(filePath); // Add successful path
        }
      } catch (e: unknown) {
        console.error(`Critical error during upload attempt for ${file.name}:`, e);
        const errorMessage = e instanceof Error ? e.message : String(e);
        setError(`Failed to upload ${file.name}. A critical error occurred: ${errorMessage || 'Unknown critical error'}. Please try again.`);
        allUploadsSuccessful = false;
        break;
      }
    }

    setIsUploading(false);
    if (allUploadsSuccessful && filesToUploadList.length > 0 && !error) { // Ensure there were files to upload
      setUploadSuccess(true);
      setSelectedFiles({ bankStatements: [], receipts: [], payrollSummaries: [], other: [] }); 
      toast.success('All selected files uploaded successfully!');
      
    } else if (!allUploadsSuccessful && !error) {
      setError('Some files failed to upload. Please check and try again.');
    }
  };

  const renderFileUploadSection = (category: UploadCategory, title: string) => (
    <div className="mb-6 p-4 border rounded-lg shadow-sm bg-white">
      <Label htmlFor={category} className="text-lg font-semibold text-gray-700 block mb-2">{title}</Label>
      <Input 
        id={category} 
        type="file" 
        multiple 
        onChange={(e) => handleFileChange(category, e)}
        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
      />
      {selectedFiles[category].length > 0 && (
        <div className="mt-2 text-sm text-gray-600">
          Selected: {selectedFiles[category].map(f => f.name).join(', ')}
        </div>
      )}
    </div>
  );

  const filesToUploadCount = (Object.values(selectedFiles) as File[][]).flat().length;

  if (loading) {
    return <div className="flex justify-center items-center min-h-screen bg-gray-100"><p className="text-lg text-gray-700">Loading client portal...</p></div>;
  }

  if (error && !client) { // Show critical error if client couldn't be loaded
    return (
      <div className="flex flex-col justify-center items-center min-h-screen bg-red-50 p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="bg-red-600 text-white">
            <CardTitle className="text-2xl text-center">Access Denied</CardTitle>
          </CardHeader>
          <CardContent className="py-8 text-center">
            <p className="text-red-700 text-lg">{error}</p>
            <p className="text-gray-600 mt-4">Please ensure you have the correct link or contact your accountant for assistance.</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (!client && !loading) { // Fallback if client is null after loading and no specific error was set before for this case
    return (
      <div className="flex flex-col justify-center items-center min-h-screen bg-red-50 p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="bg-red-600 text-white">
            <CardTitle className="text-2xl text-center">Error</CardTitle>
          </CardHeader>
          <CardContent className="py-8 text-center">
            <p className="text-red-700 text-lg">Could not load client information. The link may be invalid.</p>
            <p className="text-gray-600 mt-4">Please contact your accountant for assistance.</p>
          </CardContent>
        </Card>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-700 p-4 md:p-8 flex flex-col items-center">
      {client && (
        <header className="w-full max-w-3xl mb-8 text-center">
          <h1 className="text-4xl font-bold text-white mb-2">Document Upload Portal</h1>
          <p className="text-2xl text-sky-300">For: {client.clientName}</p>
        </header>
      )}

      <main className="w-full max-w-3xl bg-slate-800 p-6 md:p-8 rounded-xl shadow-2xl">
        {uploadSuccess && (
          <div className="mb-6 p-4 text-center bg-green-600 text-white rounded-lg shadow">
            Files uploaded successfully!
          </div>
        )}
        {error && !isUploading && ( 
          <div className="mb-6 p-4 text-center bg-red-600 text-white rounded-lg shadow">
             Error: {error}
          </div>
        )}

        {client && (
          <form onSubmit={(e) => { e.preventDefault(); handleSubmitUpload(); }} className="space-y-6">
            {renderFileUploadSection('bankStatements', 'Bank Statements')}
            {renderFileUploadSection('receipts', 'Receipts')}
            {renderFileUploadSection('payrollSummaries', 'Payroll Summaries')}
            {renderFileUploadSection('other', 'Other Required Documents')}

            <Button 
              type="submit" 
              disabled={isUploading || filesToUploadCount === 0}
              className="w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 px-6 rounded-lg text-lg transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? 'Uploading...' : 'Upload Selected Files'}
            </Button>
          </form>
        )}
         <p className="mt-8 text-xs text-center text-slate-400">
            Upload your documents securely. If you have any questions, please contact your accountant directly.
        </p>
      </main>
       <footer className="mt-12 text-center text-slate-500 text-sm">
        Powered by AccFlow
      </footer>
    </div>
  );
} 