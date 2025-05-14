import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Define a type for the expected request body
interface CreateAlertRequestBody {
  client_id: string;
  alert_type: string;
  due_date: string; // Expected as YYYY-MM-DD string
  client_name: string; 
}

// Minimal structure for alert templates (adjust if you have a more complex structure)
interface AlertTemplate {
  alert_type: string;
  message_template: string;
  default_days_before_due?: number; // Optional: template-specific days_before_due
}

// Fallback default alert message if no template is found
const DEFAULT_ALERT_MESSAGE_TEMPLATE = "Reminder: {{alert_type_friendly_name}} for {{client_name}} is due on {{due_date}}.";
const DEFAULT_DAYS_BEFORE_DUE = 30;
const DEFAULT_NOTIFICATION_PREFERENCE = 'DRAFT_FOR_TEAM';

// Helper to get friendly name from alert_type
const getFriendlyName = (alertType: string): string => {
  return alertType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  let supabaseAdminClient: SupabaseClient | null = null;

  try {
    const { client_id, alert_type, due_date, client_name } = req.body as CreateAlertRequestBody;

    // Basic Validation
    if (!client_id || !alert_type || !due_date || !client_name) {
      return res.status(400).json({ error: 'Missing required fields: client_id, alert_type, due_date, client_name.' });
    }

    try {
      new Date(due_date).toISOString(); // Check if due_date is a valid date string
    } catch {
      return res.status(400).json({ error: 'Invalid due_date format.' });
    }
    
    supabaseAdminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Fetch Alert Templates (Simplified - ideally share this logic or table)
    //    For this example, we'll query them. In a real app, you might have this in a shared lib or context.
    let alertTemplates: AlertTemplate[] = [];
    const { data: templatesData, error: templatesError } = await supabaseAdminClient
        .from('alert_templates') // Assuming you have a table named 'alert_templates'
        .select('alert_type, message_template, default_days_before_due');

    if (templatesError) {
        console.warn("Could not fetch alert templates:", templatesError.message, "Will use default template.");
    } else if (templatesData) {
        alertTemplates = templatesData as AlertTemplate[];
    }
    
    const relevantTemplate = alertTemplates.find(t => t.alert_type === alert_type);
    const messageTemplate = relevantTemplate?.message_template || DEFAULT_ALERT_MESSAGE_TEMPLATE;
    const daysBeforeDue = relevantTemplate?.default_days_before_due || DEFAULT_DAYS_BEFORE_DUE;

    // 2. Construct Alert Message
    const formattedDueDate = new Date(due_date).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
    const alertMessage = messageTemplate
      .replace(/{{client_name}}/g, client_name)
      .replace(/{{due_date}}/g, formattedDueDate)
      .replace(/{{alert_type_friendly_name}}/g, getFriendlyName(alert_type))
      // Add any other placeholders your templates might use
      .replace(/{{company_name}}/g, client_name); // Assuming client_name can double as company_name if not separately available

    // 3. Insert into client_alerts
    const { data: newAlert, error: insertError } = await supabaseAdminClient
      .from('client_alerts')
      .insert({
        client_id: client_id,
        alert_type: alert_type,
        alert_message: alertMessage,
        days_before_due: daysBeforeDue,
        notification_preference: DEFAULT_NOTIFICATION_PREFERENCE,
        is_active: true, // Default to active
        // source_task_id could be added if you pass the task ID to this API
        // created_by could be set if you have the user ID making this request
      })
      .select()
      .single();

    if (insertError) {
      console.error('Supabase error creating client alert:', insertError);
      // Check for unique constraint violation if an alert of this type already exists (if applicable)
      if (insertError.code === '23505') { // Postgres unique violation
          return res.status(409).json({ error: `An alert of type '${getFriendlyName(alert_type)}' already exists for this client.` });
      }
      return res.status(500).json({ error: 'Failed to create client alert: ' + insertError.message });
    }

    return res.status(201).json({ message: `Alert '${getFriendlyName(alert_type)}' created successfully for ${client_name}.`, alert: newAlert });

  } catch (e: unknown) {
    console.error('Error in /api/create-alert-from-task:', e);
    let errorMessage = 'An unexpected error occurred.';
    if (e instanceof Error) {
      errorMessage = e.message;
    } else if (typeof e === 'string') {
      errorMessage = e;
    } else if (typeof e === 'object' && e !== null && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
        errorMessage = (e as { message: string }).message;
    } else {
        errorMessage = 'Unknown error';
    }
    return res.status(500).json({ error: 'An unexpected error occurred: ' + errorMessage });
  }
} 