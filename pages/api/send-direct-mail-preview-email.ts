import type { NextApiRequest, NextApiResponse } from 'next';
import sgMail from '@sendgrid/mail';

// Define the expected structure of company data for the CSV
interface CompanyData {
  company_name: string | null;
  company_number: string;
  accounts_next_due_date: string | null;
  returns_next_due_date: string | null;
  reg_address_address_line1?: string | null;
  reg_address_address_line2?: string | null;
  reg_address_post_town?: string | null;
  reg_address_county?: string | null;
  reg_address_post_code?: string | null;
}

interface RequestPayload {
  letterHtmlContent: string;
  submittedByEmail: string; // User who initiated the action
  recipients: CompanyData[];
  targetEmail: string; // e.g., fabian@lysio.com
}

// Helper function to convert array of objects to CSV string
function convertToCSV(data: CompanyData[]): string {
  if (!data || data.length === 0) {
    return '';
  }
  const headers = [
    'Company Name', 
    'Company Number', 
    'Accounts Due Date', 
    'Confirmation Statement Due Date', 
    'Address Line 1', 
    'Address Line 2', 
    'Post Town', 
    'County', 
    'Post Code'
  ];
  const rows = data.map(company => [
    company.company_name || 'N/A',
    company.company_number,
    company.accounts_next_due_date ? new Date(company.accounts_next_due_date).toLocaleDateString() : 'N/A',
    company.returns_next_due_date ? new Date(company.returns_next_due_date).toLocaleDateString() : 'N/A',
    company.reg_address_address_line1 || '',
    company.reg_address_address_line2 || '',
    company.reg_address_post_town || '',
    company.reg_address_county || '',
    company.reg_address_post_code || ''
  ]);

  // Escape commas and quotes in cell values
  const escapeCell = (cell: string | number | boolean | Date | null | undefined): string => {
    if (cell === undefined || cell === null) return '';
    const strCell = String(cell);
    // If the cell contains a quote, a comma, or a newline, wrap it in double quotes and escape existing double quotes.
    if (strCell.includes('"') || strCell.includes(',') || strCell.includes('\n')) {
      return `"${strCell.replace(/"/g, '""')}"`;
    }
    return strCell;
  };

  const csvContent = [
    headers.map(escapeCell).join(','),
    ...rows.map(row => row.map(escapeCell).join(','))
  ].join('\n');

  return csvContent;
}

// SendGrid error type guard (similar to the one in send-marketing-email.ts)
interface SendGridErrorBody {
  errors?: { message: string }[];
}
interface SendGridErrorResponse {
  body?: SendGridErrorBody;
}
function isSendGridError(error: unknown): error is Error & { response?: SendGridErrorResponse } {
  if (error instanceof Error) {
    const err = error as Error & { response?: SendGridErrorResponse };
    return typeof err.response === 'object' && err.response !== null;
  }
  return false;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { letterHtmlContent, submittedByEmail, recipients, targetEmail } = req.body as RequestPayload;

  if (!letterHtmlContent || !submittedByEmail || !recipients || recipients.length === 0 || !targetEmail) {
    return res.status(400).json({ success: false, error: 'Missing required fields: letterHtmlContent, submittedByEmail, recipients (non-empty), and targetEmail.' });
  }

  if (!process.env.SENDGRID_API_KEY) {
    console.error('SENDGRID_API_KEY not found in environment variables.');
    return res.status(500).json({ success: false, error: 'Server configuration error: Missing SendGrid API Key.' });
  }
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  const csvData = convertToCSV(recipients);
  // Convert CSV data to base64 for SendGrid attachment
  const csvBase64 = Buffer.from(csvData).toString('base64');

  const mailSubject = `Direct Mail Preview Request (Submitted by ${submittedByEmail})`;
  const mailHtmlBody = `
    <h1>Direct Mail Preview Request</h1>
    <p><strong>Submitted by:</strong> ${submittedByEmail}</p>
    <p><strong>Number of Recipients:</strong> ${recipients.length}</p>
    <hr>
    <h2>Letter Content Preview:</h2>
    <div>${letterHtmlContent}</div>
    <hr>
    <p>Recipient data is attached as a CSV file (recipients.csv).</p>
  `;

  const msg = {
    to: targetEmail, // e.g., fabian@lysio.com
    from: {
        email: 'fabian@lysio.com', // Consistent with send-marketing-email.ts
        name: `${submittedByEmail} via AccFlow`
    },
    subject: mailSubject,
    html: mailHtmlBody,
    attachments: [
      {
        content: csvBase64,
        filename: 'recipients.csv',
        type: 'text/csv',
        disposition: 'attachment',
      },
    ],
  };

  try {
    await sgMail.send(msg);
    console.log('Direct mail preview email sent successfully to:', targetEmail);
    return res.status(200).json({ success: true, message: `Direct mail preview email sent successfully to ${targetEmail}.` });
  } catch (error: unknown) {
    let errorMessage = 'Failed to send email.';
    if (isSendGridError(error) && error.response?.body?.errors?.[0]?.message) {
      errorMessage = `SendGrid Error: ${error.response.body.errors[0].message}`;
      console.error(errorMessage);
    } else if (error instanceof Error) {
      errorMessage = error.message;
      console.error('Error:', errorMessage);
    } else {
      console.error('Unknown error:', error);
    }
    return res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
} 