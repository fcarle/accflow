import type { NextApiRequest, NextApiResponse } from 'next';
import sgMail from '@sendgrid/mail';

type Data = {
  success: boolean;
  message?: string;
  error?: string;
};

interface SendGridErrorBody {
  errors?: { message: string }[];
}

interface SendGridErrorResponse {
  body?: SendGridErrorBody;
}

// It's good practice to check if the error is an instance of Error
// and then check for additional properties.
function isSendGridError(error: unknown): error is Error & { response?: SendGridErrorResponse } {
  if (error instanceof Error) {
    // Further check if it has the 'response' property, structured as expected
    const err = error as Error & { response?: SendGridErrorResponse };
    return typeof err.response === 'object' && err.response !== null;
    // You could add more specific checks for response.body.errors if needed
  }
  return false;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method === 'POST') {
    const { to, subject, html, fromName, requestingUserEmail } = req.body;

    if (!process.env.SENDGRID_API_KEY) {
      console.error('SENDGRID_API_KEY not found in environment variables.');
      return res.status(500).json({ success: false, error: 'Server configuration error: Missing SendGrid API Key.' });
    }
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    if (!to || !subject || !html) {
      return res.status(400).json({ success: false, error: 'Missing required fields: to, subject, or html.' });
    }

    let finalHtml = html;
    if (requestingUserEmail) {
      finalHtml += `<p><strong>Submitted by:</strong> ${requestingUserEmail}</p>`;
    }

    const msg = {
      to: to, // This is the recipient, correctly passed from frontend as fabian@accflow.org
      from: {
        email: 'fabian@lysio.com', // Corrected to lysio.com
        name: fromName || 'AccFlow Campaigns' // Optional: name of the sender
      },
      subject: subject,
      html: finalHtml,
    };

    try {
      await sgMail.send(msg);
      console.log('Email sent successfully to:', to);
      return res.status(200).json({ success: true, message: 'Email sent successfully.' });
    } catch (error: unknown) {
      if (isSendGridError(error) && error.response?.body?.errors?.[0]?.message) {
        console.error('SendGrid Error:', error.response.body.errors[0].message);
      } else if (error instanceof Error) {
        console.error('Error:', error.message);
      } else {
        console.error('Unknown error:', error);
      }
      return res.status(500).json({
        success: false,
        error: 'Failed to send email.',
      });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
} 