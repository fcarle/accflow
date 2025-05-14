import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient, SupabaseClient, PostgrestError } from '@supabase/supabase-js';

// Assuming sendEmailWithSendGrid is in a utility file, e.g., lib/sendgrid.ts
// If not, you'd copy the function definition here directly.
import { sendEmailWithSendGrid } from '../../../lib/sendgrid'; // Adjust path as needed

// Re-define or import necessary types if not globally available
interface Client {
  id: string;
  client_name: string;
  client_email: string;
  automatedEmails: boolean; // Though not used in this direct trigger, it's part of the model
  company_name?: string;
  next_accounts_due?: string;
  next_confirmation_statement_due?: string;
  next_vat_due?: string;
  corporation_tax_deadline?: string;
  // Add other relevant date fields
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
  source_task_id?: string;
  clients: Client; // Expecting client data to be joined
  client_tasks?: ClientTask; // Expecting task data to be joined (if applicable)
}

// Define ReminderSchedule type
interface ReminderSchedule {
  id: string;
  client_alert_id: string;
  days_before_due: number;
  alert_message: string | null; // Message specific to this schedule
  is_active: boolean;
  // Add other fields from your client_alert_schedules table if needed for email context
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed. Please use POST.' });
  }

  const { client_alert_id, test_email } = req.body;

  if (!client_alert_id || typeof client_alert_id !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid client_alert_id in request body.' });
  }

  // test_email is optional, but if provided, it should be a string
  if (test_email !== undefined && typeof test_email !== 'string') {
    return res.status(400).json({ error: 'If provided, test_email must be a valid email string.' });
  }

  let supabaseAdminClient: SupabaseClient;
  try {
    supabaseAdminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  } catch (error) {
    console.error("Error initializing Supabase client:", error);
    return res.status(500).json({ error: 'Error initializing Supabase client.' });
  }

  try {
    const { data: alert, error: fetchError } = await supabaseAdminClient
      .from('client_alerts')
      .select(`
        id,
        client_id,
        alert_type,
        alert_message,
        notification_preference,
        source_task_id,
        clients (*),
        client_tasks (*)
      `)
      .eq('id', client_alert_id)
      .single() as { data: ClientAlert | null, error: PostgrestError | null };

    if (fetchError) {
      console.error("Error fetching client alert:", fetchError.message);
      return res.status(500).json({ error: "Error fetching client alert: " + fetchError.message });
    }

    if (!alert) {
      return res.status(404).json({ error: "Client alert not found with ID: " + client_alert_id });
    }

    if (!alert.clients) {
      return res.status(500).json({ error: "Client data not found for the alert ID: " + client_alert_id });
    }

    // Fetch associated reminder schedules
    const { data: schedules, error: schedulesError }: { data: ReminderSchedule[] | null; error: PostgrestError | null } = await supabaseAdminClient
      .from('client_alert_schedules')
      .select('*')
      .eq('client_alert_id', alert.id)
      .order('days_before_due', { ascending: false });

    if (schedulesError) {
      console.error("Error fetching reminder schedules:", schedulesError.message);
      // Non-fatal, we can still try to send the main alert test
      // return res.status(500).json({ error: "Error fetching reminder schedules: " + schedulesError.message });
    }

    const emailTasks = [];
    const clientName = alert.clients.client_name;
    const companyName = alert.clients.company_name || clientName;
    const clientPortalLink = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://yourdomain.com'}/client-portal/${alert.clients.id}`;
    
    // Determine due date context from parent alert (used for all emails in sequence for simplicity in testing)
    let actualDueDateStr: string | undefined | null = null;
    const taskDetailsForEmail = { title: alert.alert_type.replace(/_/g, ' '), description: '' };

    switch (alert.alert_type) {
      case "NEXT_ACCOUNTS_DUE": actualDueDateStr = alert.clients.next_accounts_due; break;
      case "NEXT_CONFIRMATION_STATEMENT_DUE": actualDueDateStr = alert.clients.next_confirmation_statement_due; break;
      case "NEXT_VAT_DUE": actualDueDateStr = alert.clients.next_vat_due; break;
      case "CORPORATION_TAX_DEADLINE": actualDueDateStr = alert.clients.corporation_tax_deadline; break;
      case "CLIENT_TASK":
        if (alert.source_task_id && alert.client_tasks && alert.client_tasks.due_date) {
          actualDueDateStr = alert.client_tasks.due_date;
          taskDetailsForEmail.title = alert.client_tasks.task_title || taskDetailsForEmail.title;
          taskDetailsForEmail.description = alert.client_tasks.task_description || '';
        } else if (alert.source_task_id) {
          actualDueDateStr = new Date().toISOString(); 
        }
        break;
      default:
        actualDueDateStr = new Date().toISOString();
    }
    const actualDueDate = actualDueDateStr ? new Date(actualDueDateStr) : new Date();
    const formattedDueDate = actualDueDate.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });

    // Get accountancy name from profile (can be reused for all emails)
    let accountancyNameFromProfile: string | undefined = undefined;
    let userEmailForSignature: string | undefined = test_email; // Default to test_email
    let customSignature: string | undefined = undefined;

    if (test_email) {
      const { data: userProfile, error: profileError } = await supabaseAdminClient
        .from('profiles')
        .select('accountancy_name, email, custom_email_signature') // Added email and custom_email_signature
        .eq('email', test_email)
        .single();
      
      if (profileError) {
        console.warn("Could not fetch user profile for signature:", profileError.message);
        // Proceed with defaults
      } else if (userProfile) {
        accountancyNameFromProfile = userProfile.accountancy_name;
        userEmailForSignature = userProfile.email || test_email; // Prefer profile email
        customSignature = userProfile.custom_email_signature;
      }
    }

    // Task 1: Prepare the Main Alert Email
    let mainAlertBody = alert.alert_message;
    let mainAlertSubject = `Reminder: ${taskDetailsForEmail.title} Due Soon`;

    if (!mainAlertBody || mainAlertBody.trim() === '') {
      // Generate body from template if main alert_message is empty
      switch (alert.alert_type) {
        case "NEXT_ACCOUNTS_DUE":
          mainAlertSubject = `Important: Annual Accounts Filing Deadline - ${companyName}`;
          mainAlertBody = `<p>Dear ${clientName},</p><!-- ... (rest of NEXT_ACCOUNTS_DUE template using formattedDueDate, clientPortalLink) ... --><p>This is the main alert.</p>`;
          break;
        case "NEXT_CONFIRMATION_STATEMENT_DUE":
          mainAlertSubject = `Action Required: Confirmation Statement Filing for ${companyName}`;
          mainAlertBody = `<p>Dear ${clientName},</p><!-- ... (rest of NEXT_CONFIRMATION_STATEMENT_DUE template) ... --><p>This is the main alert.</p>`;
          break;
        case "NEXT_VAT_DUE":
            mainAlertSubject = `VAT Return Deadline Approaching - ${companyName}`;
            mainAlertBody = `<p>Dear ${clientName},</p><!-- ... (rest of NEXT_VAT_DUE template) ... --><p>This is the main alert.</p>`;
            break;
        case "CORPORATION_TAX_DEADLINE":
            mainAlertSubject = `Corporation Tax Payment Deadline - ${companyName}`;
            mainAlertBody = `<p>Dear ${clientName},</p><!-- ... (rest of CORPORATION_TAX_DEADLINE template) ... --><p>This is the main alert.</p>`;
            break;
        case "CLIENT_TASK":
            mainAlertSubject = `Important Reminder: ${taskDetailsForEmail.title} - Action Required`;
            mainAlertBody = `<p>Dear ${clientName},</p><p>I am writing to remind you about <strong>${taskDetailsForEmail.title}</strong> due by <strong>${formattedDueDate}</strong>.</p>${taskDetailsForEmail.description ? `<p>${taskDetailsForEmail.description}</p>` : ''}<p>This is the main alert.</p>`;
            break;
        default:
          mainAlertSubject = `Important Deadline Reminder - ${companyName}`;
          mainAlertBody = `<p>Dear ${clientName},</p><p>This is a reminder for an upcoming deadline on <strong>${formattedDueDate}</strong>.</p><p>This is the main alert.</p>`;
      }
    }
    emailTasks.push({
      type: 'Main Alert',
      subject: mainAlertSubject,
      body: mainAlertBody,
      days_before_due: alert.days_before_due // Assuming days_before_due is on ClientAlert type
    });

    // Task 2: Prepare Follow-up Emails from Schedules
    if (schedules) {
      schedules.forEach((schedule, index) => {
        let scheduleEmailBody = schedule.alert_message;
        let scheduleEmailSubject = `Follow-up Reminder: ${taskDetailsForEmail.title}`;

        if (!scheduleEmailBody || scheduleEmailBody.trim() === '') {
          // If schedule message is empty, use parent's custom message or parent's template-generated message
          scheduleEmailBody = mainAlertBody; // Fallback to the already determined main alert body
          // Keep subject related to the main alert type, just denote it's a follow-up
          scheduleEmailSubject = mainAlertSubject; // Use main alert subject as base
        }
        
        emailTasks.push({
          type: `Follow-up ${index + 1}`,
          subject: scheduleEmailSubject,
          body: scheduleEmailBody,
          days_before_due: schedule.days_before_due
        });
      });
    }

    const recipientEmail = test_email || alert.clients.client_email;
    if (!recipientEmail) {
      return res.status(500).json({ error: "No recipient email address available for sending." });
    }

    let sentCount = 0;
    const errors = [];

    for (const task of emailTasks) {
      let finalSubject = `[TEST - ${task.type}] ${task.subject}`;
      if (task.type !== 'Main Alert') {
        finalSubject = `[TEST - ${task.type} (${task.days_before_due} days before)] ${task.subject}`;
      }
      
      // Basic templating for body placeholders (already done for mainAlertBody)
      let finalBody = task.body.replace(/{{client_name}}/g, clientName || 'Valued Client');
      finalBody = finalBody.replace(/{{company_name}}/g, companyName || 'Your Company');
      finalBody = finalBody.replace(/{{due_date}}/g, formattedDueDate);
      finalBody = finalBody.replace(/{{task_title}}/g, taskDetailsForEmail.title);
      finalBody = finalBody.replace(/{{task_description}}/g, taskDetailsForEmail.description);
      finalBody = finalBody.replace(/{{client_portal_link}}/g, clientPortalLink);

      // Construct dynamic signature
      let emailSignatureHtml = '';
      if (customSignature) {
        // Assuming customSignature is plain text, convert newlines to <br> for HTML
        emailSignatureHtml = `<p>${customSignature.replace(/\n/g, '<br>')}</p>`;
      } else {
        emailSignatureHtml = `
          <p>&nbsp;</p>
          <p>Kind regards,</p>
          <p><strong>${accountancyNameFromProfile || 'Your Accounting Team'}</strong></p>`;
        if (userEmailForSignature) {
          emailSignatureHtml += `<p>If you have any questions, please contact us at ${userEmailForSignature}.</p>`;
        }
      }
      
      finalBody += emailSignatureHtml;
      // Add the "This is a test email" note separately if needed, or incorporate into default signature.
      finalBody += `<p>&nbsp;</p><p style="font-size:12px; color:#505050;">This is a test email. In a real scenario, your accountant might be CC'd if notification preference allows.</p>`;

      try {
        await sendEmailWithSendGrid(recipientEmail, finalSubject, finalBody, accountancyNameFromProfile);
        sentCount++;
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.error(`Error sending test email (${task.type}):`, errorMessage);
        errors.push(`Failed to send ${task.type}: ${errorMessage}`);
      }
    }

    if (errors.length > 0) {
      return res.status(207).json({ // Multi-Status
        message: `Test email sequence initiated. ${sentCount} of ${emailTasks.length} emails sent. Some errors occurred.`,
        sentCount,
        totalTasks: emailTasks.length,
        errors,
      });
    }

    return res.status(200).json({ 
      message: `Test email sequence initiated. All ${sentCount} emails sent successfully to ${recipientEmail}.`,
      sentCount,
      totalTasks: emailTasks.length
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("Critical error in trigger-single-alert API route:", errorMessage, errorStack);
    return res.status(500).json({ error: "An unexpected error occurred: " + errorMessage });
  }
} 