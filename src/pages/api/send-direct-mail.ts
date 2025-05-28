import type { NextApiRequest, NextApiResponse } from 'next';
// import { supabase } from '@/lib/supabase'; // Ensuring this unused import is removed

interface StannpRecipient {
  title?: string;
  firstname?: string;
  lastname: string;
  address1?: string;
  address2?: string;
  city?: string;
  postcode?: string;
  country?: string;
  // Stannp allows custom fields for mail merge
  [key: string]: string | number | undefined; // For custom merge fields like company_name, due dates
}

interface StannpRequestBody {
  test: boolean; // true for test mode, false for live
  recipients: StannpRecipient[];
  // You can either use a pre-saved Stannp template_id OR send html_content directly
  template_id?: string;
  html_content?: string; 
}

interface CompanyDataMinimal {
  company_name: string | null;
  company_number: string;
  accounts_next_due_date: string | null;
  returns_next_due_date: string | null;
  reg_address_address_line1?: string | null;
  reg_address_address_line2?: string | null;
  reg_address_post_town?: string | null;
  reg_address_county?: string | null;
  reg_address_post_code?: string | null;
  // Add any other fields you expect to use as merge fields
}

interface RequestPayload {
  recipients: CompanyDataMinimal[];
  letterHtmlContent: string;
  currentUserEmail?: string; // For merge field
  isTest: boolean; // To control Stannp's test mode from frontend
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const stannpApiKey = process.env.STANNP_API_KEY;
  if (!stannpApiKey) {
    console.error('STANNP_API_KEY is not set in environment variables.');
    return res.status(500).json({ error: 'Server configuration error: Stannp API key missing.' });
  }

  const { recipients, letterHtmlContent, currentUserEmail, isTest } = req.body as RequestPayload;

  if (!recipients || recipients.length === 0 || !letterHtmlContent) {
    return res.status(400).json({ error: 'Missing required fields: recipients and letterHtmlContent.' });
  }

  const stannpRecipients: StannpRecipient[] = recipients.map(company => ({
    // title: "Director", // Example, make this dynamic if needed
    lastname: company.company_name || company.company_number || "Unknown Company", // Stannp requires lastname
    address1: company.reg_address_address_line1 === null ? undefined : company.reg_address_address_line1,
    address2: company.reg_address_address_line2 === null ? undefined : company.reg_address_address_line2,
    city: company.reg_address_post_town === null ? undefined : company.reg_address_post_town,
    postcode: company.reg_address_post_code === null ? undefined : company.reg_address_post_code,
    country: "UK", // Assuming UK for now
    // Custom merge fields that match placeholders in your letterHtmlContent
    // Ensure these placeholders (e.g., {Company Name}) are consistent
    "Company Name": company.company_name || 'N/A',
    "Accounts Due Date": company.accounts_next_due_date ? new Date(company.accounts_next_due_date).toLocaleDateString() : 'N/A',
    "Confirmation Statement Due Date": company.returns_next_due_date ? new Date(company.returns_next_due_date).toLocaleDateString() : 'N/A',
    // You might need to adjust placeholder names based on your letterHtmlContent
    // e.g. if letter uses {user_email}, then map it here:
    "user_email": currentUserEmail || '[Your Email Address]', 
  }));

  const stannpPayload: StannpRequestBody = {
    test: isTest, // Use the flag from the request
    recipients: stannpRecipients,
    html_content: letterHtmlContent, // Sending HTML directly
    // template_id: 'YOUR_STANNP_TEMPLATE_ID' // Alternatively, use a Stannp template
  };

  try {
    const stannpResponse = await fetch('https://dash.stannp.com/api/v1/campaigns/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': stannpApiKey,
      },
      body: JSON.stringify(stannpPayload),
    });

    const responseData = await stannpResponse.json();

    if (!stannpResponse.ok || responseData.error) {
      console.error('Stannp API Error:', responseData);
      // Try to provide a more specific error from Stannp if available
      const stannpErrorMsg = responseData.error?.message || responseData.error || JSON.stringify(responseData);
      return res.status(stannpResponse.status || 500).json({ 
        error: 'Failed to send letters via Stannp.', 
        stannp_error: stannpErrorMsg 
      });
    }

    // Example success response from Stannp might include a campaign ID or cost
    // { "success": true, "data": { "id": 12345, "status": "pending", "cost": "10.00" } }
    return res.status(200).json({ success: true, message: 'Letters submitted to Stannp successfully.', data: responseData.data });

  } catch (error: unknown) {
    console.error('Error calling Stannp API:', error);
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: 'Internal server error when calling Stannp.', details: message });
  }
} 