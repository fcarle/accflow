import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Define types for clarity (reuse or define as needed)
interface Client {
  id: string;
  client_name: string;
  client_email: string;
  automatedEmails: boolean;
  company_name?: string; // Add if you have it and want to use in templates
  next_accounts_due?: string;
  next_confirmation_statement_due?: string;
  next_vat_due?: string;
  corporation_tax_deadline?: string;
  // Add other relevant date fields from your clients table
}

interface ClientTask {
  id: string;
  task_title: string;
  task_description: string;
  due_date: string;
}

interface ClientAlert {
  id: string;
  client_id: string;
  alert_type: string;
  alert_message: string;
  days_before_due: number;
  notification_preference: 'DRAFT_FOR_TEAM' | 'SEND_DIRECT_TO_CLIENT';
  last_triggered_at?: string;
  source_task_id?: string;
  clients: Client; // Expecting client data to be joined
  client_tasks?: ClientTask; // Expecting task data to be joined (if applicable)
}

async function sendEmailWithSendGrid(to: string, subject: string, htmlBody: string) {
  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
  const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL;
  const YOUR_COMPANY_NAME = process.env.YOUR_COMPANY_NAME || 'Your Accounting Firm';

  if (!SENDGRID_API_KEY || !SENDGRID_FROM_EMAIL) {
    console.error("SendGrid API Key or From Email not configured.");
    throw new Error("SendGrid configuration missing.");
  }

  const emailData = {
    personalizations: [{ to: [{ email: to }] }],
    from: { email: SENDGRID_FROM_EMAIL, name: YOUR_COMPANY_NAME },
    subject: subject,
    content: [{ type: "text/html", value: htmlBody }],
  };

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': \`Bearer ${SENDGRID_API_KEY}\`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emailData),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(\`SendGrid API Error (${response.status}): ${errorBody}\`);
    throw new Error(\`SendGrid API Error: ${response.status} - ${errorBody}\`);
  }
  console.log(\`Email successfully sent to ${to} via SendGrid. Status: ${response.status}\`);
  return response;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const CRON_SECRET = process.env.CRON_SECRET_KEY;
  const authorizationHeader = req.headers.authorization;

  if (req.method !== 'POST') { // Vercel Cron Jobs use POST by default if there's a body, or GET
    return res.status(405).json({ error: 'Method Not Allowed. Please use POST.' });
  }

  // Security Check: Ensure the cron job is the one calling this
  if (!CRON_SECRET || !authorizationHeader || authorizationHeader !== \`Bearer ${CRON_SECRET}\`) {
    console.warn("Unauthorized attempt to run alert analyzer. Check CRON_SECRET_KEY and Authorization header.");
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let supabaseAdminClient: SupabaseClient | null = null;

  try {
    supabaseAdminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    console.log("Starting daily alert analysis via API route...");

    const { data: activeAlerts, error: alertsError } = await supabaseAdminClient
      .from('client_alerts')
      .select(\`
        id,
        client_id,
        alert_type,
        alert_message,
        days_before_due,
        notification_preference,
        last_triggered_at,
        source_task_id,
        clients (
          id,
          client_name,
          client_email,
          automatedEmails,
          company_name,
          next_accounts_due,
          next_confirmation_statement_due,
          next_vat_due,
          corporation_tax_deadline
        ),
        client_tasks (
          id,
          task_title,
          task_description,
          due_date
        )
      \`)
      .eq('is_active', true) as { data: ClientAlert[] | null, error: any };

    if (alertsError) {
      console.error("Error fetching active alerts:", alertsError.message);
      return res.status(500).json({ error: \`Error fetching active alerts: ${alertsError.message}\` });
    }

    if (!activeAlerts || activeAlerts.length === 0) {
      console.log("No active alerts to process.");
      return res.status(200).json({ message: "No active alerts to process." });
    }

    let processedCount = 0;
    let errorCount = 0;

    for (const alert of activeAlerts) {
      if (!alert.clients) {
        console.warn(\`Alert ID ${alert.id} is missing client data. Skipping.\`);
        continue;
      }

      if (alert.clients.automatedEmails === false) {
        console.log(\`Skipping alert for client ${alert.clients.client_name} (ID: ${alert.clients.id}) due to global automatedEmails setting.\`);
        continue;
      }

      let actualDueDateStr: string | undefined | null = null;
      let taskDetails = { title: alert.alert_type.replace(/_/g, ' '), description: '' };

      switch (alert.alert_type) {
        case "NEXT_ACCOUNTS_DUE": actualDueDateStr = alert.clients.next_accounts_due; break;
        case "NEXT_CONFIRMATION_STATEMENT_DUE": actualDueDateStr = alert.clients.next_confirmation_statement_due; break;
        case "NEXT_VAT_DUE": actualDueDateStr = alert.clients.next_vat_due; break;
        case "CORPORATION_TAX_DEADLINE": actualDueDateStr = alert.clients.corporation_tax_deadline; break;
        case "CLIENT_TASK":
          if (alert.source_task_id && alert.client_tasks && alert.client_tasks.due_date) {
            actualDueDateStr = alert.client_tasks.due_date;
            taskDetails.title = alert.client_tasks.task_title || taskDetails.title;
            taskDetails.description = alert.client_tasks.task_description || '';
          } else if (alert.source_task_id) {
             console.warn(\`Client task details not found for alert ID ${alert.id} with source_task_id ${alert.source_task_id}. Skipping task specific details.\`);
          }
          break;
        default:
          console.warn(\`Unknown alert_type: ${alert.alert_type} for alert ID ${alert.id}.\`);
          continue;
      }

      if (!actualDueDateStr) {
        console.warn(\`No due date determined for alert ID ${alert.id} (Type: ${alert.alert_type}, Client: ${alert.clients.client_name}). Skipping.\`);
        continue;
      }

      const actualDueDate = new Date(actualDueDateStr);
      if (isNaN(actualDueDate.getTime())) {
        console.warn(\`Invalid due date format for alert ID ${alert.id} (Date: ${actualDueDateStr}). Skipping.\`);
        continue;
      }
      
      const triggerDate = new Date(actualDueDate);
      triggerDate.setDate(actualDueDate.getDate() - alert.days_before_due);
      triggerDate.setHours(0, 0, 0, 0); // Normalize to start of day for comparison

      const today = new Date();
      today.setHours(0, 0, 0, 0); // Normalize to start of day

      const hasBeenTriggeredForThisWindow = alert.last_triggered_at && (new Date(alert.last_triggered_at) >= triggerDate);

      if (today >= triggerDate && !hasBeenTriggeredForThisWindow) {
        console.log(\`Processing alert ID ${alert.id} for client ${alert.clients.client_name}. Trigger date: ${triggerDate.toISOString().split('T')[0]}, Due date: ${actualDueDate.toISOString().split('T')[0]}\`);

        let emailSubject = \`Reminder: ${taskDetails.title} Due Soon\`;
        let emailBody = alert.alert_message;

        // Basic templating
        emailBody = emailBody.replace(/{{client_name}}/g, alert.clients.client_name || 'Valued Client');
        emailBody = emailBody.replace(/{{company_name}}/g, alert.clients.company_name || alert.clients.client_name || 'Your Company');
        emailBody = emailBody.replace(/{{due_date}}/g, actualDueDate.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })); // Example format
        emailBody = emailBody.replace(/{{task_title}}/g, taskDetails.title);
        emailBody = emailBody.replace(/{{task_description}}/g, taskDetails.description);
        emailBody = emailBody.replace(/{{alert_type_friendly_name}}/g, alert.alert_type.replace(/_/g, ' ').toLowerCase().replace(/\\b\\w/g, l => l.toUpperCase()));

        const recipientEmail = alert.clients.client_email;
        if (!recipientEmail) {
          console.warn(\`No email found for client ID ${alert.clients.id} on alert ID ${alert.id}. Skipping.\`);
          errorCount++;
          continue;
        }

        try {
          if (alert.notification_preference === 'SEND_DIRECT_TO_CLIENT') {
            await sendEmailWithSendGrid(recipientEmail, emailSubject, emailBody);
            console.log(\`Direct email sent for alert ID ${alert.id} to ${recipientEmail}.\`);
          } else if (alert.notification_preference === 'DRAFT_FOR_TEAM') {
            const { error: draftError } = await supabaseAdminClient
              .from('drafted_reminders')
              .insert({
                client_id: alert.clients.id,
                client_alert_id: alert.id,
                recipient_email: recipientEmail, // Store intended recipient
                email_subject: emailSubject,
                email_body: emailBody,
                status: 'PENDING_REVIEW'
              });
            if (draftError) throw draftError;
            console.log(\`Draft created for alert ID ${alert.id} for client ${alert.clients.client_name}.\`);
          }

          // Update last_triggered_at on successful action
          const { error: updateError } = await supabaseAdminClient
            .from('client_alerts')
            .update({ last_triggered_at: new Date().toISOString() })
            .eq('id', alert.id);

          if (updateError) {
            console.error(\`Error updating last_triggered_at for alert ID ${alert.id}:\`, updateError.message);
            errorCount++; // Still count as an error if DB update fails
          } else {
            processedCount++;
          }

        } catch (actionError: any) {
          console.error(\`Error during action (send/draft) for alert ID ${alert.id}:\`, actionError.message, actionError.stack);
          errorCount++;
        }
      }
    }

    console.log(\`Daily alert analysis complete via API route. Processed: ${processedCount}, Errors: ${errorCount}\`);
    return res.status(200).json({ message: \`Daily alert analysis complete. Processed: ${processedCount}, Errors: ${errorCount}\` });

  } catch (e: any) {
    console.error("Critical error in dailyAlertAnalyzer API route:", e.message, e.stack);
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
} 