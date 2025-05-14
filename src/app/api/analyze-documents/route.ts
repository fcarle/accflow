import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
// import pdf from 'pdf-parse'; // For PDF parsing
import { parse as parseCsvSync } from 'csv-parse/sync'; // For CSV parsing (synchronous version)
// import { createWorker, OEM } from 'tesseract.js'; // No longer using tesseract.js
// import path from 'path'; // No longer using path for tesseract.js
import { recognize } from 'node-tesseract-ocr'; // Import node-tesseract-ocr

// Initialize Supabase client with the service role key
// Ensure these are set in your .env.local file or server environment variables
const supabaseAdmin: SupabaseClient = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// DeepSeek API related interfaces (can be shared if needed)
interface DeepSeekMessage { role: 'system' | 'user' | 'assistant'; content: string; }
interface DeepSeekRequest { model: string; messages: DeepSeekMessage[]; stream?: boolean; }
interface DeepSeekChoice { index: number; message: DeepSeekMessage; finish_reason: string; }
interface DeepSeekUsage { prompt_tokens: number; completion_tokens: number; total_tokens: number; }
interface DeepSeekResponse { id: string; object: string; created: number; model: string; choices: DeepSeekChoice[]; usage: DeepSeekUsage; }

console.log('Next.js API Route for analyze-documents loaded.');

// Helper function to list files for a client from Supabase Storage
async function listClientFiles(clientId: string): Promise<string[]> {
  const filePaths: string[] = [];
  const topLevelPath = `clients/${clientId}/`;
  console.log(`API Route: Listing files under path: ${topLevelPath}`);
  const categories = ['bankStatements', 'receipts', 'payrollSummaries', 'other'];
  for (const category of categories) {
      const categoryPath = `${topLevelPath}${category}/`;
      try {
          const { data: filesInCategory, error: categoryListError } = await supabaseAdmin.storage
              .from('client-files')
              .list(categoryPath, { limit: 500, offset: 0, sortBy: { column: 'name', order: 'asc' } });
          
          if (categoryListError) throw categoryListError;

          if (filesInCategory) {
              for (const file of filesInCategory) {
                  if (file.name !== '.emptyFolderPlaceholder') {
                      filePaths.push(`${categoryPath}${file.name}`);
                  }
              }
          }
      } catch(listError: unknown) {
           const errorMessage = listError instanceof Error ? listError.message : String(listError);
           console.error(`API Route: Error listing files in category ${categoryPath}:`, errorMessage);
      }
  }
  console.log(`API Route: Found ${filePaths.length} files for client ${clientId}.`);
  return filePaths;
}

// Helper function to extract text from a file buffer
async function extractTextFromFileBuffer(buffer: Buffer, filePath: string): Promise<string> {
    const lowerFilePath = filePath.toLowerCase();
    let extractedContent = ``;

    if (lowerFilePath.endsWith('.pdf')) {
        console.log(`API Route: Processing PDF: ${filePath} (PDF PARSING TEMPORARILY DISABLED)`);
        extractedContent = '[PDF processing is temporarily disabled for debugging.]';
        console.log(`API Route: PDF processing skipped. Length: ${extractedContent.length}`);
    } else if (lowerFilePath.endsWith('.csv')) {
        console.log(`API Route: Processing CSV: ${filePath}`);
        try {
            const records = parseCsvSync(buffer.toString('utf8'), { columns: true, skip_empty_lines: true, bom: true });
            if (records.length > 10) {
                extractedContent = `[TRUNCATED CSV DATA - Showing first 10 records out of ${records.length}]\n`;
                extractedContent += JSON.stringify(records.slice(0, 10), null, 2);
            } else {
                extractedContent = JSON.stringify(records, null, 2);
            }
            console.log(`API Route: Parsed CSV. Original records: ${records.length}. Content length after potential truncation: ${extractedContent.length}`);
        } catch (csvError: unknown) {
            const errorMessage = csvError instanceof Error ? csvError.message : String(csvError);
            console.error(`API Route: CSV Parsing Error for ${filePath}:`, errorMessage);
            extractedContent = `[CSV parsing failed: ${errorMessage}]`;
        }
    } else if (['.png', '.jpg', '.jpeg', '.tiff', '.bmp', '.gif'].some(ext => lowerFilePath.endsWith(ext))) {
        console.log(`API Route: Image file found: ${filePath}. Attempting OCR with node-tesseract-ocr...`);
        try {
            // node-tesseract-ocr configuration
            const config = {
                lang: "eng", // English
                oem: 3,      // OCR Engine Mode - Default, Tesseract LSTM only
                psm: 3,      // Page Segmentation Mode - Auto page segmentation with OSD (Orientation and Script Detection)
            };
            // The buffer from Supabase download should work directly
            const text = await recognize(buffer, config);
            extractedContent = text || '[OCR completed but no text found]';
            console.log(`API Route: node-tesseract-ocr extracted text. Length: ${extractedContent.length}`);
            if (extractedContent.length > 0) {
                console.log(`API Route: OCR Sample: ${extractedContent.substring(0,100)}...`);
            }
        } catch (ocrError: unknown) {
            const errorMessage = ocrError instanceof Error ? ocrError.message : String(ocrError);
            console.error(`API Route: node-tesseract-ocr Error for ${filePath}:`, errorMessage);
            extractedContent = `[OCR processing failed (node-tesseract-ocr): ${errorMessage}]`;
        }
    } else {
        console.log(`API Route: Skipping unsupported file type: ${filePath}`);
        extractedContent = '[Unsupported file type for text extraction]';
    }
    return extractedContent;
}

export async function POST(req: NextRequest) {
  console.log('API Route: Received POST request to /api/analyze-documents');
  try {
    const body = await req.json();
    const { clientId, customQuestion, analysisType } = body;

    if (!clientId) {
      console.warn('API Route: Missing clientId in request.');
      return NextResponse.json({ error: 'clientId is required.' }, { status: 400 });
    }
    console.log(`API Route: Processing analysis for clientId: ${clientId}, analysisType: ${analysisType || 'full_analysis'}`);

    // 1. Fetch client details (common for both types)
    const { data: clientData, error: clientError } = await supabaseAdmin
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single();

    if (clientError) throw new Error(`API Route: Failed to fetch client data: ${clientError.message}`);
    if (!clientData) throw new Error(`API Route: Client with ID ${clientId} not found.`);
    console.log(`API Route: Successfully fetched client data for: ${clientData.client_name}`);

    // 2. List files for the client (common for both types)
    const filePathsInBucket = await listClientFiles(clientId);
    
    // 3. Download files and extract text (common for both types, unless no files for full_analysis)
    let allExtractedText = '';
    if (filePathsInBucket.length > 0) {
      console.log(`API Route: Starting text extraction for ${filePathsInBucket.length} files...`);
      for (const filePath of filePathsInBucket) {
        console.log(`API Route: Downloading ${filePath}`);
        const { data: fileBlob, error: downloadError } = await supabaseAdmin.storage
          .from('client-files')
          .download(filePath);

        if (downloadError) {
          console.error(`API Route: Error downloading ${filePath}:`, downloadError.message);
          allExtractedText += `\n--- Start of ${filePath} ---\n[Error downloading: ${downloadError.message}]\n--- End of ${filePath} ---\n`;
          continue;
        }
        if (!fileBlob) {
          console.warn(`API Route: No blob data returned for ${filePath}`);
          allExtractedText += `\n--- Start of ${filePath} ---\n[Could not retrieve data]\n--- End of ${filePath} ---\n`;
          continue;
        }
        const buffer = Buffer.from(await fileBlob.arrayBuffer());
        const fileText = await extractTextFromFileBuffer(buffer, filePath);
        allExtractedText += `\n--- Start of ${filePath} ---\n${fileText}\n--- End of ${filePath} ---\n`;
      }
      if (!allExtractedText.trim()) allExtractedText = "[No text could be extracted from any documents.]";
      else console.log(`API Route: Completed text extraction. Total length before final truncation: ${allExtractedText.length}`);
    } else {
      // If no files, and it's a full analysis, we can short-circuit
      if (analysisType === 'full_analysis' || !analysisType) {
        console.log(`API Route: No files found for client ${clientId} during full_analysis.`);
        await supabaseAdmin.from('clients').update({ ai_document_status: 'Missing', ai_document_notes: 'No documents found in storage for analysis.', last_ai_analysis_at: new Date().toISOString() }).eq('id', clientId);
        return NextResponse.json({ success: true, analysis: { status: 'Missing', notes: 'No documents found for analysis.' } });
      }
      // If it's a 'question' type and no files, allExtractedText will remain empty, which is fine.
      allExtractedText = "[No documents found in storage for this client.]";
    }
    
    // Safety net: Truncate allExtractedText (common for both types)
    const MAX_CONTENT_LENGTH_FOR_AI = 30000; 
    if (allExtractedText.length > MAX_CONTENT_LENGTH_FOR_AI) {
        allExtractedText = allExtractedText.substring(0, MAX_CONTENT_LENGTH_FOR_AI) + "\n\n[CONTENT TRUNCATED DUE TO OVERALL LENGTH LIMIT]";
        console.log(`API Route: Truncated allExtractedText to ${allExtractedText.length} characters for AI prompt.`);
    }

    // 4. Prepare prompt for DeepSeek
    const deepSeekApiKey = process.env.DEEPSEEK_API_KEY;
    if (!deepSeekApiKey) throw new Error('DEEPSEEK_API_KEY is not set in server environment variables.');

    // Construct the shareable link
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'YOUR_SITE_BASE_URL'; // Fallback if not set
    const shareableLink = clientData.shareable_link_token 
      ? `${baseUrl}/share/${clientData.shareable_link_token}` 
      : 'Not available';

    const clientInfoForPrompt = `Client Name: ${clientData.client_name}\nCompany Name: ${clientData.company_name || 'N/A'}\nServices Provided: ${(clientData.services && clientData.services.length > 0) ? clientData.services.join(', ') : 'N/A'}\nNext Accounts Due Date: ${clientData.next_accounts_due || 'Not set'}\nShareable Document Upload Link: ${shareableLink}\nRequired Documents Checklist Status in DB (these are general needs for this client type):\n  Bank Statements Required: ${clientData.requiredDocuments?.bankStatements ? 'Yes' : 'No'}\n  Receipts Required: ${clientData.requiredDocuments?.receipts ? 'Yes' : 'No'}\n  Payroll Summaries Required: ${clientData.requiredDocuments?.payrollSummaries ? 'Yes' : 'No'}\n(Note: The checklist above indicates general requirements stored in the DB. Cross-reference with actual document content provided below.)`;
    
    let systemPrompt: string;
    let userPrompt: string;
    let aiStatusFromAnalysis: string | null = null; // To hold status for full analysis

    if (analysisType === 'question') {
        console.log("API Route: Preparing prompts for 'question' analysis type.");
        if (!customQuestion || String(customQuestion).trim() === '') {
            return NextResponse.json({ error: 'customQuestion is required for analysisType "question".' }, { status: 400 });
        }
        systemPrompt = `You are an AI assistant. You have access to client information including their name, key deadlines (like 'Next Accounts Due Date'), and a 'Shareable Document Upload Link'. You also have extracted content from their uploaded documents.\nBased on this, please answer the user's specific question directly and concisely. \nIf the question asks you to draft a message or reminder for the client (e.g., about a deadline), use the client's name, the relevant deadline, and include the Shareable Document Upload Link in the drafted message. Ensure the tone is professional and helpful. \nIf the documents do not contain the answer to a factual question, or if information is missing for a draft, state that clearly.`;
        userPrompt = `Client Information:\n${clientInfoForPrompt}\n\nExtracted Content from Uploaded Document(s):\n${allExtractedText}\n\nUser's Specific Question: ${String(customQuestion).trim()}\n\nPlease provide a direct answer to the user's question or perform the requested task (e.g., draft a message) based on all the provided information.`;
    
    } else { // Default to 'full_analysis'
        console.log("API Route: Preparing prompts for 'full_analysis' type.");
        systemPrompt = `You are an expert accounting assistant. Your primary task is to rigorously assess if a client has provided the necessary documents for standard accounting procedures. You will be given client details (including their name, a checklist of generally required documents, key deadlines like 'Next Accounts Due Date', and a 'Shareable Document Upload Link') and a summary of files they have uploaded.\n\nYour analysis should focus on:\n1.  **Relevance:** Does the *content* of each file (as far as can be determined) genuinely correspond to typical accounting documents like bank statements, receipts, payroll summaries, invoices, etc.? A file named "bank_statement.jpg" containing a random image is NOT a valid bank statement.\n2.  **Completeness based on Requirements:** Cross-reference the uploaded files with the client's "Required Documents Checklist". If a required document type is missing, or if a file provided for that type seems irrelevant or insufficient, this is a deficiency.\n3.  **Actionable Feedback:** Clearly state what is missing or what needs clarification.\n\nBased on your analysis, provide a status and an explanation:\n*   **Good:** All documents explicitly marked as "Required" in the client's checklist appear to be present AND the content (where discernible) seems relevant and appropriate for those requirements.\n*   **Okay:** Some "Required" documents are present and appear relevant, but other "Required" items are missing, or some provided files are questionable/irrelevant to the stated requirements (e.g., a company list instead of expense receipts, a logo image instead of a bank statement). Specify what's missing or questionable.\n*   **Missing:** Critically required documents (from the checklist) are absent, or the majority of uploaded files are clearly irrelevant to accounting needs (e.g., only random images, placeholder files, or data dumps not directly usable for accounting). It is also "Missing" if no documents are uploaded at all, or if uploaded documents don't address any of the "Required" items.\n\nIf document content cannot be fully verified (e.g., image OCR is unavailable, PDF parsing is disabled, or text says '[Unsupported file type...]'), be cautious. Do not assume a file is correct based on its name or folder alone if its content is not verifiable as a relevant financial document. State this limitation and its impact on your assessment in your notes. If a "Required" document's content is unverifiable, it contributes to an "Okay" or "Missing" status, not "Good".\n\nYou may also be asked to draft client communications (e.g., reminders about deadlines). Use the provided 'Client Name', relevant dates like 'Next Accounts Due Date', and the 'Shareable Document Upload Link' to create professional and helpful messages when such tasks are implied by the user's request or if you deem it a natural part of your actionable feedback.\n\nProvide your output STRICTLY in the following format for document analysis:\nStatus: [Good/Okay/Missing]\nExplanation: [Your detailed explanation and recommendations based on the above criteria. If you also draft a message, include it within this explanation section, clearly marked.]`;
        userPrompt = `Client Information:\n${clientInfoForPrompt}\n\nExtracted Content from Uploaded Document(s):\n${allExtractedText}\n\nPlease provide your analysis (Status and Explanation). If appropriate, you can also include a draft message to the client within your explanation.`;
        // The logic that appended customQuestion to userPrompt for full_analysis is now removed.
    }

    const deepSeekMessages: DeepSeekMessage[] = [ { role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt } ];
    const deepSeekPayload: DeepSeekRequest = { model: 'deepseek-chat', messages: deepSeekMessages };
    console.log("API Route: Prepared DeepSeek payload. Sending request...");

    // 5. Call DeepSeek API
    const deepSeekApiResponse = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepSeekApiKey}` },
      body: JSON.stringify(deepSeekPayload),
    });
    if (!deepSeekApiResponse.ok) { const errorBody = await deepSeekApiResponse.text(); throw new Error(`DeepSeek API request failed (${deepSeekApiResponse.status}): ${errorBody}`); }
    const analysisResult: DeepSeekResponse = await deepSeekApiResponse.json();
    const aiMessage = analysisResult.choices[0]?.message?.content || 'No response from AI.';
    console.log('API Route: AI Analysis Result Received');

    // 6. Parse AI response & 7. Store analysis results (DIFFERENTLY BASED ON TYPE)
    let finalNotesToSave = '';
    let finalStatusToSave: string | undefined = undefined; // Will only be set for full_analysis
    let lastAnalysisTimestamp: string | undefined = undefined; // Will only be set for full_analysis

    if (analysisType === 'question') {
      console.log("API Route: Processing response for 'question' analysis type.");
      const questionResponseSeparator = "\n\n---\n**User Question (answered on " + new Date().toLocaleString() + "):** " + String(customQuestion).trim() + "\n**AI Answer:**\n";
      finalNotesToSave = (clientData.ai_document_notes || '') + questionResponseSeparator + aiMessage;
      // Status and last_ai_analysis_at are NOT updated for a simple question.
      finalStatusToSave = clientData.ai_document_status; // Keep existing status
      lastAnalysisTimestamp = clientData.last_ai_analysis_at; // Keep existing timestamp

    } else { // Default to 'full_analysis'
      console.log("API Route: Processing response for 'full_analysis' type.");
      const statusMatch = aiMessage.match(/^Status:\s*(Good|Okay|Missing)/im);
      if (statusMatch && statusMatch[1]) {
        aiStatusFromAnalysis = statusMatch[1];
        finalNotesToSave = aiMessage.substring(statusMatch[0].length).trim();
        console.log(`API Route: Parsed AI Status for full_analysis: ${aiStatusFromAnalysis}`);
      } else {
        console.warn("API Route: Could not parse structured 'Status: ...' from AI response for full_analysis.");
        aiStatusFromAnalysis = "Okay"; // Default status if parsing fails
        finalNotesToSave = aiMessage; // Use full message as notes
      }
      finalStatusToSave = aiStatusFromAnalysis;
      lastAnalysisTimestamp = new Date().toISOString();
    }
    
    console.log(`API Route: Attempting to update client ${clientId}.`);
    
    interface UpdatePayload { // Defined interface for updatePayload
        ai_document_notes: string;
        ai_document_status?: string;
        last_ai_analysis_at?: string;
    }

    const updatePayload: UpdatePayload = {
        ai_document_notes: finalNotesToSave
    };
    if (finalStatusToSave !== undefined) { // Only update status if it was part of this analysis type
        updatePayload.ai_document_status = finalStatusToSave;
    }
    if (lastAnalysisTimestamp !== undefined && (analysisType !== 'question')) { // Only update timestamp for full analysis
         updatePayload.last_ai_analysis_at = lastAnalysisTimestamp;
    }

    const { error: updateClientError } = await supabaseAdmin
        .from('clients')
        .update(updatePayload)
        .eq('id', clientId);

    if (updateClientError) {
        console.error('API Route: Error updating client with AI analysis:', updateClientError.message);
        // Even if DB update fails, we might still want to return the AI's response to the user
        return NextResponse.json({ 
            success: false, 
            message: "AI analysis complete, but failed to save to DB.",
            analysis: { 
                status: analysisType === 'question' ? clientData.ai_document_status : finalStatusToSave, // return current status for question type
                notes: analysisType === 'question' ? aiMessage : finalNotesToSave // return direct AI message for question
            } 
        }, { status: 500 });
    } else {
        console.log(`API Route: Successfully updated client ${clientId} with AI analysis.`);
    }

    return NextResponse.json({ 
        success: true, 
        analysis: { 
            status: analysisType === 'question' ? clientData.ai_document_status : finalStatusToSave, 
            notes: analysisType === 'question' ? aiMessage : finalNotesToSave 
        } 
    });

  } catch (error: unknown) { // Changed any to unknown
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    console.error('API Route: Critical Error:', errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
} 