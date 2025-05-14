'use client'; // Good practice for Next.js app router pages, can be removed if no client-side hooks are used

import { useState, useCallback } from 'react';
import Papa from 'papaparse';
import { AlertCircle, CheckCircle, DownloadCloud, UploadCloud, RefreshCw } from 'lucide-react';

// Define the mapping from original CSV headers to target Supabase snake_case headers
const headerMapping: { [key: string]: string } = {
  'CompanyName': 'company_name',
  'CompanyNumber': 'company_number',
  'RegAddress.CareOf': 'reg_address_care_of',
  'RegAddress.POBox': 'reg_address_po_box',
  'RegAddress.AddressLine1': 'reg_address_address_line1',
  'RegAddress.AddressLine2': 'reg_address_address_line2',
  'RegAddress.PostTown': 'reg_address_post_town',
  'RegAddress.County': 'reg_address_county',
  'RegAddress.Country': 'reg_address_country',
  'RegAddress.PostCode': 'reg_address_post_code',
  'CompanyCategory': 'company_category',
  'CompanyStatus': 'company_status',
  'CountryOfOrigin': 'country_of_origin',
  'DissolutionDate': 'dissolution_date',
  'IncorporationDate': 'incorporation_date',
  'Accounts.AccountRefDay': 'accounts_account_ref_day',
  'Accounts.AccountRefMonth': 'accounts_account_ref_month',
  'Accounts.NextDueDate': 'accounts_next_due_date',
  'Accounts.LastMadeUpDate': 'accounts_last_made_up_date',
  'Accounts.AccountCategory': 'accounts_account_category',
  'Returns.NextDueDate': 'returns_next_due_date',
  'Returns.LastMadeUpDate': 'returns_last_made_up_date',
  'Mortgages.NumMortCharges': 'mortgages_num_mort_charges',
  'Mortgages.NumMortOutstanding': 'mortgages_num_mort_outstanding',
  'Mortgages.NumMortPartSatisfied': 'mortgages_num_mort_part_satisfied',
  'Mortgages.NumMortSatisfied': 'mortgages_num_mort_satisfied',
  'SICCode.SicText_1': 'sic_code_sic_text_1',
  'SICCode.SicText_2': 'sic_code_sic_text_2',
  'SICCode.SicText_3': 'sic_code_sic_text_3',
  'SICCode.SicText_4': 'sic_code_sic_text_4',
  'LimitedPartnerships.NumGenPartners': 'limited_partnerships_num_gen_partners',
  'LimitedPartnerships.NumLimPartners': 'limited_partnerships_num_lim_partners',
  'URI': 'uri',
  'PreviousName_1.CONDATE': 'previous_name_1_condate',
  'PreviousName_1.CompanyName': 'previous_name_1_company_name',
  'PreviousName_2.CONDATE': 'previous_name_2_condate',
  'PreviousName_2.CompanyName': 'previous_name_2_company_name',
  'PreviousName_3.CONDATE': 'previous_name_3_condate',
  'PreviousName_3.CompanyName': 'previous_name_3_company_name',
  'PreviousName_4.CONDATE': 'previous_name_4_condate',
  'PreviousName_4.CompanyName': 'previous_name_4_company_name',
  'PreviousName_5.CONDATE': 'previous_name_5_condate',
  'PreviousName_5.CompanyName': 'previous_name_5_company_name',
  'PreviousName_6.CONDATE': 'previous_name_6_condate',
  'PreviousName_6.CompanyName': 'previous_name_6_company_name',
  'PreviousName_7.CONDATE': 'previous_name_7_condate',
  'PreviousName_7.CompanyName': 'previous_name_7_company_name',
  'PreviousName_8.CONDATE': 'previous_name_8_condate',
  'PreviousName_8.CompanyName': 'previous_name_8_company_name',
  'PreviousName_9.CONDATE': 'previous_name_9_condate',
  'PreviousName_9.CompanyName': 'previous_name_9_company_name',
  'PreviousName_10.CONDATE': 'previous_name_10_condate',
  'PreviousName_10.CompanyName': 'previous_name_10_company_name',
  'ConfStmtNextDueDate': 'conf_stmt_next_due_date',
  'ConfStmtLastMadeUpDate': 'conf_stmt_last_made_up_date',
  // Add any other exact original header to snake_case mappings here
};

// Define target Supabase column types to guide cleaning
const supabaseColumnTypes: { [key: string]: 'date' | 'integer' | 'text' } = {
  company_name: 'text',
  company_number: 'text',
  reg_address_care_of: 'text',
  reg_address_po_box: 'text',
  reg_address_address_line1: 'text',
  reg_address_address_line2: 'text',
  reg_address_post_town: 'text',
  reg_address_county: 'text',
  reg_address_country: 'text',
  reg_address_post_code: 'text',
  company_category: 'text',
  company_status: 'text',
  country_of_origin: 'text',
  dissolution_date: 'text', // Kept as TEXT, but will try to format to YYYY-MM-DD
  incorporation_date: 'date',
  accounts_account_ref_day: 'text', // Kept as TEXT, will aim for numeric string
  accounts_account_ref_month: 'integer',
  accounts_next_due_date: 'date',
  accounts_last_made_up_date: 'date',
  accounts_account_category: 'text',
  returns_next_due_date: 'date',
  returns_last_made_up_date: 'date',
  sic_code_sic_text_1: 'text',
  sic_code_sic_text_2: 'text',
  sic_code_sic_text_3: 'text',
  sic_code_sic_text_4: 'text',
  conf_stmt_next_due_date: 'date',
  conf_stmt_last_made_up_date: 'date',
  mortgages_num_mort_charges: 'text', // Kept as TEXT, will aim for numeric string
  mortgages_num_mort_outstanding: 'text',
  mortgages_num_mort_part_satisfied: 'text',
  mortgages_num_mort_satisfied: 'text',
  limited_partnerships_num_gen_partners: 'text',
  limited_partnerships_num_lim_partners: 'text',
  uri: 'text',
  previous_name_1_condate: 'text', // Kept as TEXT, but will try to format to YYYY-MM-DD
  previous_name_1_company_name: 'text',
  // ... add all previous_name fields as text
  // (Script will auto-add them based on headerMapping if not explicitly here)
};

// Define a set of known non-date text values found in date columns (uppercase for comparison)
const NON_DATE_TEXT_VALUES = new Set([
  'NO ACCOUNTS FILED',
  'FULL',
  'UNITED KINGDOM', // Although likely a misalignment issue, we'll clean it here if it appears
  'DORMANT',
  'TOTAL EXEMPTION FULL',
  'GROUP',
  'ACCOUNTS TYPE NOT AVAILABLE',
  'SMALL',
  // Add any other specific known text strings here if needed
]);

// Helper function to format DD/MM/YYYY to YYYY-MM-DD
const formatDateToYYYYMMDD = (dateStr: string): string => {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const [day, month, year] = parts;
    if (day.length === 2 && month.length === 2 && year.length === 4 && !isNaN(parseInt(day)) && !isNaN(parseInt(month)) && !isNaN(parseInt(year))) {
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }
  return ''; // Return empty if not a valid DD/MM/YYYY
};

export default function AdminDataPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [cleanedData, setCleanedData] = useState<string | null>(null);
  const [originalHeaders, setOriginalHeaders] = useState<string[]>([]);
  const [cleanedHeaders, setCleanedHeaders] = useState<string[]>([]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
      setSuccessMessage(null);
      setCleanedData(null);
      setOriginalHeaders([]);
      setCleanedHeaders([]);
    } else {
      setSelectedFile(null);
    }
  };

  const cleanValue = useCallback((value: string | number | null | undefined, targetHeader: string): string => {
    const strValue = String(value === null || value === undefined ? '' : value).trim();
    const targetType = supabaseColumnTypes[targetHeader];

    if (targetType === 'date') {
      const upperCaseValue = strValue.toUpperCase();
      // Check if the value is empty or one of the known non-date text strings
      if (upperCaseValue === '' || NON_DATE_TEXT_VALUES.has(upperCaseValue)) {
        return ''; // Replace known non-date text or empty strings with empty string -> NULL
      }
      // Attempt formatting for actual dates
      const formatted = formatDateToYYYYMMDD(strValue);
      // Return formatted (YYYY-MM-DD) if successful, OTHERWISE return original value
      return formatted || strValue; 
    }

    if (targetType === 'integer') {
      if (strValue === '' || isNaN(parseInt(strValue))) {
        const dateParts = strValue.split('/');
        if (dateParts.length === 3 && !isNaN(parseInt(dateParts[1]))) {
          return String(parseInt(dateParts[1]));
        }
        return '';
      }
      return String(parseInt(strValue));
    }

    // For TEXT columns that have semantic meaning or need specific cleaning
    if (targetHeader === 'dissolution_date' || targetHeader.includes('_condate')) {
        if (strValue.toUpperCase() === 'NO ACCOUNTS FILED' || strValue === '' ) return '';
        return formatDateToYYYYMMDD(strValue) || strValue; // Keep original if not formattable to YYYY-MM-DD
    }
    if (targetHeader === 'accounts_account_ref_day') {
        const dateParts = strValue.split('/');
        if (dateParts.length === 3 && !isNaN(parseInt(dateParts[0]))) {
          return String(parseInt(dateParts[0])); // Day part if DD/MM/YYYY was in this field
        }
        if (strValue === '' || isNaN(parseInt(strValue))) return '';
        return String(parseInt(strValue));
    }
    if (targetHeader.startsWith('mortgages_num_') || targetHeader.startsWith('limited_partnerships_num_')) {
        if (strValue === '' || isNaN(parseFloat(strValue))) return ''; // Allow float then parse to int for safety
        return String(parseInt(String(parseFloat(strValue))));
    }
    
    // Default for other TEXT columns or unmapped ones: just trim.
    return strValue;
  }, []);


  const handleCleanCSV = useCallback(() => {
    if (!selectedFile) {
      setError('Please select a CSV file to clean.');
      return;
    }

    setProcessing(true);
    setError(null);
    setSuccessMessage(null);
    setCleanedData(null);

    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: 'greedy',
      dynamicTyping: false, // Process all as strings initially
      complete: (results) => {
        if (results.errors.length > 0) {
          console.error('Parsing errors:', results.errors);
          setError(`Error parsing CSV: ${results.errors.map(e => e.message).join(', ')}`);
          setProcessing(false);
          return;
        }

        const originalCsvHeaders = results.meta.fields || [];
        setOriginalHeaders(originalCsvHeaders);

        // Filter out known junk headers from the original list before mapping
        const validOriginalHeaders = originalCsvHeaders.filter(h => h && h.trim() !== '' && h.trim() !== '_1' && !h.startsWith('Unnamed:'));
        
        const newHeaders = validOriginalHeaders.map(originalHeader => headerMapping[originalHeader] || originalHeader.toLowerCase().replace(/\W+/g, '_'));
        setCleanedHeaders(newHeaders);

        const cleanedRows: string[][] = [];
        cleanedRows.push(newHeaders);

        const seenCompanyNumbers = new Set<string>();
        const companyNumberCleanedHeader = 'company_number';
        const companyStatusCleanedHeader = 'company_status';
        const companyNumberIndex = newHeaders.indexOf(companyNumberCleanedHeader);
        const companyStatusIndex = newHeaders.indexOf(companyStatusCleanedHeader);

        if (companyNumberIndex === -1) {
            console.warn("`company_number` column not found in cleaned headers. De-duplication by company number will be skipped.");
        }
        if (companyStatusIndex === -1) {
            console.warn("`company_status` column not found in cleaned headers. Filtering by status will be skipped.");
        }

        (results.data as Record<string, unknown>[]).forEach(row => {
          const newRow: string[] = [];
          let hasMeaningfulData = false;
          let currentCompanyNumber = '';
          let currentCompanyStatus = '';

          for (let i = 0; i < validOriginalHeaders.length; i++) {
            const originalHeader = validOriginalHeaders[i];
            const targetHeader = newHeaders[i];
            const cleanedVal = cleanValue(row[originalHeader] as string | number | null | undefined, targetHeader);
            newRow.push(cleanedVal);
            if (cleanedVal !== '') hasMeaningfulData = true;
            if (targetHeader === companyNumberCleanedHeader) {
              currentCompanyNumber = cleanedVal;
            }
            if (targetHeader === companyStatusCleanedHeader) {
              currentCompanyStatus = cleanedVal;
            }
          }
          
          if (hasMeaningfulData && newRow.length === newHeaders.length) {
            // <-- Start: Filter by Company Status -->
            if (companyStatusIndex !== -1 && currentCompanyStatus.toLowerCase() === 'liquidation') {
              // Skip this row if status is Liquidation
              // console.log(`Skipping row due to Liquidation status: ${currentCompanyNumber}`);
              return; // Use return inside forEach to skip to next iteration
            }
            // <-- End: Filter by Company Status -->

            // <-- De-duplication logic (remains the same) -->
            if (companyNumberIndex !== -1 && currentCompanyNumber) {
              if (!seenCompanyNumbers.has(currentCompanyNumber)) {
                seenCompanyNumbers.add(currentCompanyNumber);
                cleanedRows.push(newRow);
              } else {
                // Optionally log skipped duplicate company number
                // console.log(`Skipping duplicate company number: ${currentCompanyNumber}`);
              }
            } else {
              // If no company_number column or no value, add row (or decide on other behavior)
              cleanedRows.push(newRow);
            }
          }
        });
        
        if (cleanedRows.length <= 1) {
            setError('No valid data found after cleaning/filtering, or all rows were duplicates/filtered. Check CSV content and header mapping.');
            setProcessing(false);
            return;
        }

        const cleanedCsvString = Papa.unparse(cleanedRows, { header: false }); // Papa.unparse expects array of arrays, headers already added
        setCleanedData(cleanedCsvString);
        setSuccessMessage(`CSV cleaned successfully! ${cleanedRows.length -1} data rows processed (duplicates and 'Liquidation' status removed). Ready for download.`);
        setProcessing(false);
      },
      error: (error: Error) => {
        console.error('Papa Parse error:', error);
        setError(`Failed to parse CSV: ${error.message}`);
        setProcessing(false);
      },
    });
  }, [selectedFile, cleanValue]);

  const handleDownloadCleanedCSV = () => {
    if (!cleanedData || !selectedFile) return;
    const blob = new Blob([cleanedData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `cleaned_deduplicated_${selectedFile.name}`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setSuccessMessage('Cleaned and de-duplicated CSV downloaded. You can now upload it to Supabase.');
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-800">Companies House CSV Cleaner</h1>
        <p className="text-gray-600 mt-1">
          Upload your Companies House CSV (original format). This tool will clean it, remove duplicates by Company Number, and prepare it for Supabase.
          You can then download the cleaned CSV and manually upload it to your Supabase table.
        </p>
      </div>

      <div className="bg-white shadow rounded-lg p-6 md:p-8 border border-gray-200">
        <div className="max-w-2xl mx-auto">
          
          <div className="mb-6">
            <label htmlFor="csv-upload-input" className="block text-sm font-medium text-gray-700 mb-1">
              Select Original CSV File
            </label>
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
              <div className="space-y-1 text-center">
                <UploadCloud className="mx-auto h-12 w-12 text-gray-400" />
                <div className="flex text-sm text-gray-600">
                  <label
                    htmlFor="csv-upload-input"
                    className="relative cursor-pointer bg-white rounded-md font-medium text-primary hover:text-primary-dark focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-primary"
                  >
                    <span>Upload a file</span>
                    <input id="csv-upload-input" name="csv-upload-input" type="file" className="sr-only" onChange={handleFileChange} accept=".csv" />
                  </label>
                  <p className="pl-1">or drag and drop</p>
                </div>
                <p className="text-xs text-gray-500">Companies House CSV chunk</p>
              </div>
            </div>
            {selectedFile && (
              <p className="mt-2 text-sm text-gray-600">
                Selected file: <span className="font-medium">{selectedFile.name}</span> ({Math.round(selectedFile.size / 1024 / 1024)} MB)
              </p>
            )}
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 text-red-700 border border-red-300 rounded-md flex items-center">
              <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-4 bg-green-50 text-green-700 border border-green-300 rounded-md flex items-center">
              <CheckCircle className="h-5 w-5 mr-2 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}
          
          <div className="space-y-4">
            <button
              type="button"
              onClick={handleCleanCSV}
              disabled={!selectedFile || processing}
              className="w-full flex items-center justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {processing ? 
                <><RefreshCw className="animate-spin h-5 w-5 mr-2" />Processing...</> :
                'Clean Selected CSV File'
              }
            </button>

            {cleanedData && (
              <button
                type="button"
                onClick={handleDownloadCleanedCSV}
                disabled={processing}
                className="w-full flex items-center justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                <DownloadCloud className="h-5 w-5 mr-2" />
                Download Cleaned CSV
              </button>
            )}
          </div>

          {(originalHeaders.length > 0 || cleanedHeaders.length > 0) && (
            <div className="mt-8 pt-6 border-t border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Header Transformation Preview:</h3>
              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-3 py-2 text-left font-semibold text-gray-600">Original CSV Header</th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-600">Cleaned (Target) Header</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {originalHeaders.map((origHeader, index) => {
                            const targetHeader = headerMapping[origHeader] || origHeader.toLowerCase().replace(/\W+/g, '_');
                            const isJunk = !origHeader || origHeader.trim() === '' || origHeader.trim() === '_1' || origHeader.startsWith('Unnamed:');
                            if (isJunk) return null; // Don't show junk headers in preview
                            return (
                                <tr key={index}>
                                    <td className="px-3 py-2 whitespace-nowrap">{origHeader}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">{targetHeader}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 