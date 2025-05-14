import { createClient } from '@supabase/supabase-js';
import { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

// Initialize Supabase Admin Client (use environment variables)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { alertType } = req.query; // For PUT requests

  // It's generally better to get the user from the request context for RLS,
  // but Supabase RLS with auth.uid() should work with supabaseAdmin for GETs.
  // For PUT, we rely on RLS to scope the update to the correct user.

  if (req.method === 'GET') {
    // --- Fetch all alert templates for the authenticated user (RLS enforced) ---
    try {
      // Create a Supabase client scoped to the current user to enforce RLS
      const supabaseUserClient = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            get(name: string) {
              return req.cookies[name];
            },
            // For Pages API routes, set/remove are often not directly needed for GET operations
            // if the primary goal is to establish user context for RLS.
            // Supabase's createServerClient for Pages Router handles auth context primarily via `get`.
            set(
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              _name: string, 
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              _value: string, 
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              _options: CookieOptions
            ) {
              // Minimal no-op or more complex header setting if needed,
              // but for getUser and RLS-gated SELECTs, this might not be actively used.
            },
            remove(
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              _name: string, 
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              _options: CookieOptions
            ) {
              // Minimal no-op.
            },
          },
        }
      );

      // Verify user authentication
      const { data: { user }, error: authError } = await supabaseUserClient.auth.getUser();

      if (authError) {
        console.error('Supabase auth error in GET /api/settings/alert-templates:', authError);
        return res.status(401).json({ error: 'Error fetching user authentication status.', details: authError.message });
      }
      if (!user) {
        console.error('No authenticated user found in GET /api/settings/alert-templates.');
        return res.status(401).json({ error: 'User not authenticated. Please log in again.' });
      }

      // Now fetch templates using the user-scoped client. RLS will be applied.
      const { data, error } = await supabaseUserClient
        .from('alert_templates')
        .select('id, user_id, alert_type, subject, body, created_at, updated_at')
        .order('alert_type');

      if (error) {
        // Log the specific error from Supabase if it occurs
        console.error('Supabase error fetching user-specific alert templates:', error);
        throw error; // Rethrow to be caught by the generic catch block
      }

      res.status(200).json(data || []);
    } catch (error: unknown) {
      console.error('Error fetching alert templates:', error instanceof Error ? error.message : String(error));
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      res.status(500).json({ error: 'Failed to fetch alert templates', details: errorMessage });
    }
  } else if (req.method === 'PUT') {
    // --- Update a specific alert template for the authenticated user ---
    
    // Extract alertType from query. It might be an array if not a dynamic route.
    const targetAlertType = Array.isArray(alertType) ? alertType[0] : alertType;

    if (!targetAlertType || typeof targetAlertType !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid alertType parameter in URL.' });
    }

    const { subject, body } = req.body;

    // Validate subject and body
    if (typeof subject !== 'string' || typeof body !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid subject or body in request body.' });
    }

    let userId;
    try {
        // Get the authenticated user
        const supabaseAuthClient = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    get(name: string) {
                        return req.cookies[name];
                    },
                    set(
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      _name: string, 
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      _value: string, 
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      _options: CookieOptions
                    ) {
                        // For Pages API routes, res.setHeader is used.
                        // Note: This might need adjustment if cookies are complex (e.g. objects)
                        // but Supabase typically sets simple string cookies.
                        // We'll stringify options, but be mindful of the actual format.
                        // A more robust way for Pages Router involves `res.cookie` if available via a helper,
                        // or carefully formatting the Set-Cookie header.
                        // For now, let's assume Supabase helpers manage this internally when it calls this.
                        // This part is tricky with Pages Router as `res.cookies.set` isn't standard like in App Router middleware.
                        // However, `createPagesServerClient` abstracted this.
                        // For `createServerClient` in Pages Router, the `set` and `remove` might not be directly called
                        // if the client is only used for `getUser`. If it *does* try to set/remove, this will need care.
                        // Given we primarily need `getUser`, this part might be less critical for this specific read operation.
                        // Let's ensure it doesn't break. `res.setHeader('Set-Cookie', ...)` is the manual way.
                        // For now, we'll provide a no-op for set/remove as getUser shouldn't need them for Pages router usually.
                        // A proper implementation would use a library that adapts res.cookie or header setting.
                    },
                    remove(
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      _name: string, 
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      _options: CookieOptions
                    ) {
                        // Similar to set, this is tricky. No-op for now.
                    },
                },
            }
        );

        const { data: { user }, error: authError } = await supabaseAuthClient.auth.getUser();

        if (authError) {
            console.error('Supabase auth error in PUT /api/settings/alert-templates:', authError);
            return res.status(401).json({ error: 'Error fetching user authentication status.', details: authError.message });
        }
        if (!user) {
            console.error('No authenticated user found in PUT /api/settings/alert-templates.');
            return res.status(401).json({ error: 'User not authenticated. Please log in again.' });
        }
        userId = user.id;
    } catch (e: unknown) {
        console.error("Error initializing Supabase client or getting user:", e);
        const errorMessage = e instanceof Error ? e.message : 'An unknown auth error occurred';
        return res.status(500).json({ error: 'Authentication failed due to server error.', details: errorMessage });
    }

    try {
      // RLS policy "Users can update their own templates" would apply if not using admin client.
      // With admin client, we explicitly filter by user_id.
      const { data, error } = await supabaseAdmin
        .from('alert_templates')
        .update({ 
            subject: subject,
            body: body,
            // updated_at is handled by the database trigger
        })
        .eq('alert_type', targetAlertType)
        .eq('user_id', userId) // Explicitly scope the update to the authenticated user
        .select('id, user_id, alert_type, subject, body, created_at, updated_at') // Select all fields after update
        .single();

      if (error) {
        if (error.code === 'PGRST204') { // PostgREST code for no rows found
            return res.status(404).json({ error: `Template with alert_type '${targetAlertType}' not found for your account, or no changes were made.` });
        }
        throw error;
      }

      res.status(200).json({ message: 'Template updated successfully', template: data });
    } catch (error: unknown) {
      console.error(`Error updating alert template ${targetAlertType}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during update';
      res.status(500).json({ error: `Failed to update template ${targetAlertType}`, details: errorMessage });
    }
  } else {
    res.setHeader('Allow', ['GET', 'PUT']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
} 