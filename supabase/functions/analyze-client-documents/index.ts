import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractText as extractPdfText, getDocumentProxy } from 'https://esm.sh/unpdf'; // Using unpdf

// Initialize Supabase client with the service role key
const supabaseAdmin: SupabaseClient = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '' // Use service role for admin tasks
);

// Define the expected request body (NOW ONLY clientId)
interface AnalyzeRequestBody {
  clientId: string;
}

interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface DeepSeekRequest {
  model: string;
  messages: DeepSeekMessage[];
  stream?: boolean;
  // Add other parameters like temperature, max_tokens if needed
}

interface DeepSeekChoice {
  index: number;
  message: DeepSeekMessage;
  finish_reason: string;
}

interface DeepSeekUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface DeepSeekResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: DeepSeekChoice[];
  usage: DeepSeekUsage;
}

console.log('analyze-client-documents Edge Function starting up (v2 - lists files internally)');

// Helper function to list all files for a client recursively (optional, simple list for now)
async function listClientFiles(clientId: string): Promise<string[]> {
  const filePaths: string[] = [];
  const topLevelPath = `clients/${clientId}/`;
  console.log(`Listing files under path: ${topLevelPath}`);

  const { data: objects, error: listError } = await supabaseAdmin.storage
    .from('client-files')
    .list(topLevelPath, {
      limit: 1000, // Increase limit if needed
      offset: 0,
      sortBy: { column: 'name', order: 'asc' },
      // search: '' // No search needed if listing recursively or by category folders
    });

  if (listError) {
    console.error(`Error listing files for client ${clientId}:`, listError);
    throw new Error(`Failed to list files: ${listError.message}`);
  }

  // This basic list gets top-level folders (categories). We need to list inside them.
  // A more robust approach would list recursively or iterate known categories.
  // For simplicity now, let's assume we list known categories:
  const categories = ['bankStatements', 'receipts', 'payrollSummaries', 'other'];
  for (const category of categories) {
      const categoryPath = `${topLevelPath}${category}/`;
      const { data: filesInCategory, error: categoryListError } = await supabaseAdmin.storage
          .from('client-files')
          .list(categoryPath, {
              limit: 500, // Limit per category
              offset: 0,
              sortBy: { column: 'name', order: 'asc' },
          });
      
      if (categoryListError) {
          console.error(`Error listing files in category ${categoryPath}:`, categoryListError);
          // Decide whether to continue or throw
          continue; 
      }

      if (filesInCategory) {
          for (const file of filesInCategory) {
              if (file.name !== '.emptyFolderPlaceholder') { // Skip placeholders
                  filePaths.push(`${categoryPath}${file.name}`);
              }
          }
      }
  }

  console.log(`Found ${filePaths.length} files for client ${clientId}.`);
  return filePaths;
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request (CORS preflight)');
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
      status: 200
    });
  }

  // Headers for the actual POST response
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  try {
    console.log(`Received request: ${req.method}`);
    // Parse request body, now expecting only clientId
    const requestBody: AnalyzeRequestBody = await req.json();
    const { clientId } = requestBody;

    if (!clientId) {
      console.warn('Missing clientId in request.');
      return new Response(JSON.stringify({ error: 'clientId is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Processing analysis request for clientId: ${clientId}`);

    // 1. Fetch client details (same as before)
    const { data: clientData, error: clientError } = await supabaseAdmin
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single();

    if (clientError) throw new Error(`Failed to fetch client data: ${clientError.message}`);
    if (!clientData) throw new Error(`Client with ID ${clientId} not found.`);
    console.log(`Successfully fetched client data for: ${clientData.client_name}`);

    // 2. List files from storage for the client
    const filePathsInBucket = await listClientFiles(clientId);

    if (filePathsInBucket.length === 0) {
      console.log(`No processable files found for client ${clientId}. Updating status.`);
      // Optionally update client status directly here if no files found
       const { error: updateClientError } = await supabaseAdmin
          .from('clients')
          .update({
            ai_document_status: 'Missing', // Or 'Okay' if no files are expected
            ai_document_notes: 'No documents found in storage for analysis.',
            last_ai_analysis_at: new Date().toISOString(), 
          })
          .eq('id', clientId);
       if (updateClientError) console.error('Error updating client status (no files):', updateClientError);
       
      return new Response(JSON.stringify({ success: true, analysis: { status: 'Missing', notes: 'No documents found for analysis.' } }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Download and extract text from listed files (same logic as before, using the listed paths)
    let allExtractedText = '';
    for (const filePath of filePathsInBucket) {
       if (filePath.toLowerCase().endsWith('.pdf')) {
        console.log(`Processing PDF: ${filePath}`);
        const { data: fileBlob, error: downloadError } = await supabaseAdmin.storage
          .from('client-files')
          .download(filePath);

        if (downloadError) {
          console.error(`Error downloading ${filePath}:`, downloadError);
          allExtractedText += `\n[Error downloading ${filePath}: ${downloadError.message}]\n`;
          continue;
        }
        if (!fileBlob) {
          console.warn(`No blob data returned for ${filePath}`);
          allExtractedText += `\n[Could not retrieve data for ${filePath}]\n`;
          continue;
        }
        
        try {
          const buffer = await fileBlob.arrayBuffer();
          const pdf = await getDocumentProxy(new Uint8Array(buffer));
          const { text: pdfText } = await extractPdfText(pdf, { mergePages: true });
          allExtractedText += `\n--- Content of ${filePath} ---\n${pdfText}\n--- End of ${filePath} ---\n`;
          console.log(`Extracted text from ${filePath}. Length: ${pdfText.length}`);
        } catch (textExtractError: unknown) {
          console.error(`Error extracting text from ${filePath}:`, textExtractError);
          const message = textExtractError instanceof Error ? textExtractError.message : 'Unknown error during text extraction';
          allExtractedText += `\n[Error extracting text from ${filePath}: ${message}]\n`;
        }
      } else {
        console.log(`Skipping non-PDF file: ${filePath} (OCR not yet implemented)`);
        allExtractedText += `\n[File ${filePath} is not a PDF and OCR is not yet implemented.]\n`;
      }
    }

    if (!allExtractedText.trim()) {
        allExtractedText = "[No text could be extracted from the listed documents or no documents were processable.]";
    }

    // 4. Prepare the prompt for DeepSeek (same as before)
     const systemPrompt = `You are an expert accounting assistant. 
    Your task is to analyze client information and the content of their uploaded documents.
    Based on this, determine if there are any obvious missing documents or information typically required for accounting purposes.
    Provide a status: "Good", "Okay", or "Missing".
    - "Good": All expected documents and information seem to be present.
    - "Okay": Some minor discrepancies or areas to double-check, but largely complete.
    - "Missing": Obvious key documents or pieces of information are absent.
    Also provide a brief explanation for your status.`;

    const clientInfoForPrompt = `Client Name: ${clientData.client_name}
    Company Name: ${clientData.company_name || 'N/A'}
    Services Provided: ${(clientData.services && clientData.services.length > 0) ? clientData.services.join(', ') : 'N/A'}
    Required Documents Checklist Status in DB:
      Bank Statements Required: ${clientData.requiredDocuments?.bankStatements ? 'Yes' : 'No'}
      Receipts Required: ${clientData.requiredDocuments?.receipts ? 'Yes' : 'No'}
      Payroll Summaries Required: ${clientData.requiredDocuments?.payrollSummaries ? 'Yes' : 'No'}
    (Note: The checklist above indicates general requirements stored in the DB. Cross-reference with actual document content provided below.)
    `;
    
    const userPrompt = `Client Information:
    ${clientInfoForPrompt}

    Listed Document(s) Content:
    ${allExtractedText}

    Please provide your analysis (Status and Explanation):`;

    const deepSeekMessages: DeepSeekMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const deepSeekPayload: DeepSeekRequest = {
      model: 'deepseek-chat', 
      messages: deepSeekMessages,
    };

    console.log("Prepared DeepSeek payload. Sending request...");

    // 5. Call DeepSeek API (same as before)
    const deepSeekApiKey = Deno.env.get('DEEPSEEK_API_KEY');
    if (!deepSeekApiKey) throw new Error('DEEPSEEK_API_KEY is not set.');

    const deepSeekApiResponse = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepSeekApiKey}` },
      body: JSON.stringify(deepSeekPayload),
    });

    if (!deepSeekApiResponse.ok) {
      const errorBody = await deepSeekApiResponse.text();
      throw new Error(`DeepSeek API request failed (${deepSeekApiResponse.status}): ${errorBody}`);
    }

    const analysisResult: DeepSeekResponse = await deepSeekApiResponse.json();
    const aiMessage = analysisResult.choices[0]?.message?.content || 'No response from AI.';
    console.log('AI Analysis Result Received:', aiMessage);

    // 6. Parse AI response (same as before)
    let aiStatus = "Okay";
    let aiExplanation = aiMessage;
    const statusMatch = aiMessage.match(/^Status:\s*(Good|Okay|Missing)/im);
    if (statusMatch && statusMatch[1]) {
        aiStatus = statusMatch[1];
        aiExplanation = aiMessage.substring(statusMatch[0].length).trim();
        console.log(`Parsed AI Status: ${aiStatus}`);
    } else {
        console.warn("Could not parse structured 'Status: ...' from AI response.");
    }

    // 7. Store analysis results in Supabase (same as before)
    console.log(`Attempting to update client ${clientId} with Status: ${aiStatus}`);
    const { error: updateClientError } = await supabaseAdmin
      .from('clients')
      .update({ ai_document_status: aiStatus, ai_document_notes: aiExplanation, last_ai_analysis_at: new Date().toISOString() })
      .eq('id', clientId);

    if (updateClientError) console.error('Error updating client with AI analysis:', updateClientError);
    else console.log(`Successfully updated client ${clientId} with AI analysis.`);

    // 8. Return success response
    return new Response(JSON.stringify({ success: true, analysis: { status: aiStatus, notes: aiExplanation } }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Critical Error in Edge Function:', error);
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}); 