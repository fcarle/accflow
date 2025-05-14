import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Define a type for reminder schedule
interface ReminderSchedule {
  id?: string; // For existing schedules
  days_before_due: number;
  alert_message?: string | null; // Optional, will use parent alert message if not provided
  is_active?: boolean; // Optional, will default to true
  last_triggered_at?: string | null;
  client_alert_id?: string; // For database insertion
}

// Define a type for the alert data (can be shared/imported)
// Includes optional client_name for GET single alert
interface ClientAlert {
  id: string;
  created_at: string;
  client_id: string;
  alert_type: string;
  alert_message: string;
  days_before_due: number;
  is_active: boolean;
  notification_preference: 'DRAFT_FOR_TEAM' | 'SEND_DIRECT_TO_CLIENT';
  source_task_id?: string | null;
  last_triggered_at?: string | null;
  created_by?: string | null;
  use_multi_schedule: boolean;
  clients?: { client_name?: string }; // For GET response
  reminder_schedules?: ReminderSchedule[]; // For GET response
}

// Define a type for the expected request body for updating an alert (all fields optional)
interface UpdateClientAlertRequestBody {
  client_id?: string;
  alert_type?: string;
  alert_message?: string;
  days_before_due?: number;
  is_active?: boolean;
  notification_preference?: 'DRAFT_FOR_TEAM' | 'SEND_DIRECT_TO_CLIENT';
  source_task_id?: string | null;
  use_multi_schedule?: boolean;
  reminder_schedules?: ReminderSchedule[];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { alertId } = req.query;

  if (!alertId || typeof alertId !== 'string') {
    return res.status(400).json({ error: 'Alert ID is missing or invalid.' });
  }

  const supabaseAdminClient: SupabaseClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  if (req.method === 'GET') {
    // --- Get a single client alert by ID ---
    try {
      const { data: alert, error } = await supabaseAdminClient
        .from('client_alerts')
        .select(`
          *,
          clients (client_name)
        `)
        .eq('id', alertId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') { // PostgREST error code for "Fetched zero rows"
          return res.status(404).json({ error: 'Client alert not found.' });
        }
        console.error('Supabase error fetching client alert:', error);
        return res.status(500).json({ error: 'Failed to fetch client alert: ' + error.message });
      }

      // Fetch schedules for this alert
      const { data: schedules, error: schedulesError } = await supabaseAdminClient
        .from('client_alert_schedules')
        .select('*')
        .eq('client_alert_id', alertId)
        .order('days_before_due', { ascending: false });

      if (schedulesError) {
        console.error(`Error fetching schedules for alert ${alertId}:`, schedulesError);
        return res.status(500).json({ 
          error: 'Failed to fetch reminder schedules: ' + schedulesError.message 
        });
      }

      return res.status(200).json({
        ...alert,
        reminder_schedules: schedules || []
      } as ClientAlert);

    } catch (e: unknown) {
      console.error('Error fetching client alert:', e);
      let errorMessage = 'An unexpected error occurred.';
      if (e instanceof Error) {
        errorMessage = e.message;
      } else if (typeof e === 'string') {
        errorMessage = e;
      }
      return res.status(500).json({ error: 'An unexpected error occurred: ' + errorMessage });
    }
  } else if (req.method === 'PUT') {
    // --- Update an existing client alert ---
    try {
      const updateData = req.body as UpdateClientAlertRequestBody;
      const { reminder_schedules, ...alertUpdateData } = updateData;

      // Basic validation for provided fields
      if (alertUpdateData.days_before_due !== undefined && (typeof alertUpdateData.days_before_due !== 'number' || alertUpdateData.days_before_due < 0)) {
        return res.status(400).json({ error: 'days_before_due must be a non-negative number.' });
      }
      if (alertUpdateData.notification_preference && !['DRAFT_FOR_TEAM', 'SEND_DIRECT_TO_CLIENT'].includes(alertUpdateData.notification_preference)) {
        return res.status(400).json({ error: 'Invalid notification_preference value.' });
      }
      if (alertUpdateData.source_task_id === '') {
        alertUpdateData.source_task_id = null; // Ensure empty string becomes null
      }

      // Validate reminder schedules if provided
      if (reminder_schedules && alertUpdateData.use_multi_schedule) {
        for (const schedule of reminder_schedules) {
          if (typeof schedule.days_before_due !== 'number' || schedule.days_before_due < 0) {
            return res.status(400).json({ error: 'Each reminder schedule must have a valid days_before_due value.' });
          }
        }
        
        // Make sure primary schedule day is not duplicated
        const primaryDay = alertUpdateData.days_before_due !== undefined 
          ? alertUpdateData.days_before_due 
          : (await supabaseAdminClient.from('client_alerts').select('days_before_due').eq('id', alertId).single()).data?.days_before_due;

        if (primaryDay !== undefined) {
          const scheduleDays = [primaryDay, ...reminder_schedules.map(s => s.days_before_due)];
          const uniqueDays = [...new Set(scheduleDays)];
          if (scheduleDays.length !== uniqueDays.length) {
            return res.status(400).json({ error: 'Duplicate days_before_due values are not allowed.' });
          }
        }
      }

      // Prevent updating id or created_at directly
      const allowedUpdateData = { ...alertUpdateData };

      if (Object.keys(allowedUpdateData).length === 0 && !reminder_schedules) {
        return res.status(400).json({ error: 'No update data provided.' });
      }

      // Update the main alert if there are fields to update
      if (Object.keys(allowedUpdateData).length > 0) {
        const { error: updateError } = await supabaseAdminClient
          .from('client_alerts')
          .update(allowedUpdateData)
          .eq('id', alertId)
          .select()
          .single();

        if (updateError) {
          if (updateError.code === 'PGRST116') { // Not found
             return res.status(404).json({ error: 'Client alert not found for update.' });
          }
          console.error('Supabase error updating client alert:', updateError);
          return res.status(500).json({ error: 'Failed to update client alert: ' + updateError.message });
        }
      }

      // Handle reminder schedules updates if multi-schedule is enabled
      if (alertUpdateData.use_multi_schedule !== false && reminder_schedules && reminder_schedules.length > 0) {
        // Get existing schedules to determine what needs to be updated/deleted/created
        const { data: existingSchedules, error: fetchError } = await supabaseAdminClient
          .from('client_alert_schedules')
          .select('*')
          .eq('client_alert_id', alertId);

        if (fetchError) {
          console.error('Error fetching existing schedules:', fetchError);
          return res.status(500).json({ error: 'Failed to fetch existing schedules: ' + fetchError.message });
        }

        // Identify schedules to update, create, or delete
        const incomingScheduleIds = reminder_schedules.filter(s => s.id).map(s => s.id as string);
        
        // Schedules to delete
        const schedulesToDelete = existingSchedules?.filter(s => !incomingScheduleIds.includes(s.id)) || [];
        
        // Schedules to update (have an id)
        const schedulesToUpdate = reminder_schedules.filter(s => s.id);
        
        // Schedules to create (no id)
        const schedulesToCreate = reminder_schedules
          .filter(s => !s.id)
          .map(s => ({ ...s, client_alert_id: alertId }));

        // Delete schedules not in the incoming set
        if (schedulesToDelete.length > 0) {
          const { error: deleteError } = await supabaseAdminClient
            .from('client_alert_schedules')
            .delete()
            .in('id', schedulesToDelete.map(s => s.id));

          if (deleteError) {
            console.error('Error deleting schedules:', deleteError);
            return res.status(500).json({ error: 'Failed to delete schedules: ' + deleteError.message });
          }
        }

        // Update existing schedules
        for (const schedule of schedulesToUpdate) {
          const { id, ...updateFields } = schedule;
          const { error: updateError } = await supabaseAdminClient
            .from('client_alert_schedules')
            .update(updateFields)
            .eq('id', id);

          if (updateError) {
            console.error(`Error updating schedule ${id}:`, updateError);
            return res.status(500).json({ error: `Failed to update schedule ${id}: ` + updateError.message });
          }
        }

        // Create new schedules
        if (schedulesToCreate.length > 0) {
          const { error: createError } = await supabaseAdminClient
            .from('client_alert_schedules')
            .insert(schedulesToCreate);

          if (createError) {
            console.error('Error creating schedules:', createError);
            return res.status(500).json({ error: 'Failed to create schedules: ' + createError.message });
          }
        }
      } else if (alertUpdateData.use_multi_schedule === false) {
        // If multi-schedule is disabled, delete all additional schedules except the primary one
        const { error: deleteError } = await supabaseAdminClient
          .from('client_alert_schedules')
          .delete()
          .eq('client_alert_id', alertId)
          .neq('days_before_due', alertUpdateData.days_before_due || 
            (await supabaseAdminClient.from('client_alerts').select('days_before_due').eq('id', alertId).single()).data?.days_before_due);

        if (deleteError) {
          console.error('Error deleting additional schedules:', deleteError);
          return res.status(500).json({ error: 'Failed to delete additional schedules: ' + deleteError.message });
        }
      }

      // Fetch the updated alert with all its schedules
      const { data: updatedAlert, error: fetchError } = await supabaseAdminClient
        .from('client_alerts')
        .select(`
          *,
          clients (client_name)
        `)
        .eq('id', alertId)
        .single();

      if (fetchError) {
        console.error('Error fetching updated alert:', fetchError);
        return res.status(500).json({ error: 'Failed to fetch updated alert: ' + fetchError.message });
      }

      const { data: updatedSchedules, error: schedulesError } = await supabaseAdminClient
        .from('client_alert_schedules')
        .select('*')
        .eq('client_alert_id', alertId)
        .order('days_before_due', { ascending: false });

      if (schedulesError) {
        console.error('Error fetching updated schedules:', schedulesError);
      }

      return res.status(200).json({
        ...updatedAlert,
        reminder_schedules: updatedSchedules || []
      } as ClientAlert);

    } catch (e: unknown) {
      console.error('Error updating client alert:', e);
      let errorMessage = 'An unexpected error occurred.';
      if (e instanceof Error) {
        errorMessage = e.message;
      } else if (typeof e === 'string') {
        errorMessage = e;
      }
      return res.status(500).json({ error: 'An unexpected error occurred: ' + errorMessage });
    }
  } else if (req.method === 'DELETE') {
    // --- Delete a client alert ---
    try {
      // Since we have CASCADE on the foreign key, deleting the alert will delete all schedules
      const { error } = await supabaseAdminClient
        .from('client_alerts')
        .delete()
        .eq('id', alertId);

      if (error) {
        console.error('Supabase error deleting client alert:', error);
        return res.status(500).json({ error: 'Failed to delete client alert: ' + error.message });
      }
      
      return res.status(200).json({ message: 'Client alert deleted successfully.' });

    } catch (e: unknown) {
      console.error('Error deleting client alert:', e);
      let errorMessage = 'An unexpected error occurred.';
      if (e instanceof Error) {
        errorMessage = e.message;
      } else if (typeof e === 'string') {
        errorMessage = e;
      }
      return res.status(500).json({ error: 'An unexpected error occurred: ' + errorMessage });
    }
  } else {
    res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }
} 