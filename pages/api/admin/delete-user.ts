import { createClient } from '@supabase/supabase-js';
import type { NextApiRequest, NextApiResponse } from 'next';

// Initialize Supabase Admin Client
// Ensure your environment variables are set for these
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    const { data, error } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (error) {
      console.error('Supabase admin delete user error:', error);
      // Check for specific Supabase errors if needed, e.g., user not found
      if (error.message.toLowerCase().includes('user not found')) {
        return res.status(404).json({ error: 'User not found in authentication' });
      }
      return res.status(500).json({ error: 'Failed to delete user from authentication', details: error.message });
    }

    // Successfully deleted the user from auth.users
    // The user's profile in the 'profiles' table and other related data
    // are expected to be handled by the calling client (e.g., settings page)
    // or via database triggers (e.g., ON DELETE CASCADE for profiles.user_id).
    // For this API route, we focus only on deleting the auth.users record.
    
    // It's important to ensure that RLS policies on the 'profiles' table
    // (and other user-related tables) correctly use ON DELETE CASCADE
    // for the user_id foreign key referencing auth.users(id),
    // or that the client-side code explicitly deletes these records
    // *before* calling this auth deletion endpoint if cascade is not set up.
    // The provided settings page code seems to delete from 'profiles' before calling this.

    return res.status(200).json({ message: 'User deleted successfully from authentication', data });

  } catch (e: unknown) {
    console.error('Error in delete-user API route:', e);
    const errorMessage = e instanceof Error ? e.message : 'An unexpected error occurred.';
    return res.status(500).json({ error: 'Internal server error', details: errorMessage });
  }
} 