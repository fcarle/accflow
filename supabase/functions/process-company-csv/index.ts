import { serve, ServerRequest } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { parse } from 'https://deno.land/std@0.177.0/encoding/csv.ts'

// WARNING: The Deno standard library version and Supabase client version might need adjustment
// based on the versions supported by Supabase Edge Functions at the time of deployment.
// Always check Supabase documentation for recommended versions.

console.log('Edge Function "process-company-csv" loaded')

// Helper to convert DD/MM/YYYY to YYYY-MM-DD
// Returns null if dateStr is invalid or empty
function formatDate(dateStr: string | undefined | null): string | null {
  if (!dateStr || dateStr.trim() === '') {
    return null
  }
  const parts = dateStr.split('/')
  if (parts.length === 3) {
    const day = parts[0]
    const month = parts[1]
    const year = parts[2]
    // Basic validation for year length and numeric parts
    if (year.length === 4 && !isNaN(parseInt(day)) && !isNaN(parseInt(month)) && !isNaN(parseInt(year))) {
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    }
  }
  console.warn(`Invalid date format encountered: ${dateStr}`)
  return null // Or handle error differently
}

// Helper to convert string to integer, returns null if not a valid number
function parseIntSafe(value: string | undefined | null): number | null {
  if (value === undefined || value === null || value.trim() === '') {
    return null
  }
  const num = parseInt(value, 10)
  return isNaN(num) ? null : num
}


const BATCH_SIZE = 100 // Number of rows to upsert at a time

serve(async (req: Request) => {
  // This function is ideally triggered by a Supabase Storage event.
  // The request body will contain the event payload.
  let eventRecord: any // Initialize with any, will be refined by payload structure

  try {
    const payload = await req.json()
    console.log('Received payload:', JSON.stringify(payload, null, 2))

    // Check if it's a storage event and specifically for object creation
    if (payload.type === 'INSERT' && payload.table === 'objects' && payload.schema === 'storage') {
      eventRecord = payload.record
      if (!eventRecord || !eventRecord.name || !eventRecord.bucket_id) {
        console.error('Invalid storage event payload:', eventRecord)
        return new Response(JSON.stringify({ error: 'Invalid storage event payload' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      console.log(`Processing new file: ${eventRecord.name} in bucket ${eventRecord.bucket_id}`)
    } else {
      // If not a valid storage event, or if invoked directly for testing
      console.warn('Payload is not a recognized storage INSERT event or direct invocation:', payload.type)
      // For direct invocation testing, you might pass a mock payload or handle differently.
      // For now, we'll assume it must be a storage trigger.
      return new Response(JSON.stringify({ error: 'Function expects a Supabase Storage INSERT event.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  } catch (e: any) { // Added type: any for the caught error
    console.error('Error parsing request or invalid payload:', e)
    return new Response(JSON.stringify({ error: `Error parsing request: ${e.message}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const bucketId = eventRecord.bucket_id
  const filePath = eventRecord.name // e.g., "public/your-file-name.csv"

  // Ensure this function only processes files from the intended bucket
  if (bucketId !== 'companies-house-uploads') {
    console.warn(`File uploaded to unexpected bucket: ${bucketId}. Expected 'companies-house-uploads'.`)
    return new Response(JSON.stringify({ error: 'File not in the correct bucket.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    // @ts-ignore Deno is a global in Supabase Edge Functions
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    // @ts-ignore Deno is a global in Supabase Edge Functions
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    
    const supabaseAdminClient = createClient(supabaseUrl, supabaseServiceRoleKey)

    console.log(`Attempting to download ${filePath} from bucket ${bucketId}`)
    const { data: fileData, error: downloadError } = await supabaseAdminClient.storage
      .from(bucketId)
      .download(filePath)

    if (downloadError) {
      console.error('Error downloading file:', downloadError)
      throw downloadError
    }

    if (!fileData) {
      console.error('No file data received.')
      throw new Error('No file data received from storage.')
    }

    console.log(`File ${filePath} downloaded successfully. Size: ${fileData.size} bytes. Starting processing.`)

    const fileContent = await fileData.text()
    
    // Parse the CSV content
    // Assuming the first non-empty line that matches expected headers is the header row
    // This is a simplified header detection. Robust detection might be needed.
    const lines = fileContent.split('\n')
    let headerRowIndex = -1
    let headers: string[] = []

    // Expected headers (subset for matching)
    const expectedHeaderSample = ['CompanyName', 'CompanyNumber', 'RegAddress.PostCode']
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '') continue
      // Simple check if the line looks like a header
      const potentialHeaders = lines[i].split(',').map((h: string) => h.trim().replace(/^"|"$/g, '')) // Trim and remove quotes
      if (expectedHeaderSample.every(eh => potentialHeaders.includes(eh))) {
        headers = potentialHeaders
        headerRowIndex = i
        console.log('Detected header row at line:', headerRowIndex + 1, 'Headers:', headers)
        break
      }
    }

    if (headerRowIndex === -1) {
      console.error('Could not find a valid header row in the CSV.')
      throw new Error('Valid CSV header row not found.')
    }
    
    // Content starts after the header row
    const csvContentForParsing = lines.slice(headerRowIndex + 1).join('\n')

    const records = await parse(csvContentForParsing, {
      skipFirstRow: false, // We've already skipped to the data
      columns: headers,   // Use detected headers for mapping
    }) as Array<Record<string, string>> // Type assertion

    console.log(`Parsed ${records.length} records from CSV.`)

    let recordsToUpsert = []
    let totalUpsertedCount = 0

    for (const record of records) {
      if (!record.CompanyNumber || record.CompanyNumber.trim() === '') {
        console.warn('Skipping record due to missing CompanyNumber:', record)
        continue // Skip records without a primary key
      }

      const transformedRecord = {
        company_name: record.CompanyName?.trim() || null,
        company_number: record.CompanyNumber.trim(), // Primary Key
        reg_address_care_of: record['RegAddress.CareOf']?.trim() || null,
        reg_address_po_box: record['RegAddress.POBox']?.trim() || null,
        reg_address_address_line1: record['RegAddress.AddressLine1']?.trim() || null,
        reg_address_address_line2: record['RegAddress.AddressLine2']?.trim() || null,
        reg_address_post_town: record['RegAddress.PostTown']?.trim() || null,
        reg_address_county: record['RegAddress.County']?.trim() || null,
        reg_address_country: record['RegAddress.Country']?.trim() || null,
        reg_address_post_code: record['RegAddress.PostCode']?.trim() || null,
        company_category: record.CompanyCategory?.trim() || null,
        company_status: record.CompanyStatus?.trim() || null,
        country_of_origin: record.CountryOfOrigin?.trim() || null,
        dissolution_date: formatDate(record.DissolutionDate),
        incorporation_date: formatDate(record.IncorporationDate),
        accounts_account_ref_day: parseIntSafe(record['Accounts.AccountRefDay']),
        accounts_account_ref_month: parseIntSafe(record['Accounts.AccountRefMonth']),
        accounts_next_due_date: formatDate(record['Accounts.NextDueDate']),
        accounts_last_made_up_date: formatDate(record['Accounts.LastMadeUpDate']),
        accounts_account_category: record['Accounts.AccountCategory']?.trim() || null,
        returns_next_due_date: formatDate(record['Returns.NextDueDate']),
        returns_last_made_up_date: formatDate(record['Returns.LastMadeUpDate']),
        sic_code_sic_text_1: record['SICCode.SicText_1']?.trim() || null,
        sic_code_sic_text_2: record['SICCode.SicText_2']?.trim() || null,
        sic_code_sic_text_3: record['SICCode.SicText_3']?.trim() || null,
        sic_code_sic_text_4: record['SICCode.SicText_4']?.trim() || null,
        conf_stmt_next_due_date: formatDate(record.ConfStmtNextDueDate),
        conf_stmt_last_made_up_date: formatDate(record.ConfStmtLastMadeUpDate),
        // created_at and updated_at are handled by DB defaults/triggers
      }
      recordsToUpsert.push(transformedRecord)

      if (recordsToUpsert.length >= BATCH_SIZE) {
        console.log(`Upserting batch of ${recordsToUpsert.length} records...`)
        const { error: upsertError } = await supabaseAdminClient
          .from('companies_house_data')
          .upsert(recordsToUpsert, { onConflict: 'company_number' })
        
        if (upsertError) {
          console.error('Error upserting batch:', upsertError)
          // Decide on error strategy: throw and stop, or log and continue?
          // For now, logging and continuing with next batches.
        } else {
          totalUpsertedCount += recordsToUpsert.length
          console.log(`Batch upserted. Total so far: ${totalUpsertedCount}`)
        }
        recordsToUpsert = [] // Reset batch
      }
    }

    // Upsert any remaining records
    if (recordsToUpsert.length > 0) {
      console.log(`Upserting final batch of ${recordsToUpsert.length} records...`)
      const { error: upsertError } = await supabaseAdminClient
        .from('companies_house_data')
        .upsert(recordsToUpsert, { onConflict: 'company_number' })

      if (upsertError) {
        console.error('Error upserting final batch:', upsertError)
      } else {
        totalUpsertedCount += recordsToUpsert.length
         console.log(`Final batch upserted. Grand total: ${totalUpsertedCount}`)
      }
    }

    console.log(`Successfully processed ${totalUpsertedCount} records from ${filePath}.`)
    
    // Optionally, delete the processed file from storage to save space and prevent re-processing
    // const { error: deleteError } = await supabaseAdminClient.storage.from(bucketId).remove([filePath]);
    // if (deleteError) {
    //   console.warn(`Failed to delete processed file ${filePath}:`, deleteError);
    // } else {
    //   console.log(`Successfully deleted processed file ${filePath} from storage.`);
    // }

    return new Response(JSON.stringify({ success: true, message: `Processed ${totalUpsertedCount} records from ${filePath}.` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })

  } catch (error: any) { // Added type: any for the caught error
    console.error('Unhandled error in process-company-csv function:', error)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
}) 