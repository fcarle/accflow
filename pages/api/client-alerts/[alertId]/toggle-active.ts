import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', ['PATCH']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const { alertId } = req.query;
  const { is_active } = req.body;

  if (typeof alertId !== 'string') {
    return res.status(400).json({ error: 'alertId must be a string.' });
  }

  if (typeof is_active !== 'boolean') {
    return res.status(400).json({ error: 'is_active must be a boolean.' });
  }

  let supabaseAdminClient: SupabaseClient | null = null;

  try {
    supabaseAdminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await supabaseAdminClient
      .from('client_alerts')
      .update({ 
        is_active: is_active
      })
      .eq('id', alertId)
      .select()
      .single(); // Use single to ensure it affects one row and returns it

    if (error) {
      if (error.code === 'PGRST116') { // PostgREST error code for "No rows found"
        return res.status(404).json({ error: `Alert with ID ${alertId} not found.` });
      }
      console.error('Supabase error updating alert status:', error);
      return res.status(500).json({ error: 'Failed to update alert status.', details: error.message });
    }

    if (!data) {
        // This case should ideally be caught by PGRST116, but as a fallback:
        return res.status(404).json({ error: `Alert with ID ${alertId} not found or no change made.` });
    }

    return res.status(200).json({ message: 'Alert status updated successfully.', alert: data });

  } catch (error: unknown) {
    console.error('Error updating alert status:', error);
    let errorMessage = 'Internal server error.';
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }
    return res.status(500).json({ error: 'Internal server error.', details: errorMessage });
  }
} 