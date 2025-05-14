import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient, SupabaseClient, PostgrestError } from '@supabase/supabase-js';
import { sendEmailWithSendGrid } from '../../../lib/sendgrid';

// Define types for clarity (reuse or define as needed)
interface Client {
  id: string;
  client_name: string;
  client_email: string;
  automatedEmails: boolean;
  company_name?: string; // Add if you have it and want to use in templates
  created_by?: string; // Added for task assignment
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

// Define the mapping for due date fields, alert types, and friendly names
const DUE_DATE_CONFIG = [
  { field: 'next_accounts_due', alertType: 'NEXT_ACCOUNTS_DUE', friendlyName: 'Next Accounts Due' },
  { field: 'next_confirmation_statement_due', alertType: 'NEXT_CONFIRMATION_STATEMENT_DUE', friendlyName: 'Next Confirmation Statement Due' },
  { field: 'next_vat_due', alertType: 'NEXT_VAT_DUE', friendlyName: 'Next VAT Due' },
  { field: 'corporation_tax_deadline', alertType: 'CORPORATION_TAX_DEADLINE', friendlyName: 'Corporation Tax Deadline' },
  // Add other due date fields here if needed in the future
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const CRON_SECRET = process.env.CRON_SECRET_KEY;
  const authorizationHeader = req.headers.authorization;

  if (req.method !== 'POST') { // Vercel Cron Jobs use POST by default if there's a body, or GET
    return res.status(405).json({ error: 'Method Not Allowed. Please use POST.' });
  }

  // Security Check: Ensure the cron job is the one calling this
  if (!CRON_SECRET || !authorizationHeader || authorizationHeader !== 'Bearer ' + CRON_SECRET) {
    console.warn("Unauthorized attempt to run alert analyzer. Check CRON_SECRET_KEY and Authorization header.");
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let supabaseAdminClient: SupabaseClient | null = null;

  try {
    supabaseAdminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    console.log("Starting daily alert analysis and task generation via API route...");

    // --- New Logic: Check for clients missing alerts and create tasks ---
    try {
      const { data: allClients, error: clientsFetchError } = await supabaseAdminClient
        .from('clients')
        .select('id, client_name, created_by, next_accounts_due, next_confirmation_statement_due, next_vat_due, corporation_tax_deadline'); // Ensure all fields in DUE_DATE_CONFIG are selected

      if (clientsFetchError) {
        console.error("Error fetching clients for task generation:", clientsFetchError.message);
        // Continue to alert processing, but log this error
      }

      if (allClients && allClients.length > 0) {
        console.log(`Checking ${allClients.length} clients for missing alerts to create tasks...`);
        for (const client of allClients) {
          for (const config of DUE_DATE_CONFIG) {
            const dueDateValue = (client as Record<string, string | null | undefined>)[config.field];

            if (dueDateValue) {
              try {
                const parsedDueDate = new Date(dueDateValue);
                if (isNaN(parsedDueDate.getTime())) {
                  // console.warn(`Client ${client.id} has invalid date for ${config.field}: ${dueDateValue}. Skipping task creation for this due date.`);
                  continue;
                }
                if (parsedDueDate <= new Date()) {
                  // console.log(`Client ${client.id} has past due date for ${config.field}: ${dueDateValue}. Skipping task creation.`);
                  continue;
                }

                // 1. Check if an active alert already exists for this client and alertType
                const { data: existingAlert, error: checkAlertError } = await supabaseAdminClient
                  .from('client_alerts')
                  .select('id')
                  .eq('client_id', client.id)
                  .eq('alert_type', config.alertType)
                  .eq('is_active', true)
                  .maybeSingle();

                if (checkAlertError) {
                  console.error(`Error checking existing alert for client ${client.id} (${client.client_name}), type ${config.alertType}:`, checkAlertError.message);
                  continue; 
                }

                if (!existingAlert) {
                  // 2. Check if a non-completed task to create this alert already exists
                  const { data: existingTask, error: checkTaskError } = await supabaseAdminClient
                    .from('client_tasks')
                    .select('id')
                    .eq('client_id', client.id)
                    .eq('action_needed', 'CREATE_ALERT')
                    .eq('action_details->>alert_type', config.alertType) // Querying JSONB
                    .neq('stage', 'Completed / Filed') 
                    .maybeSingle();

                  if (checkTaskError) {
                    console.error(`Error checking existing task for client ${client.id} (${client.client_name}), type ${config.alertType}:`, checkTaskError.message);
                    continue;
                  }

                  if (!existingTask) {
                    const taskTitle = `Create Alert: ${client.client_name} - ${config.friendlyName}`;
                    const taskDescription = `Client ${client.client_name} has a due date for ${config.friendlyName} on ${parsedDueDate.toLocaleDateString()} but no active alert is set up. Please create one.`;
                    const actionDetails = {
                      alert_type: config.alertType,
                      due_date_field_name: config.field, // e.g., 'next_accounts_due'
                      due_date_value: dueDateValue,      // e.g., '2024-12-31'
                      client_name: client.client_name,
                      client_id: client.id // Include client_id in action_details for easy access on the frontend
                    };

                    const { error: createTaskError } = await supabaseAdminClient
                      .from('client_tasks')
                      .insert({
                        client_id: client.id,
                        task_title: taskTitle,
                        task_description: taskDescription,
                        stage: 'New Request / To Do', 
                        priority: 'Medium', 
                        assigned_user_id: client.created_by || null,
                        action_needed: 'CREATE_ALERT',
                        action_details: actionDetails,
                        due_date: dueDateValue, // Set task due date to the actual due date
                      });

                    if (createTaskError) {
                      console.error(`Failed to create task for client ${client.id} (${client.client_name}), type ${config.alertType}:`, createTaskError.message);
                    } else {
                      console.log(`TASK CREATED: ${taskTitle} for client ID ${client.id}`);
                    }
                  } else {
                    // console.log(`Task to create alert for ${config.friendlyName} for client ${client.client_name} already exists and is not completed. Skipping.`);
                  }
                } else {
                  // console.log(`Active alert for ${config.friendlyName} for client ${client.client_name} already exists. Skipping task creation.`);
                }
              } catch {
                // console.warn(`Error processing date for client ${client.id}, field ${config.field}, value ${dueDateValue}: ${dateError.message}. Skipping task creation for this due date.`);
              }
            }
          }
        }
        console.log("Finished checking clients for missing alerts.");
      } else if (!clientsFetchError) {
        console.log("No clients found to check for missing alerts.");
      }
    } catch (taskGenError: unknown) {
      console.error("An error occurred during the task generation process:", 
        taskGenError instanceof Error ? taskGenError.message : String(taskGenError),
        taskGenError instanceof Error ? taskGenError.stack : undefined
      );
      // Decide if this error should prevent alert processing. For now, it won't.
    }
    // --- End of New Logic ---

    // Get the accountancy name from the first admin profile (assumption: first admin user is the main one)
    // This assumes admin users have "admin" in their role field or some similar condition
    let accountancyName: string | undefined = undefined;
    const { data: adminProfiles, error: adminProfileError } = await supabaseAdminClient
      .from('profiles')
      .select('accountancy_name')
      .order('created_at', { ascending: true }) // Get the oldest profile (likely admin)
      .limit(1);
    
    if (!adminProfileError && adminProfiles && adminProfiles.length > 0 && adminProfiles[0].accountancy_name) {
      accountancyName = adminProfiles[0].accountancy_name;
      console.log(`Using accountancy name: ${accountancyName} for email sender`);
    } else {
      console.log("No accountancy name found in profiles, using default from environment");
    }

    const selectQuery = "id, client_id, alert_type, alert_message, days_before_due, notification_preference, last_triggered_at, source_task_id, clients(id, client_name, client_email, automatedEmails, company_name, next_accounts_due, next_confirmation_statement_due, next_vat_due, corporation_tax_deadline), client_tasks(id, task_title, task_description, due_date)";

    const { data: activeAlerts, error: alertsError } = await supabaseAdminClient
      .from('client_alerts')
      .select(selectQuery)
      .eq('is_active', true) as { data: ClientAlert[] | null, error: PostgrestError | null };

    if (alertsError) {
      console.error("Error fetching active alerts:", alertsError.message);
      return res.status(500).json({ error: "Error fetching active alerts: " + alertsError.message });
    }

    if (!activeAlerts || activeAlerts.length === 0) {
      console.log("No active alerts to process.");
      return res.status(200).json({ message: "No active alerts to process." });
    }

    let processedCount = 0;
    let errorCount = 0;

    // Get admin user email for CC on all emails
    let adminEmail: string | undefined = undefined;
    if (accountancyName) {
      const { data: adminUser, error: adminError } = await supabaseAdminClient
        .from('profiles')
        .select('email')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();
        
      if (!adminError && adminUser && adminUser.email) {
        adminEmail = adminUser.email;
        console.log(`Using admin email: ${adminEmail} for CC in alerts`);
      }
    }

    for (const alert of activeAlerts) {
      if (!alert.clients) {
        console.warn("Alert ID " + alert.id + " is missing client data. Skipping.");
        continue;
      }

      if (alert.clients.automatedEmails === false) {
        console.log("Skipping alert for client " + alert.clients.client_name + " (ID: " + alert.clients.id + ") due to global automatedEmails setting.");
        continue;
      }

      let actualDueDateStr: string | undefined | null = null;
      const taskDetails = { title: alert.alert_type.replace(/_/g, ' '), description: '' };

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
             console.warn("Client task details not found for alert ID " + alert.id + " with source_task_id " + alert.source_task_id + ". Skipping task specific details.");
          }
          break;
        default:
          console.warn("Unknown alert_type: " + alert.alert_type + " for alert ID " + alert.id + ".");
          continue;
      }

      if (!actualDueDateStr) {
        console.warn("No due date determined for alert ID " + alert.id + " (Type: " + alert.alert_type + ", Client: " + alert.clients.client_name + "). Skipping.");
        continue;
      }

      const actualDueDate = new Date(actualDueDateStr);
      if (isNaN(actualDueDate.getTime())) {
        console.warn("Invalid due date format for alert ID " + alert.id + " (Date: " + actualDueDateStr + "). Skipping.");
        continue;
      }
      
      const triggerDate = new Date(actualDueDate);
      triggerDate.setDate(actualDueDate.getDate() - alert.days_before_due);
      triggerDate.setHours(0, 0, 0, 0); // Normalize to start of day for comparison

      const today = new Date();
      today.setHours(0, 0, 0, 0); // Normalize to start of day

      const hasBeenTriggeredForThisWindow = alert.last_triggered_at && (new Date(alert.last_triggered_at) >= triggerDate);

      if (today >= triggerDate && !hasBeenTriggeredForThisWindow) {
        console.log("Processing alert ID " + alert.id + " for client " + alert.clients.client_name + ". Trigger date: " + triggerDate.toISOString().split('T')[0] + ", Due date: " + actualDueDate.toISOString().split('T')[0]);

        // Use improved templates based on alert type if no custom message is provided
        let emailSubject = '';
        let emailBody = '';
        const clientPortalLink = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://yourdomain.com'}/client-portal/${alert.clients.id}`;
        
        // Format due date for display
        const formattedDueDate = actualDueDate.toLocaleDateString('en-GB', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        });

        // If the client already provided a custom message, use that
        if (alert.alert_message && alert.alert_message.trim() !== '') {
          emailBody = alert.alert_message;
          emailSubject = "Reminder: " + taskDetails.title + " Due Soon";
        } else {
          // Create templates based on alert type
          switch (alert.alert_type) {
            case "NEXT_ACCOUNTS_DUE":
              emailSubject = `Important: Annual Accounts Filing Deadline - ${alert.clients.company_name || alert.clients.client_name}`;
              emailBody = `<p>Dear ${alert.clients.client_name},</p>
                
                <p>I hope this email finds you well.</p>

                <p>I am writing to remind you that your company's statutory accounts for ${alert.clients.company_name || 'your company'} are due to be filed with Companies House by <strong>${formattedDueDate}</strong>.</p>
                
                <p>To ensure we meet this statutory deadline and avoid any late filing penalties (which begin at £150 for accounts overdue by less than 1 month, and increase substantially thereafter), we would appreciate if you could:</p>
                
                <ul>
                  <li>Confirm that all business transactions up to your year-end have been properly recorded</li>
                  <li>Provide any outstanding bank statements, invoices, or receipts we have previously requested</li>
                  <li>Review and approve any draft accounts we have already sent to you</li>
                </ul>
                
                <p>For your convenience, you can securely upload any outstanding documentation through your client portal: <a href="${clientPortalLink}">Access Your Client Portal</a></p>
                
                <p>Please be aware that Companies House does not provide extensions except in very exceptional circumstances, so prompt attention to this matter is highly recommended.</p>
                
                <p>Should you have any questions regarding your accounts or require clarification on any items we need from you, please do not hesitate to contact me directly.</p>`;
              break;
              
            case "NEXT_CONFIRMATION_STATEMENT_DUE":
              emailSubject = `Action Required: Confirmation Statement Filing for ${alert.clients.company_name || alert.clients.client_name}`;
              emailBody = `<p>Dear ${alert.clients.client_name},</p>
                
                <p>I trust this email finds you well.</p>

                <p>This is a courtesy reminder that your company's confirmation statement is due to be filed with Companies House by <strong>${formattedDueDate}</strong>.</p>
                
                <p>The confirmation statement (which replaced the annual return in 2016) is a statutory filing that confirms the information Companies House holds about your company is correct and up-to-date.</p>
                
                <p>Please review and confirm the accuracy of the following information:</p>
                <ul>
                  <li>Registered office address</li>
                  <li>Directors' details (names, addresses, dates of birth, nationalities, occupations)</li>
                  <li>Company secretary details (if applicable)</li>
                  <li>Shareholders' information and share capital</li>
                  <li>People with Significant Control (PSC) details</li>
                  <li>Standard Industrial Classification (SIC) codes</li>
                </ul>
                
                <p>If there are any changes to the above information, please inform us promptly so we can make the necessary updates before filing.</p>
                
                <p>You can review your company information through your secure client portal: <a href="${clientPortalLink}">Access Your Client Portal</a></p>
                
                <p>Failure to file the confirmation statement on time is a criminal offence and may result in the company and its officers being prosecuted. Companies House may also initiate proceedings to strike off the company from the register.</p>
                
                <p>Should you have any questions or require assistance with this matter, please don't hesitate to contact me.</p>`;
              break;
              
            case "NEXT_VAT_DUE":
              emailSubject = `VAT Return Deadline Approaching - ${alert.clients.company_name || alert.clients.client_name}`;
              emailBody = `<p>Dear ${alert.clients.client_name},</p>
                
                <p>I hope you are keeping well.</p>

                <p>I am writing to remind you that your next VAT return for the period ending ${formattedDueDate.split(' ').slice(0, 2).join(' ')} is due to be submitted to HMRC by <strong>${formattedDueDate}</strong>.</p>
                
                <p>To ensure we can prepare and submit your VAT return accurately and on time, please provide the following by <strong>${new Date(actualDueDate.getTime() - 7*24*60*60*1000).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}</strong> at the latest:</p>
                
                <ul>
                  <li>All sales invoices issued during the period</li>
                  <li>All purchase invoices received during the period</li>
                  <li>Bank statements covering the entire VAT quarter</li>
                  <li>Details of any cash transactions not recorded through the bank</li>
                  <li>Information about any unusual or significant transactions</li>
                  <li>For any capital expenditure items, please provide full details and supporting documentation</li>
                </ul>
                
                <p>As you may be aware, HMRC imposes penalties for late VAT submissions and payments, particularly under the Making Tax Digital regime. The standard penalty for late payment starts at 2% of the VAT due and increases the longer the payment remains outstanding.</p>
                
                <p>You can securely upload all documentation through your client portal: <a href="${clientPortalLink}">Access Your Client Portal</a></p>
                
                <p>If you anticipate any issues with providing the required information or meeting the payment deadline, please contact me at your earliest convenience so we can discuss possible arrangements.</p>`;
              break;
              
            case "CORPORATION_TAX_DEADLINE":
              emailSubject = `Corporation Tax Payment Deadline - ${alert.clients.company_name || alert.clients.client_name}`;
              emailBody = `<p>Dear ${alert.clients.client_name},</p>
                
                <p>I trust this email finds you well.</p>

                <p>This is an important reminder that your corporation tax payment for ${alert.clients.company_name || 'your company'} is due to be paid to HMRC by <strong>${formattedDueDate}</strong>.</p>
                
                <p>Based on the calculations in your tax computation and CT600 return that we previously prepared, the corporation tax liability for this period is as detailed in our correspondence dated ${new Date(actualDueDate.getTime() - 30*24*60*60*1000).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}.</p>
                
                <p>Please be aware that HMRC charges interest on late payments of corporation tax from the day after the payment was due. The current interest rate for late payments is 2.75% (rate subject to change).</p>
                
                <p>You can make payment to HMRC using the following methods:</p>
                <ul>
                  <li>Online or telephone banking (Faster Payments)</li>
                  <li>CHAPS</li>
                  <li>Direct Debit (if previously set up)</li>
                  <li>Corporate credit or debit card online</li>
                </ul>
                
                <p>When making payment, please ensure you use your 17-character corporation tax reference number as the payment reference to ensure it is correctly allocated to your company's tax account.</p>
                
                <p>You can review your corporation tax return and payment details in your client portal: <a href="${clientPortalLink}">Access Your Client Portal</a></p>
                
                <p>If you foresee any difficulties in meeting this payment deadline, please contact me as soon as possible as HMRC may consider 'Time to Pay' arrangements in certain circumstances.</p>`;
              break;
              
            case "CLIENT_TASK":
              emailSubject = `Important Reminder: ${taskDetails.title} - Action Required`;
              emailBody = `<p>Dear ${alert.clients.client_name},</p>
                
                <p>I hope this email finds you well.</p>

                <p>I am writing to remind you about the following matter that requires your attention by <strong>${formattedDueDate}</strong>:</p>
                
                <p><strong>${taskDetails.title}</strong></p>
                
                <p>${taskDetails.description ? taskDetails.description : 'Please ensure this task is completed by the deadline to maintain compliance and avoid any potential issues.'}</p>
                
                <p>Your prompt attention to this matter will help ensure all your business affairs remain in good order and compliant with the relevant regulations.</p>
                
                <p>You can track the progress of this task and securely upload any relevant documents through your client portal: <a href="${clientPortalLink}">Access Your Client Portal</a></p>
                
                <p>If you require any clarification or assistance with this task, or if there are any circumstances that might prevent you from addressing this by the deadline, please don't hesitate to contact me to discuss further.</p>`;
              break;
              
            default:
              emailSubject = `Important Deadline Reminder - ${alert.clients.company_name || alert.clients.client_name}`;
              emailBody = `<p>Dear ${alert.clients.client_name},</p>
                
                <p>I hope you are well.</p>

                <p>This is a courtesy reminder about an important upcoming deadline on <strong>${formattedDueDate}</strong> that requires your attention.</p>
                
                <p>Addressing this matter in a timely manner will help ensure your business affairs remain compliant and avoid any potential penalties or complications.</p>
                
                <p>For full details regarding this deadline, please log in to your secure client portal: <a href="${clientPortalLink}">Access Your Client Portal</a></p>
                
                <p>Should you have any questions or require any assistance with this matter, please do not hesitate to contact me directly.</p>`;
          }
        }
        
        // Add standard footer with accountancy name and CC information
        emailBody += `
          <p>&nbsp;</p>
          <p>Kind regards,</p>
          <p><strong>${accountancyName || 'Your Accounting Team'}</strong></p>
          <p style="margin-top:0">Chartered Accountants &amp; Tax Advisers</p>
          <p>&nbsp;</p>
          <hr style="border:none; border-top:1px solid #e0e0e0; margin:20px 0;">
          <p style="font-size:12px; color:#505050;">This email is confidential and intended solely for the use of the individual to whom it is addressed. Any views or opinions presented are solely those of the author and do not necessarily represent those of ${accountancyName || 'our firm'}. If you have received this email in error, please notify us immediately.</p>
          <p style="font-size:12px; color:#505050;">Your accountant has been copied on this email. For any questions, please reply directly to this message.</p>
        `;

        // Basic templating for any remaining placeholders in custom messages
        emailBody = emailBody.replace(/{{client_name}}/g, alert.clients.client_name || 'Valued Client');
        emailBody = emailBody.replace(/{{company_name}}/g, alert.clients.company_name || alert.clients.client_name || 'Your Company');
        emailBody = emailBody.replace(/{{due_date}}/g, formattedDueDate);
        emailBody = emailBody.replace(/{{task_title}}/g, taskDetails.title);
        emailBody = emailBody.replace(/{{task_description}}/g, taskDetails.description);
        emailBody = emailBody.replace(/{{alert_type_friendly_name}}/g, alert.alert_type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase()));
        emailBody = emailBody.replace(/{{client_portal_link}}/g, clientPortalLink);

        const recipientEmail = alert.clients.client_email;
        if (!recipientEmail) {
          console.warn("No email found for client ID " + alert.clients.id + " on alert ID " + alert.id + ". Skipping.");
          errorCount++;
          continue;
        }

        try {
          if (alert.notification_preference === 'SEND_DIRECT_TO_CLIENT') {
            // Include CC to admin email
            const ccEmails = adminEmail ? [adminEmail] : [];
            
            await sendEmailWithSendGrid(recipientEmail, emailSubject, emailBody, accountancyName, ccEmails);
            console.log("Direct email sent for alert ID " + alert.id + " to " + recipientEmail + (adminEmail ? ` with CC to ${adminEmail}` : '') + ".");
          } else if (alert.notification_preference === 'DRAFT_FOR_TEAM') {
            if (!supabaseAdminClient) throw new Error("Supabase client not initialized for drafting.");
            const { error: draftError } = await supabaseAdminClient
              .from('drafted_reminders')
              .insert({
                client_id: alert.clients.id,
                client_alert_id: alert.id,
                recipient_email: recipientEmail, // Store intended recipient
                email_subject: emailSubject,
                email_body: emailBody,
                cc_email: adminEmail, // Store the CC email in the draft
                status: 'PENDING_REVIEW'
              });
            if (draftError) throw draftError;
            console.log("Draft created for alert ID " + alert.id + " for client " + alert.clients.client_name + ".");
          }

          // Update last_triggered_at on successful action
          if (!supabaseAdminClient) throw new Error("Supabase client not initialized for updating alert.");
          const { error: updateError } = await supabaseAdminClient
            .from('client_alerts')
            .update({ last_triggered_at: new Date().toISOString() })
            .eq('id', alert.id);

          if (updateError) {
            console.error("Error updating last_triggered_at for alert ID " + alert.id + ":", updateError.message);
            errorCount++; // Still count as an error if DB update fails
          } else {
            processedCount++;
          }

        } catch (actionError: unknown) {
          console.error("Error during action (send/draft) for alert ID " + alert.id + ":", 
            actionError instanceof Error ? actionError.message : String(actionError),
            actionError instanceof Error ? actionError.stack : undefined
          );
          errorCount++;
        }
      }
    }

    console.log("Daily alert analysis complete via API route. Processed: " + processedCount + ", Errors: " + errorCount);
    return res.status(200).json({ message: "Daily alert analysis complete. Processed: " + processedCount + ", Errors: " + errorCount });

  } catch (e: unknown) {
    console.error("Critical error in dailyAlertAnalyzer API route:", 
      e instanceof Error ? e.message : String(e),
      e instanceof Error ? e.stack : undefined
    );
    let errorMessage = 'An unexpected error occurred.';
    let errorStack: string | undefined = undefined;
    if (e instanceof Error) {
      errorMessage = e.message;
      errorStack = e.stack;
    } else if (typeof e === 'string') {
      errorMessage = e;
    }
    return res.status(500).json({ error: errorMessage, stack: errorStack });
  }
} 