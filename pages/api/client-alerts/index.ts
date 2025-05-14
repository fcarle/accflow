import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Define a type for reminder schedule
interface ReminderSchedule {
  days_before_due: number;
  alert_message?: string; // Optional, will use parent alert message if not provided
  is_active?: boolean; // Optional, will default to true
}

// Define a type for the expected request body for creating an alert
interface CreateClientAlertRequestBody {
  client_id: string; // uuid
  alert_type: string;
  alert_message: string;
  days_before_due: number; // Primary reminder days
  is_active?: boolean; // Optional, will default to true
  notification_preference: 'DRAFT_FOR_TEAM' | 'SEND_DIRECT_TO_CLIENT';
  source_task_id?: string | null; // uuid, optional
  use_multi_schedule?: boolean; // Whether to use multiple reminders
  reminder_schedules?: ReminderSchedule[]; // Additional reminder schedules
}

// Define a type for the alert data returned (matches table structure)
interface ClientAlert {
  id: string; // uuid, auto-generated
  created_at: string; // timestamptz, auto-generated
  client_id: string;
  alert_type: string;
  alert_message: string;
  days_before_due: number;
  is_active: boolean;
  notification_preference: 'DRAFT_FOR_TEAM' | 'SEND_DIRECT_TO_CLIENT';
  source_task_id?: string | null;
  last_triggered_at?: string | null;
  created_by?: string | null; // uuid
  use_multi_schedule: boolean;
  clients?: { client_name: string }; // For GET requests to include client name
  reminder_schedules?: ReminderSchedule[]; // For GET requests to include schedules
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabaseAdminClient: SupabaseClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  if (req.method === 'POST') {
    // --- Create a new client alert ---
    try {
      const { 
        client_id,
        alert_type,
        alert_message,
        days_before_due,
        is_active = true, // Default to true if not provided
        notification_preference,
        source_task_id = null,
        use_multi_schedule = false,
        reminder_schedules = []
      } = req.body as CreateClientAlertRequestBody;

      // Basic Validation
      if (!client_id || !alert_type || !alert_message || days_before_due === undefined || !notification_preference) {
        return res.status(400).json({ error: 'Missing required fields.' });
      }
      if (typeof days_before_due !== 'number' || days_before_due < 0) {
        return res.status(400).json({ error: 'days_before_due must be a non-negative number.' });
      }
      if (!['DRAFT_FOR_TEAM', 'SEND_DIRECT_TO_CLIENT'].includes(notification_preference)) {
        return res.status(400).json({ error: 'Invalid notification_preference value.' });
      }
      
      // Validate reminder schedules if using multi-schedule
      if (use_multi_schedule && reminder_schedules.length > 0) {
        for (const schedule of reminder_schedules) {
          if (typeof schedule.days_before_due !== 'number' || schedule.days_before_due < 0) {
            return res.status(400).json({ error: 'Each reminder schedule must have a valid days_before_due value.' });
          }
          
          // Make sure we don't have duplicate days
          const scheduleDays = [days_before_due, ...reminder_schedules.map(s => s.days_before_due)];
          const uniqueDays = [...new Set(scheduleDays)];
          if (scheduleDays.length !== uniqueDays.length) {
            return res.status(400).json({ error: 'Duplicate days_before_due values are not allowed.' });
          }
        }
      }

      const newAlertData = {
        client_id,
        alert_type,
        alert_message,
        days_before_due,
        is_active,
        notification_preference,
        source_task_id: source_task_id === '' ? null : source_task_id, // Ensure empty string becomes null
        use_multi_schedule,
        // last_triggered_at will be null by default
      };

      // Start a transaction to create the alert and its schedules
      const { data: alert, error: alertError } = await supabaseAdminClient
        .from('client_alerts')
        .insert(newAlertData)
        .select()
        .single();

      if (alertError) {
        console.error('Supabase error creating client alert:', alertError);
        return res.status(500).json({ error: 'Failed to create client alert: ' + alertError.message });
      }

      // Create the primary schedule
      const primarySchedule = {
        client_alert_id: alert.id,
        days_before_due: days_before_due,
        is_active: is_active,
        alert_message: null, // Use parent alert message
      };

      const { error: primaryScheduleError } = await supabaseAdminClient
        .from('client_alert_schedules')
        .insert(primarySchedule);

      if (primaryScheduleError) {
        console.error('Supabase error creating primary schedule:', primaryScheduleError);
        return res.status(500).json({ error: 'Failed to create primary schedule: ' + primaryScheduleError.message });
      }

      // Create additional schedules if using multi-schedule
      if (use_multi_schedule && reminder_schedules.length > 0) {
        const additionalSchedules = reminder_schedules.map(schedule => ({
          client_alert_id: alert.id,
          days_before_due: schedule.days_before_due,
          is_active: schedule.is_active !== undefined ? schedule.is_active : true,
          alert_message: schedule.alert_message || null,
        }));

        const { error: schedulesError } = await supabaseAdminClient
          .from('client_alert_schedules')
          .insert(additionalSchedules);

        if (schedulesError) {
          console.error('Supabase error creating additional schedules:', schedulesError);
          return res.status(500).json({ error: 'Failed to create additional schedules: ' + schedulesError.message });
        }
      }

      // Get all schedules for the response
      const { data: schedules, error: fetchSchedulesError } = await supabaseAdminClient
        .from('client_alert_schedules')
        .select('*')
        .eq('client_alert_id', alert.id);

      if (fetchSchedulesError) {
        console.error('Supabase error fetching schedules:', fetchSchedulesError);
      }

      return res.status(201).json({ 
        ...alert, 
        reminder_schedules: schedules || []
      } as ClientAlert);

    } catch (e: unknown) {
      console.error('Error creating client alert:', e);
      let errorMessage = 'An unexpected error occurred.';
      if (e instanceof Error) {
        errorMessage = e.message;
      } else if (typeof e === 'string') {
        errorMessage = e;
      }
      return res.status(500).json({ error: 'An unexpected error occurred: ' + errorMessage });
    }
  } else if (req.method === 'GET') {
    // --- Get client alerts ---
    try {
      const { client_id } = req.query; // Optional query parameter

      let query = supabaseAdminClient
        .from('client_alerts')
        .select(`
          *,
          clients (client_name)
        `)
        .order('created_at', { ascending: false });

      if (client_id && typeof client_id === 'string') {
        query = query.eq('client_id', client_id);
      }

      const { data: alerts, error } = await query;

      if (error) {
        console.error('Supabase error fetching client alerts:', error);
        return res.status(500).json({ error: 'Failed to fetch client alerts: ' + error.message });
      }

      // Fetch schedules for each alert
      const alertsWithSchedules = await Promise.all(alerts.map(async (alert) => {
        const { data: schedules, error: schedulesError } = await supabaseAdminClient
          .from('client_alert_schedules')
          .select('*')
          .eq('client_alert_id', alert.id)
          .order('days_before_due', { ascending: false });

        if (schedulesError) {
          console.error(`Error fetching schedules for alert ${alert.id}:`, schedulesError);
          return {
            ...alert,
            reminder_schedules: []
          };
        }

        return {
          ...alert,
          reminder_schedules: schedules
        };
      }));

      return res.status(200).json(alertsWithSchedules as ClientAlert[]);

    } catch (e: unknown) {
      console.error('Error fetching client alerts:', e);
      let errorMessage = 'An unexpected error occurred.';
      if (e instanceof Error) {
        errorMessage = e.message;
      } else if (typeof e === 'string') {
        errorMessage = e;
      }
      return res.status(500).json({ error: 'An unexpected error occurred: ' + errorMessage });
    }
  } else {
    res.setHeader('Allow', ['POST', 'GET']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }
} 