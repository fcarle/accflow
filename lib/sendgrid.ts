export async function sendEmailWithSendGrid(
  to: string, 
  subject: string, 
  htmlBody: string, 
  accountancyName?: string,
  cc?: string[]
): Promise<void> {
  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
  const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL;
  const YOUR_COMPANY_NAME = accountancyName || process.env.YOUR_COMPANY_NAME || 'Your Accounting Firm';

  if (!SENDGRID_API_KEY || !SENDGRID_FROM_EMAIL) {
    console.error("SendGrid API Key or From Email not configured.");
    throw new Error("SendGrid configuration missing.");
  }

  interface EmailPersonalization {
    to: { email: string }[];
    cc?: { email: string }[];
  }

  interface EmailContent {
    type: 'text/html';
    value: string;
  }

  interface EmailData {
    personalizations: EmailPersonalization[];
    from: { email: string; name: string };
    subject: string;
    content: EmailContent[];
  }

  const emailData: EmailData = {
    personalizations: [{ 
      to: [{ email: to }],
      ...(cc && cc.length > 0 ? { cc: cc.map(email => ({ email })) } : {})
    }],
    from: { email: SENDGRID_FROM_EMAIL, name: YOUR_COMPANY_NAME },
    subject: subject,
    content: [{ type: "text/html", value: htmlBody }],
  };

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + SENDGRID_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emailData),
  });

  if (!response.ok) {
    let errorBodyText = 'Unknown error';
    try {
      errorBodyText = await response.text();
    } catch (e) {
      console.error("Failed to parse SendGrid error body", e);
    }
    console.error("SendGrid API Error (" + response.status + "): " + errorBodyText);
    throw new Error("SendGrid API Error: " + response.status + " - " + errorBodyText);
  }
  console.log("Email successfully sent to " + to + (cc && cc.length > 0 ? ` with CC to ${cc.join(', ')}` : '') + " via SendGrid. Status: " + response.status);
} 