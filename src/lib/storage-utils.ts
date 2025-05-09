import { supabase } from './supabase';

/**
 * Checks if a storage bucket exists
 * @param bucketName The name of the bucket to check
 * @returns Promise<boolean> True if the bucket exists
 */
export async function ensureBucketExists(bucketName: string): Promise<boolean> {
  try {
    // Check if the bucket already exists
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.error('Error listing buckets:', listError);
      return false;
    }
    
    // Return true if the bucket exists
    const exists = buckets?.some(bucket => bucket.name === bucketName) || false;
    
    if (exists) {
      console.log(`Bucket '${bucketName}' exists`);
    } else {
      console.log(`Bucket '${bucketName}' does not exist - please create it in the Supabase dashboard`);
    }
    
    return exists;
  } catch (error) {
    console.error('Error checking if bucket exists:', error);
    return false;
  }
} 