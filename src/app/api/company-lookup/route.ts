import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const companyNumber = searchParams.get('companyNumber');

  if (!companyNumber) {
    return NextResponse.json({ error: 'Company number is required' }, { status: 400 });
  }

  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;

  if (!apiKey) {
    console.error('Companies House API key not configured on the server.');
    return NextResponse.json({ error: 'API integration not configured' }, { status: 500 });
  }

  const encodedApiKey = Buffer.from(`${apiKey}:`).toString('base64');
  const companiesHouseUrl = `https://api.company-information.service.gov.uk/company/${companyNumber}`;

  try {
    const response = await fetch(companiesHouseUrl, {
      headers: {
        'Authorization': `Basic ${encodedApiKey}`,
      },
      cache: 'no-store', // Ensure fresh data, or configure caching as needed
    });

    if (!response.ok) {
      // Try to parse error from Companies House if possible
      let errorBody = { message: `Error from Companies House: ${response.status} ${response.statusText}` };
      try {
        errorBody = await response.json();
      } catch {
        // Ignore if error response is not JSON
      }
      console.error('Error fetching from Companies House API (via proxy):', response.status, errorBody);
      return NextResponse.json({ error: errorBody.message || 'Failed to fetch company details from Companies House', details: errorBody }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error: unknown) {
    console.error('Exception in company-lookup API route:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Internal server error while fetching company details', details: errorMessage }, { status: 500 });
  }
} 