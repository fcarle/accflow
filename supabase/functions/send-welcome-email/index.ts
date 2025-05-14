import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { sendEmailWithSendGrid } from '../../../lib/sendgrid.ts'; // Adjust path as needed

console.log('Send Welcome Email function up and running!');

interface UserRecord {
  id: string;
  email?: string;
  // Add other fields from auth.users you might need, e.g., raw_user_meta_data
}

interface WebhookPayload {
  type: 'INSERT';
  table: 'users';
  schema: 'auth';
  record: UserRecord;
  old_record: null | UserRecord;
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const payload = await req.json() as WebhookPayload;

    // Validate payload structure (basic check)
    if (payload.type !== 'INSERT' || payload.table !== 'users' || payload.schema !== 'auth' || !payload.record) {
      console.error('Invalid payload structure:', payload);
      return new Response(JSON.stringify({ error: 'Invalid payload structure' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const user = payload.record;

    if (!user.email) {
      console.error('User email not found in payload:', user);
      return new Response(JSON.stringify({ error: 'User email not found' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // --- Define your email content here ---
    const emailSubject = 'Welcome to Our Platform!';
    // You can use user.raw_user_meta_data for personalization if it contains names, etc.
    const emailHtmlBody = `
      <h1>Welcome, ${user.email}!</h1>
      <p>Thank you for signing up to our platform.</p>
      <p>We're excited to have you on board.</p>
      <p>Best,</p>
      <p>The Team</p>
    `;
    // Consider fetching accountancy_name if needed by sendEmailWithSendGrid
    // For now, it will use the default from environment variables or 'Your Accounting Firm'
    const accountancyName = undefined; // Or fetch from user profile/settings if available

    await sendEmailWithSendGrid(user.email, emailSubject, emailHtmlBody, accountancyName);

    return new Response(JSON.stringify({ message: 'Welcome email sent successfully' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error processing request:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return new Response(JSON.stringify({ error: 'Failed to process webhook', details: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}); 