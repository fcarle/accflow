'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import { Plus, Building2, Mail, Phone, Calendar, LayoutGrid, List, Search, RefreshCw, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/lib/supabase';
import { Dialog as UploadDialog, DialogContent as UploadDialogContent, DialogHeader as UploadDialogHeader, DialogTitle as UploadDialogTitle, DialogTrigger as UploadDialogTrigger } from '@/components/ui/dialog';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Papa from 'papaparse'; // Added papaparse import

// Helper function to generate a UUID v4
function generateUUID() { // Public Domain/MIT
    let d = new Date().getTime();//Timestamp
    let d2 = ((typeof performance !== 'undefined') && performance.now && (performance.now()*1000)) || 0;//Time in microseconds since page-load or 0 if unsupported
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        let r = Math.random() * 16;//random number between 0 and 16
        if(d > 0){//Use timestamp until depleted
            r = (d + r)%16 | 0;
            d = Math.floor(d/16);
        } else {//Use microseconds since page-load if supported
            r = (d2 + r)%16 | 0;
            d2 = Math.floor(d2/16);
        }
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

// Simplified interface for Companies House data we expect back
interface CompanyHouseData {
  company_name: string | null;
  company_number: string; // PK
  reg_address_address_line1: string | null;
  reg_address_address_line2: string | null;
  reg_address_post_town: string | null;
  reg_address_county: string | null;
  reg_address_post_code: string | null;
  company_category: string | null;
  company_status: string | null;
  incorporation_date: string | null; // YYYY-MM-DD
  sic_code_sic_text_1: string | null;
  accounts_next_due_date: string | null;
  conf_stmt_next_due_date: string | null;
}

// New interface for the direct Companies House API response
interface CompaniesHouseApiResponse {
  company_name: string;
  company_number: string;
  registered_office_address: {
    address_line_1?: string;
    address_line_2?: string;
    locality?: string; // Often used for Post Town
    region?: string; // Often used for County
    postal_code?: string;
  };
  company_status: string;
  date_of_creation?: string; // Typically YYYY-MM-DD for incorporation_date
  sic_codes?: string[]; // SIC codes can be an array
  accounts?: {
    next_due?: string; // YYYY-MM-DD
  };
  confirmation_statement?: {
    next_due?: string; // YYYY-MM-DD
  };
  // Add other fields as needed from the CH API
}

// Interface for the error structure that might be relayed from Companies House API
interface CompaniesHouseError {
  error: {
    message?: string;
    type?: string;
    error?: string; // Nested error string, e.g., "company profile not found"
  } | string; // The top-level error property could also be a simple string
}

// Type guard to check if the API response is a CompaniesHouseError
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isCompaniesHouseError(response: any): response is CompaniesHouseError {
  return response && (typeof response.error === 'object' || typeof response.error === 'string');
}

// Define AlertTemplate interface (similar to the one in create-alert-from-task.ts)
interface AlertTemplate {
  alert_type: string;
  message_template: string;
  default_days_before_due?: number;
  // Add other fields if your alert_templates table has more that are used here
}

// Define ClientTask interface (can be shared if moved to a types file)
interface ClientTask {
  id: string;
  client_id: string;
  stage: string;
  // Add other fields if needed for logic, e.g., updated_at for 'most recent'
}

// Workflow stages from TasksPage - ideally this should be in a shared constants file
const workflowStages = [
  'New Request / To Do',
  'Information Gathering / Waiting on Client',
  'In Progress',
  'Internal Review',
  'Pending Client Approval',
  'Ready to File / Submit',
  'Completed / Filed',
  'On Hold / Blocked',
];

interface Client {
  // Basic Info
  id: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientRole: string | null;
  preferredContactMethod: 'email' | 'sms' | 'whatsapp' | 'phone';
  
  // Company Details
  companyName: string;
  companyNumber: string;
  companyAddress: string;
  sicCode: string;
  companyStatus: 'active' | 'dormant' | 'dissolved';
  incorporationDate: string;
  
  // Key Dates
  yearEndDate: string;
  nextAccountsDue: string;
  nextConfirmationStatementDue: string;
  vatFilingFrequency: 'monthly' | 'quarterly' | 'annually';
  nextVatDue: string;
  payrollDeadlines: string[];
  corporationTaxDeadline: string;
  
  // Services & Engagement
  services: string[];
  engagementLetterStatus: 'signed' | 'pending' | 'not_sent';
  
  // Task & Documents
  requiredDocuments: {
    bankStatements: boolean;
    receipts: boolean;
    payrollSummaries: boolean;
  };
  derivedTaskStatus?: string; // New field for the computed status
  recentFiles: string[];
  lastInteractionNotes: string;
  
  // Automations
  customAlerts: {
    missedReminders: boolean;
    documentOverdue: boolean;
  };
  automatedEmails: boolean;
  
  // Financial Summary
  lastYearTurnover: number;
  profitLoss: number;
  taxOwed: number;
  shareableLinkToken?: string;
  
  // Notes & History
  notes: string;
  meetingLog: string[];
  emailHistory: string[];
  originalTaskStatus: 'waiting' | 'in_progress' | 'completed'; // Keep original taskStatus if needed for other logic, or remove if fully replaced
}

type FormData = Omit<Client, 'id' | 'derivedTaskStatus' | 'originalTaskStatus'> & { taskStatus: Client['originalTaskStatus'] };

const initialClientFormData: FormData = {
  // Basic Info
  clientName: '',
  clientEmail: '',
  clientPhone: '',
  clientRole: null,
  preferredContactMethod: 'email',
  // Company Details
  companyName: '',
  companyNumber: '',
  companyAddress: '',
  sicCode: '',
  companyStatus: 'active',
  incorporationDate: '',
  // Key Dates
  yearEndDate: '',
  nextAccountsDue: '',
  nextConfirmationStatementDue: '',
  vatFilingFrequency: 'quarterly',
  nextVatDue: '',
  payrollDeadlines: [],
  corporationTaxDeadline: '',
  // Services & Engagement
  services: [],
  engagementLetterStatus: 'not_sent',
  // Task & Documents
  requiredDocuments: {
    bankStatements: false,
    receipts: false,
    payrollSummaries: false,
  },
  taskStatus: 'waiting', // This refers to the original taskStatus field
  recentFiles: [],
  lastInteractionNotes: '',
  // Automations
  customAlerts: {
    missedReminders: false,
    documentOverdue: false,
  },
  automatedEmails: true,
  // Financial Summary
  lastYearTurnover: 0,
  profitLoss: 0,
  taxOwed: 0,
  // Notes & History
  notes: '',
  meetingLog: [],
  emailHistory: [],
  shareableLinkToken: '',
};

// Helper function to determine client status based on tasks
const getClientTaskStatus = (clientId: string, allTasks: ClientTask[]): string => {
  const clientTasks = allTasks.filter(task => task.client_id === clientId);
  
  if (clientTasks.length === 0) {
    return "No Active Tasks"; // Or "Up to Date"
  }

  const activeTasks = clientTasks.filter(
    task => !['Completed / Filed', 'On Hold / Blocked'].includes(task.stage)
  );

  if (activeTasks.length === 0) {
    return "Up to Date"; // All tasks are completed or on hold
  }

  // Find the task with the earliest stage among active tasks
  activeTasks.sort((a, b) => {
    const indexA = workflowStages.indexOf(a.stage);
    const indexB = workflowStages.indexOf(b.stage);
    // If a stage isn't in workflowStages, treat it as later
    return (indexA === -1 ? Infinity : indexA) - (indexB === -1 ? Infinity : indexB);
  });

  return activeTasks[0].stage;
};

// RawClientFromDB interface for data directly from Supabase 'clients' table
interface RawClientFromDB {
  id: string;
  client_name?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
  client_role?: string | null;
  preferred_contact_method?: 'email' | 'sms' | 'whatsapp' | 'phone' | null;
  company_name?: string | null;
  company_number?: string | null;
  registered_office_address?: string | null;
  sic_code?: string | null;
  company_status?: 'active' | 'dormant' | 'dissolved' | null;
  incorporation_date?: string | null;
  year_end_date?: string | null;
  next_accounts_due?: string | null;
  next_confirmation_statement_due?: string | null;
  vat_filing_frequency?: 'monthly' | 'quarterly' | 'annually' | null;
  next_vat_due?: string | null;
  payroll_deadlines?: string[] | null;
  corporation_tax_deadline?: string | null;
  services?: string[] | null;
  engagement_letter_signed?: boolean | null;
  required_documents?: string | { bankStatements: boolean; receipts: boolean; payrollSummaries: boolean; } | null;
  task_status?: 'waiting' | 'in_progress' | 'completed' | null;
  recent_files?: string | string[] | null;
  last_interaction_notes?: string | null;
  custom_alerts?: string | { missedReminders: boolean; documentOverdue: boolean; } | null;
  automated_emails?: boolean | null;
  last_year_turnover?: number | null;
  profit_loss?: number | null;
  tax_owed?: number | null;
  shareable_link_token?: string | null;
  notes?: string | null;
  meeting_log?: string[] | null;
  email_history?: string[] | null;
}

// NEW FUNCTION: mapClientData
const mapClientData = (clientsData: RawClientFromDB[], tasksData: ClientTask[]): Client[] => {
  return (clientsData || []).map((client: RawClientFromDB) => {
    let parsedRequiredDocuments = { bankStatements: false, receipts: false, payrollSummaries: false };
    try {
      const rawDocs = client.required_documents;
      if (rawDocs && typeof rawDocs === 'string') {
        const parsed = JSON.parse(rawDocs);
        parsedRequiredDocuments = {
            bankStatements: !!parsed.bankStatements,
            receipts: !!parsed.receipts,
            payrollSummaries: !!parsed.payrollSummaries,
        };
      } else if (rawDocs && typeof rawDocs === 'object') { // Ensure not null if object
        parsedRequiredDocuments = {
            bankStatements: !!(rawDocs as { bankStatements?: boolean }).bankStatements,
            receipts: !!(rawDocs as { receipts?: boolean }).receipts,
            payrollSummaries: !!(rawDocs as { payrollSummaries?: boolean }).payrollSummaries,
        };
      }
    } catch (e) { console.error("Failed to parse required_documents", e); /* stays default */ }

    let parsedCustomAlerts = { missedReminders: false, documentOverdue: false };
    try {
      const rawAlerts = client.custom_alerts;
      if (rawAlerts && typeof rawAlerts === 'string') {
        const parsed = JSON.parse(rawAlerts);
        parsedCustomAlerts = {
            missedReminders: !!parsed.missedReminders,
            documentOverdue: !!parsed.documentOverdue,
        };
      } else if (rawAlerts && typeof rawAlerts === 'object') { // Ensure not null if object
        parsedCustomAlerts = {
            missedReminders: !!(rawAlerts as { missedReminders?: boolean }).missedReminders,
            documentOverdue: !!(rawAlerts as { documentOverdue?: boolean }).documentOverdue,
        };
      }
    } catch (e) { console.error("Failed to parse custom_alerts", e); /* stays default */ }

    return {
      id: client.id,
      clientName: client.client_name || '',
      clientEmail: client.client_email || '',
      clientPhone: client.client_phone || '',
      clientRole: client.client_role || null,
      preferredContactMethod: client.preferred_contact_method || 'email',
      companyName: client.company_name || '',
      companyNumber: client.company_number || '',
      companyAddress: client.registered_office_address || '',
      sicCode: client.sic_code || '',
      companyStatus: (client.company_status as Client['companyStatus']) || 'active',
      incorporationDate: client.incorporation_date || '',
      yearEndDate: client.year_end_date || '',
      nextAccountsDue: client.next_accounts_due || '',
      nextConfirmationStatementDue: client.next_confirmation_statement_due || '',
      vatFilingFrequency: (client.vat_filing_frequency as Client['vatFilingFrequency']) || 'quarterly',
      nextVatDue: client.next_vat_due || '',
      payrollDeadlines: client.payroll_deadlines || [],
      corporationTaxDeadline: client.corporation_tax_deadline || '',
      services: client.services || [],
      engagementLetterStatus: client.engagement_letter_signed === null || client.engagement_letter_signed === undefined ? 'not_sent' : (client.engagement_letter_signed ? 'signed' : 'not_sent'),
      requiredDocuments: parsedRequiredDocuments,
      originalTaskStatus: client.task_status || 'waiting',
      derivedTaskStatus: getClientTaskStatus(client.id, tasksData || []),
      recentFiles: client.recent_files ? (typeof client.recent_files === 'string' ? JSON.parse(client.recent_files) : client.recent_files) : [],
      lastInteractionNotes: client.last_interaction_notes || '',
      customAlerts: parsedCustomAlerts,
      automatedEmails: client.automated_emails ?? true, // Handle null/undefined, default to true
      lastYearTurnover: client.last_year_turnover || 0,
      profitLoss: client.profit_loss || 0,
      taxOwed: client.tax_owed || 0,
      shareableLinkToken: client.shareable_link_token || '',
      notes: client.notes || '',
      meetingLog: client.meeting_log || [],
      emailHistory: client.email_history || [],
    };
  });
};

// Define the alert types we'll use for auto-creation
const AUTO_ALERT_TYPES = {
  NEXT_ACCOUNTS_DUE: 'NEXT_ACCOUNTS_DUE',
  NEXT_CONFIRMATION_STATEMENT_DUE: 'NEXT_CONFIRMATION_STATEMENT_DUE',
  NEXT_VAT_DUE: 'NEXT_VAT_DUE',
  CORPORATION_TAX_DEADLINE: 'CORPORATION_TAX_DEADLINE',
};

// --- Helper Function to Create Single Alert ---
const createClientAlert = async (clientId: string, alertType: string, dueDate: string | null, templateContent: string) => {
  if (!dueDate) return; // Don't create alert if no due date

  const daysBefore = 30; // Default days before, maybe make configurable later?
  const notificationPreference = 'DRAFT_FOR_TEAM'; // Default preference

  // Replace placeholders in the template
  // Note: We might need more context (like client name) passed into this function or fetched here
  const message = templateContent
      .replace(/{{client_name}}/g, '[Client Name]') // Placeholder replacement needed
      .replace(/{{company_name}}/g, '[Company Name]') // Placeholder replacement needed
      .replace(/{{due_date}}/g, new Date(dueDate).toLocaleDateString()); // Format date

  const { error } = await supabase
      .from('client_alerts')
      .insert({
          client_id: clientId,
          alert_type: alertType,
          days_before_due: daysBefore,
          notification_preference: notificationPreference,
          is_active: true,
          alert_message: message, 
      });

  if (error) {
      console.error(`Error creating alert ${alertType} for client ${clientId}:`, error);
      toast.error(`Failed to create alert for ${alertType.replace(/_/g, ' ')}`);
  } else {
      console.log(`Alert ${alertType} created for client ${clientId}`);
  }
};

// Type for the data selected from companies_house_data
type CompanyDataQueryResult = Pick<
  CompanyHouseData,
  | 'company_name'
  | 'company_status'
  | 'incorporation_date'
  | 'sic_code_sic_text_1'
  | 'reg_address_address_line1'
  | 'reg_address_address_line2'
  | 'reg_address_post_town'
  | 'reg_address_county'
  | 'reg_address_post_code'
  | 'accounts_next_due_date'
  | 'conf_stmt_next_due_date'
>;

const fetchCompanyDetailsByNumber = async (companyNumber: string): Promise<Partial<Client>> => {
  if (!companyNumber) {
    return {};
  }

  // 1. Try fetching from local Supabase table (companies_house_data)
  try {
    const { data: localData, error: localError } = await supabase
      .from('companies_house_data')
      .select(
        'company_name, company_status, incorporation_date, sic_code_sic_text_1, ' +
        'reg_address_address_line1, reg_address_address_line2, reg_address_post_town, ' +
        'reg_address_county, reg_address_post_code, accounts_next_due_date, conf_stmt_next_due_date'
      )
      .eq('company_number', companyNumber)
      .maybeSingle<CompanyDataQueryResult>();

    if (localError) {
      console.error('Error fetching company details from local companies_house_data:', localError);
      // Don't toast error yet, allow fallback to CH API
    }

    if (localData) {
      console.log("Found company in local DB:", localData.company_name);
      toast.info(`Details for ${localData.company_name || companyNumber} found in local cache.`);
      const addressParts = [
        localData.reg_address_address_line1,
        localData.reg_address_address_line2,
        localData.reg_address_post_town,
        localData.reg_address_county,
        localData.reg_address_post_code,
      ].filter(part => part && part.trim() !== '');
      const companyAddress = addressParts.join(', ');

      let mappedStatus: Client['companyStatus'] = 'active';
      if (localData.company_status) {
        const lowerStatus = localData.company_status.toLowerCase();
        if (lowerStatus === 'active' || lowerStatus === 'dormant' || lowerStatus === 'dissolved') {
          mappedStatus = lowerStatus as Client['companyStatus'];
        }
      }

      return {
        companyName: localData.company_name || undefined,
        companyAddress: companyAddress || undefined,
        sicCode: localData.sic_code_sic_text_1 || undefined,
        companyStatus: mappedStatus,
        incorporationDate: localData.incorporation_date || undefined,
        nextAccountsDue: localData.accounts_next_due_date || undefined,
        nextConfirmationStatementDue: localData.conf_stmt_next_due_date || undefined,
      };
    }
  } catch (err: unknown) { // Changed any to unknown
    console.error('Exception fetching company details from local DB:', err);
    // Don't toast error yet, allow fallback to CH API
  }

  // 2. If not found locally, try fetching from Companies House API via our backend proxy
  console.log(`Company ${companyNumber} not found in local DB. Trying Companies House API via proxy.`);
  
  // The API key is now handled by the backend route, so no need for process.env here for the key itself.

  try {
    // Call our internal API route which will then call Companies House
    const response = await fetch(`/api/company-lookup?companyNumber=${companyNumber}`);

    if (!response.ok) {
      let errorData = { message: 'Failed to fetch from proxy' }; // Default error
      try {
        errorData = await response.json(); // Try to parse error from our proxy
      } catch { // Removed unused 'e'
        console.warn('Could not parse JSON error from proxy response');
      }

      if (response.status === 404 || (errorData.message && errorData.message.toLowerCase().includes('not found'))) {
        toast.info(`No details found for company number: ${companyNumber} via Companies House.`);
        return { companyName: "Details not found" };
      }
      console.error('Error fetching from company-lookup proxy:', response.status, errorData);
      toast.error(`Error looking up company ${companyNumber}: ${errorData.message || response.statusText}`);
      return {}; // Or a more specific error object
    }

    const apiData: CompaniesHouseApiResponse | CompaniesHouseError = await response.json();
    
    // Check if apiData itself indicates an error passed through from the CH API via our proxy
    if (isCompaniesHouseError(apiData)) {
        const errorDetails = apiData.error;
        const errorMessage = typeof errorDetails === 'string' ? errorDetails : errorDetails.message;
        const errorType = typeof errorDetails === 'object' ? errorDetails.type : undefined;
        const nestedErrorString = typeof errorDetails === 'object' ? errorDetails.error : undefined;

        console.error('Error from Companies House API (relayed by proxy):', errorDetails);
        toast.error(`Companies House error for ${companyNumber}: ${errorMessage || 'Unknown CH error'}`);
        
        if (errorType === 'ch:service' && nestedErrorString?.toLowerCase().includes('company profile not found')){
             return { companyName: "Details not found" };
        }
        return {};
    }
    // If it's not an error, it should be CompaniesHouseApiResponse, so cast it if necessary or rely on TS inference
    // For direct property access below, TypeScript should infer apiData as CompaniesHouseApiResponse here.

    if (Object.keys(apiData).length === 0) { // Handle if proxy returns empty object on some CH errors
        toast.info(`No details found for company number: ${companyNumber} via Companies House (empty response).`);
        return { companyName: "Details not found" };
    }

    toast.success(`Successfully fetched details for ${apiData.company_name || companyNumber} from Companies House.`);

    const addressParts = [
      apiData.registered_office_address?.address_line_1,
      apiData.registered_office_address?.address_line_2,
      apiData.registered_office_address?.locality,
      apiData.registered_office_address?.region,
      apiData.registered_office_address?.postal_code,
    ].filter(part => part && part.trim() !== '');
    const companyAddress = addressParts.join(', ');

    let mappedStatus: Client['companyStatus'] = 'active';
    if (apiData.company_status) {
      const lowerStatus = apiData.company_status.toLowerCase();
      if (lowerStatus === 'active' || lowerStatus === 'dormant' || lowerStatus === 'dissolved') {
        mappedStatus = lowerStatus as Client['companyStatus'];
      } else if (lowerStatus.includes('dissolved')) { // Handle cases like "dissolved on..."
        mappedStatus = 'dissolved';
      }
    }
    
    // It's good practice to also store this fetched data in your local companies_house_data table
    // to reduce future API calls. This part is not implemented here but is a recommendation.
    // Example: await saveToLocalCache({ ...apiData });

    return {
      companyName: apiData.company_name || undefined,
      companyAddress: companyAddress || undefined,
      sicCode: apiData.sic_codes && apiData.sic_codes.length > 0 ? apiData.sic_codes[0] : undefined, // Taking the first SIC code
      companyStatus: mappedStatus,
      incorporationDate: apiData.date_of_creation || undefined,
      nextAccountsDue: apiData.accounts?.next_due || undefined,
      nextConfirmationStatementDue: apiData.confirmation_statement?.next_due || undefined,
    };

  } catch (err: unknown) { // Changed any to unknown
    console.error('Exception fetching company details from Companies House API:', err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    toast.error(`Exception looking up company ${companyNumber} with Companies House API: ${errorMessage}`);
    return {};
  }
};

export default function ClientsPage() {
  const router = useRouter();
  const [isAddClientOpen, setIsAddClientOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [sortBy, setSortBy] = useState<'name' | 'company' | 'status' | 'nextVat' | 'nextAccounts' | 'yearEnd'>('name');
  const [formData, setFormData] = useState<FormData>(initialClientFormData);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [alertTemplates, setAlertTemplates] = useState<AlertTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modified fetchClients to also get all client_tasks and alert_templates
  const fetchClientsAndTasks = useCallback(async () => {
    setLoading(true); // For overall page load
    setIsLoadingTemplates(true); // Explicitly set for template loading
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        toast.error('User not authenticated.');
        router.push('/login');
        return;
      }

      const { data: clientsData, error: clientsError } = await supabase
        .from('clients')
        .select('*')
        .eq('created_by', user.id) 
        .order('client_name', { ascending: true });

      if (clientsError) throw clientsError;

      const clientIds = (clientsData || []).map(c => c.id);
      let tasksData: ClientTask[] = [];
      if (clientIds.length > 0) {
        const { data: fetchedTasks, error: tasksError } = await supabase
          .from('client_tasks')
          .select('id, client_id, stage')
          .in('client_id', clientIds);
        if (tasksError) throw tasksError;
        tasksData = fetchedTasks || [];
      }
      
      setClients(mapClientData(clientsData || [], tasksData)); // Use mapClientData

      // Fetch alert templates
      const { data: templatesData, error: templatesError } = await supabase
        .from('alert_templates')
        .select('alert_type, message_template:body'); // Updated select statement

      if (templatesError) {
        console.error("Error fetching alert templates:", templatesError);
        toast.error("Failed to load alert templates.");
        setAlertTemplates([]); // Set to empty array on error
      } else {
        setAlertTemplates(templatesData || []);
      }

    } catch (err: unknown) { // Changed any to unknown
      console.error("Error fetching clients and tasks:", err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to load data: ${errorMessage}`);
    } finally {
      setLoading(false); // This is for the overall page load
      setIsLoadingTemplates(false); // Ensure this is called regardless of success/failure of template fetch
    }
  }, [router]); // Removed eslint-disable and router is a valid dependency

  useEffect(() => {
    fetchClientsAndTasks();
  }, [fetchClientsAndTasks]);

  useEffect(() => {
    // ... existing useEffect for alert templates ...
  }, []);

  // Sort clients based on selected sort option
  const sortedClients = [...clients].sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.clientName.localeCompare(b.clientName);
      case 'company':
        return a.companyName.localeCompare(b.companyName);
      case 'status':
        return a.companyStatus.localeCompare(b.companyStatus);
      case 'nextVat':
        return new Date(a.nextVatDue).getTime() - new Date(b.nextVatDue).getTime();
      case 'nextAccounts':
        return new Date(a.nextAccountsDue).getTime() - new Date(b.nextAccountsDue).getTime();
      case 'yearEnd':
        return new Date(a.yearEndDate).getTime() - new Date(b.yearEndDate).getTime();
      default:
        return 0;
    }
  });

  const handleServiceChange = (service: string) => {
    setFormData(prev => ({
      ...prev,
      services: prev.services.includes(service)
        ? prev.services.filter(s => s !== service)
        : [...prev.services, service],
    }));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (name.startsWith('customAlerts.')) {
      const key = name.split('.')[1];
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({
        ...prev,
        customAlerts: { ...prev.customAlerts, [key]: checked }
      }));
    } else if (name === 'automatedEmails') {
      setFormData(prev => ({
        ...prev,
        automatedEmails: (e.target as HTMLInputElement).checked
      }));
    } else if (type === 'checkbox' && name.startsWith('requiredDocuments.')) {
      const key = name.split('.')[1] as keyof FormData['requiredDocuments'];
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({
        ...prev,
        requiredDocuments: { ...prev.requiredDocuments, [key]: checked }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      toast.error('User not authenticated. Please log in again.');
      setLoading(false);
      router.push('/login');
      return;
    }
    
    // Ensure templates are loaded before submitting
    if (isLoadingTemplates) {
        toast.error("Templates are still loading, please wait and try again.");
        setLoading(false);
        return;
    }

    const clientDataToSave = {
      client_name: formData.clientName,
      client_email: formData.clientEmail,
      client_phone: formData.clientPhone,
      client_role: formData.clientRole || null,
      preferred_contact_method: formData.preferredContactMethod,
      company_name: formData.companyName,
      company_number: formData.companyNumber,
      registered_office_address: formData.companyAddress,
      sic_code: formData.sicCode,
      company_status: formData.companyStatus,
      incorporation_date: formData.incorporationDate || null,
      year_end_date: formData.yearEndDate || null,
      next_accounts_due: formData.nextAccountsDue || null,
      next_confirmation_statement_due: formData.nextConfirmationStatementDue || null,
      vat_filing_frequency: formData.vatFilingFrequency,
      next_vat_due: formData.nextVatDue || null,
      payroll_deadlines: formData.payrollDeadlines.filter(line => line.trim() !== ''),
      corporation_tax_deadline: formData.corporationTaxDeadline || null,
      services: formData.services,
      engagement_letter_signed: formData.engagementLetterStatus === 'signed' ? true : (formData.engagementLetterStatus === 'pending' ? null : false),
      required_documents: JSON.stringify(formData.requiredDocuments),
      task_status: formData.taskStatus,
      recent_files: formData.recentFiles,
      last_interaction_notes: formData.lastInteractionNotes,
      custom_alerts: JSON.stringify(formData.customAlerts),
      automated_emails: formData.automatedEmails,
      last_year_turnover: formData.lastYearTurnover || 0,
      profit_loss: formData.profitLoss,
      tax_owed: formData.taxOwed,
      notes: formData.notes,
      shareable_link_token: formData.shareableLinkToken || generateUUID(),
      created_by: user.id,
      updated_by: user.id,
    };

    try {
      // Save client data
      const { data: newClient, error } = await supabase
        .from('clients')
        .insert(clientDataToSave)
        .select()
        .single();

      if (error) throw error;

      toast.success('Client added successfully!');
      setIsAddClientOpen(false);
      
      // --- Auto-create alerts if enabled ---
      if (newClient && formData.automatedEmails) { // Using automatedEmails flag to trigger alerts
          console.log(`Automated emails enabled for ${newClient.client_name}. Creating alerts...`);
          
          const getTemplate = (type: string) => alertTemplates.find(t => t.alert_type === type)?.message_template || alertTemplates.find(t => t.alert_type === 'DEFAULT')?.message_template || '';

          const accountsTemplate = getTemplate(AUTO_ALERT_TYPES.NEXT_ACCOUNTS_DUE);
          if (accountsTemplate) {
              await createClientAlert(newClient.id, AUTO_ALERT_TYPES.NEXT_ACCOUNTS_DUE, newClient.next_accounts_due, accountsTemplate);
          }
          
          const confirmationTemplate = getTemplate(AUTO_ALERT_TYPES.NEXT_CONFIRMATION_STATEMENT_DUE);
          if (confirmationTemplate) {
              await createClientAlert(newClient.id, AUTO_ALERT_TYPES.NEXT_CONFIRMATION_STATEMENT_DUE, newClient.next_confirmation_statement_due, confirmationTemplate);
          }
          
          const vatTemplate = getTemplate(AUTO_ALERT_TYPES.NEXT_VAT_DUE);
          if (vatTemplate) {
              await createClientAlert(newClient.id, AUTO_ALERT_TYPES.NEXT_VAT_DUE, newClient.next_vat_due, vatTemplate);
          }
          
          const taxTemplate = getTemplate(AUTO_ALERT_TYPES.CORPORATION_TAX_DEADLINE);
          if (taxTemplate) {
              await createClientAlert(newClient.id, AUTO_ALERT_TYPES.CORPORATION_TAX_DEADLINE, newClient.corporation_tax_deadline, taxTemplate);
          }
      }
      
      // Refresh client list - MODIFIED
      const { data: updatedClientsData, error: updatedClientsError } = await supabase
        .from('clients')
        .select('*')
        .eq('created_by', user.id) // Added filter by user ID
        .order('created_at', { ascending: false });
      if (updatedClientsError) throw updatedClientsError;
      
      const { data: tasksData, error: tasksError } = await supabase
        .from('client_tasks')
        .select('*'); // Consider if these tasks also need filtering by user or firm
      if (tasksError) throw tasksError;
      
      // USE THE NEW mapClientData function
      setClients(mapClientData(updatedClientsData || [], tasksData || []));

    } catch (error: unknown) { // Changed any to unknown
      console.error('Error saving client:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error(`Error saving client: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type === "text/csv") {
        setCsvFile(file);
        toast.info(`Selected CSV file: ${file.name}`);
      } else {
        toast.error('Please select a CSV file to upload.');
        setCsvFile(null);
      }
    }
  };

  const handleCsvSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvFile) {
      toast.error('Please select a CSV file to upload.');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('User not authenticated. Please log in again.');
      router.push('/login');
      return;
    }

    setLoading(true);

    Papa.parse(csvFile, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data as Array<{ clientName?: string; clientEmail?: string; companyNumber?: string }>;
        let successfulUploads = 0;
        let failedUploads = 0;

        for (const row of rows) {
          if (!row.clientName || !row.clientEmail || !row.companyNumber) {
            toast.error(`Skipping row: Missing required fields (clientName, clientEmail, companyNumber). Row: ${JSON.stringify(row)}`);
            failedUploads++;
            continue;
          }

          try {
            const companyDetails = await fetchCompanyDetailsByNumber(row.companyNumber); // This calls the outer function

            const clientDataToSave = {
              client_name: row.clientName,
              client_email: row.clientEmail,
              company_number: row.companyNumber,
              company_name: companyDetails.companyName,
              registered_office_address: companyDetails.companyAddress,
              sic_code: companyDetails.sicCode,
              company_status: companyDetails.companyStatus as Client['companyStatus'],
              incorporation_date: companyDetails.incorporationDate,
              client_phone: companyDetails.clientPhone || '',
              client_role: companyDetails.clientRole || null,
              preferred_contact_method: (companyDetails.preferredContactMethod || 'email') as Client['preferredContactMethod'],
              year_end_date: companyDetails.yearEndDate || null,
              next_accounts_due: companyDetails.nextAccountsDue || null,
              next_confirmation_statement_due: companyDetails.nextConfirmationStatementDue || null,
              vat_filing_frequency: (companyDetails.vatFilingFrequency || 'quarterly') as Client['vatFilingFrequency'],
              next_vat_due: companyDetails.nextVatDue || null,
              payroll_deadlines: companyDetails.payrollDeadlines || [],
              corporation_tax_deadline: companyDetails.corporationTaxDeadline || null,
              services: companyDetails.services || [],
              engagement_letter_signed: companyDetails.engagementLetterStatus === 'signed' ? true : (companyDetails.engagementLetterStatus === 'pending' ? null : false),
              required_documents: JSON.stringify(companyDetails.requiredDocuments || {}),
              task_status: 'waiting' as Client['originalTaskStatus'],
              recent_files: JSON.stringify(companyDetails.recentFiles || []),
              last_interaction_notes: companyDetails.lastInteractionNotes || '',
              custom_alerts: JSON.stringify(companyDetails.customAlerts || { missedReminders: false, documentOverdue: false }),
              automated_emails: companyDetails.automatedEmails || false,
              last_year_turnover: companyDetails.lastYearTurnover || 0,
              profit_loss: companyDetails.profitLoss || 0,
              tax_owed: companyDetails.taxOwed || 0,
              notes: companyDetails.notes || '',
              shareable_link_token: generateUUID(), // generateUUID is defined outside
              created_by: user.id,
              updated_by: user.id,
            };

            const { error: insertError } = await supabase
              .from('clients')
              .insert(clientDataToSave);

            if (insertError) {
              throw insertError;
            }
            successfulUploads++;
          } catch (error: unknown) { // Changed any to unknown
            failedUploads++;
            console.error('Error processing row:', row, 'Error:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            toast.error(`Failed to upload client ${row.clientName || 'N/A'}: ${errorMessage}`);
          }
        }

        if (successfulUploads > 0) {
          toast.success(`${successfulUploads} client(s) uploaded successfully.`);
        }
        if (failedUploads > 0) {
          toast.warning(`${failedUploads} client(s) failed to upload. Check console for details.`);
        }

        setIsUploadDialogOpen(false);
        setCsvFile(null);
        fetchClientsAndTasks();
        setLoading(false);
      },
      error: (error: Error) => { // Changed any to Error
        toast.error(`Error parsing CSV: ${error.message}`);
        setLoading(false);
      }
    });
  };

  const handleDownloadTemplate = () => {
    const csvContent = 'clientName,clientEmail,companyNumber\n'; // Corrected template
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'client_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClientClick = (clientId: string) => {
    router.push(`/dashboard/clients/${clientId}`);
  };

  // Helper function to handle navigation for creating a task
  const handleCreateTaskForClient = (clientId: string) => {
    router.push(`/dashboard/tasks?clientId=${clientId}`);
  };

  const handleAutoFillFromCompanyNumber = useCallback(async () => {
    const companyNumberToLookup = formData.companyNumber?.trim();
    if (!companyNumberToLookup) {
      toast.warning('Please enter a Company Number first.');
      return;
    }

    setIsAutoFilling(true);
    const toastId = toast.loading(`Looking up company: ${companyNumberToLookup}...`);

    try {
      const companyData = await fetchCompanyDetailsByNumber(companyNumberToLookup);

      if (companyData && Object.keys(companyData).length > 0 && companyData.companyName !== "Details not found") {
        setFormData(prev => ({
          ...prev,
          companyName: companyData.companyName || prev.companyName,
          companyAddress: companyData.companyAddress || prev.companyAddress,
          sicCode: companyData.sicCode || prev.sicCode,
          companyStatus: companyData.companyStatus || prev.companyStatus,
          incorporationDate: companyData.incorporationDate || prev.incorporationDate,
          nextAccountsDue: companyData.nextAccountsDue || prev.nextAccountsDue,
          nextConfirmationStatementDue: companyData.nextConfirmationStatementDue || prev.nextConfirmationStatementDue,
          // Do not overwrite clientName or clientEmail as they are not part of CH data
        }));
        toast.success(`Company details for ${companyData.companyName || companyNumberToLookup} auto-filled!`, { id: toastId });
      } else if (companyData.companyName === "Details not found"){
        // fetchCompanyDetailsByNumber already shows an info toast "No details found..."
        // We can dismiss the loading toast here or let the info toast from the function handle it.
        // For clarity, we might update the toast message specifically.
        toast.dismiss(toastId); // Dismiss loading as info/error is handled by fetcher
      } else {
        // This case might occur if companyData is {} or some other error handled inside fetchCompanyDetailsByNumber
        // fetchCompanyDetailsByNumber should have already shown an error toast in such cases.
        // We might just dismiss the loading toast if it wasn't replaced.
        toast.dismiss(toastId); // Dismiss if no specific error/info toast was shown by the function for this case
      }
    } catch (err: unknown) { // Changed any to unknown
      // This catch is for unexpected errors during the process here, 
      // not for errors during the fetch itself as fetchCompanyDetailsByNumber has its own try/catch.
      console.error("Error in handleAutoFillFromCompanyNumber logic:", err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to auto-fill company details: ${errorMessage}`, { id: toastId });
    }
    setIsAutoFilling(false);
  }, [formData.companyNumber, setFormData, setIsAutoFilling]);

  // Updated List View Rendering
  const renderListItem = (client: Client) => (
    <tr key={client.id} className="hover:bg-gray-50">
      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 sm:px-6">
        <a onClick={() => handleClientClick(client.id)} className="cursor-pointer hover:underline text-primary">
          {client.clientName}
        </a>
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 sm:px-6 truncate" title={client.companyName}>{client.companyName}</td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 sm:px-6">
        <div className="flex flex-col items-start">
            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full truncate mb-1 
                ${client.derivedTaskStatus === 'Up to Date' || client.derivedTaskStatus === 'No Active Tasks' ? 'bg-green-100 text-green-800' : 
                  ['Completed / Filed', 'On Hold / Blocked'].includes(client.derivedTaskStatus || '') ? 'bg-gray-100 text-gray-800' :
                  'bg-blue-100 text-blue-800' // Default for other active task stages
                }`}
                 title={client.derivedTaskStatus}
            >
                {client.derivedTaskStatus || 'N/A'}
            </span>
            {(client.derivedTaskStatus === "No Active Tasks" || client.derivedTaskStatus === "Up to Date") && (
              <Button 
                variant="link"
                size="sm"
                className="p-0 h-auto text-xs text-primary hover:underline"
                onClick={(e) => { 
                  e.stopPropagation();
                  handleCreateTaskForClient(client.id); 
                }}
              >
                <Plus className="h-3 w-3 mr-1" /> Create Task
              </Button>
            )}
        </div>
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 sm:px-6 truncate" title={client.clientEmail}>{client.clientEmail}</td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 sm:px-6 truncate" title={client.clientPhone}>{client.clientPhone}</td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 sm:px-6">
        {client.nextVatDue ? new Date(client.nextVatDue).toLocaleDateString() : 'N/A'}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 sm:px-6">
        {client.nextAccountsDue ? new Date(client.nextAccountsDue).toLocaleDateString() : 'N/A'}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 sm:px-6">
        {client.yearEndDate ? new Date(client.yearEndDate).toLocaleDateString() : 'N/A'}
      </td>
    </tr>
  );

  return (
    <div className="px-4 py-6 md:p-8 max-w-7xl mx-auto">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#1a365d] tracking-tight">Clients</h1>
          <p className="text-gray-500 mt-1">Manage your client relationships and information</p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={() => setIsUploadDialogOpen(true)}
            variant="outline"
            className="hover:bg-gray-50 transition-colors border-gray-200"
          >
            <Upload className="h-4 w-4 mr-2" />
            Import CSV
          </Button>
          <Button
            onClick={() => setIsAddClientOpen(true)}
            className="bg-primary hover:bg-primary/90 text-white transition-all duration-200"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Client
          </Button>
        </div>
      </div>

      {/* Search & Filter Section */}
      <div className="mb-6 p-5 bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">
          <div className="relative flex-grow">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search clients..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-10 border-gray-200 rounded-md w-full focus-visible:ring-primary"
            />
          </div>
          
          <Button 
            variant="outline" 
            className="flex items-center justify-center h-10 border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
            onClick={fetchClientsAndTasks}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* View Controls Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-2 mb-3 sm:mb-0">
          <Button
            variant={viewMode === 'grid' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('grid')}
            className={`${viewMode === 'grid' ? 'bg-primary text-white' : 'border-gray-200 text-gray-700'} transition-all duration-200`}
          >
            <LayoutGrid className="h-4 w-4 mr-1" />
            <span>Grid</span>
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('list')}
            className={`${viewMode === 'list' ? 'bg-primary text-white' : 'border-gray-200 text-gray-700'} transition-all duration-200`}
          >
            <List className="h-4 w-4 mr-1" />
            <span>List</span>
          </Button>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-gray-600 whitespace-nowrap">Sort by:</span>
          <Select value={sortBy} onValueChange={(value: 'name' | 'company' | 'status' | 'nextVat' | 'nextAccounts' | 'yearEnd') => setSortBy(value)}>
            <SelectTrigger className="w-full sm:w-[180px] border-gray-200 focus:ring-primary">
              <SelectValue placeholder="Select sort option" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Client Name</SelectItem>
              <SelectItem value="company">Company Name</SelectItem>
              <SelectItem value="status">Status</SelectItem>
              <SelectItem value="nextVat">Next VAT Due</SelectItem>
              <SelectItem value="nextAccounts">Next Accounts Due</SelectItem>
              <SelectItem value="yearEnd">Year End Date</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Client List */}
      {loading ? (
        <div className="flex justify-center items-center py-16">
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
            <p className="text-gray-500">Loading clients...</p>
          </div>
        </div>
      ) : clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-6 bg-white rounded-xl border border-dashed border-gray-200 p-8">
          <div className="flex flex-col items-center">
            <Building2 className="h-16 w-16 text-gray-300 mb-4" />
            <div className="text-gray-500 text-lg font-medium">No clients found</div>
            <p className="text-gray-400 text-center max-w-md mt-2">Get started by adding your first client or importing existing client data.</p>
          </div>
          <div className="flex gap-4">
            <Button
              variant="outline"
              className="border-gray-200 hover:bg-gray-50 transition-colors"
              onClick={() => setIsUploadDialogOpen(true)}
            >
              <Upload className="h-4 w-4 mr-2" />
              Import CSV
            </Button>
            <Button
              className="bg-primary hover:bg-primary/90 text-white transition-all duration-200"
              onClick={() => setIsAddClientOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Client
            </Button>
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedClients.map((client) => (
            <Card 
              key={client.id} 
              className="overflow-hidden border border-gray-200 hover:border-primary hover:shadow-md transition-all duration-200 cursor-pointer"
              onClick={() => handleClientClick(client.id)}
            >
              <CardHeader className="p-5 pb-0">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-[#1a365d] text-lg font-semibold line-clamp-1" title={client.clientName}>
                    {client.clientName}
                  </CardTitle>
                  <Badge 
                    className={`${getStatusColor(client.derivedTaskStatus || 'No Active Tasks')} text-xs`}
                    title={client.derivedTaskStatus || 'No Active Tasks'}
                  >
                    {client.derivedTaskStatus || 'No Active Tasks'}
                  </Badge>
                </div>
                <p className="text-gray-500 mt-1 line-clamp-1" title={client.companyName}>
                  {client.companyName}
                </p>
              </CardHeader>
              <CardContent className="p-5 pt-4">
                <div className="space-y-3">
                  <div className="flex items-center text-sm">
                    <Mail className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0" />
                    <span className="text-gray-600 truncate" title={client.clientEmail}>{client.clientEmail}</span>
                  </div>
                  {client.clientPhone && (
                    <div className="flex items-center text-sm">
                      <Phone className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0" />
                      <span className="text-gray-600">{client.clientPhone}</span>
                    </div>
                  )}
                  {client.nextVatDue && (
                    <div className="flex items-center text-sm">
                      <Calendar className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0" />
                      <span className="text-gray-600">
                        VAT Due: {formatDate(client.nextVatDue)}
                      </span>
                    </div>
                  )}
                </div>
                
                {(client.derivedTaskStatus === "No Active Tasks" || client.derivedTaskStatus === "Up to Date") && (
                  <Button 
                    variant="outline"
                    size="sm"
                    className="mt-4 w-full text-primary border-primary/20 hover:bg-primary/5 hover:text-primary transition-colors"
                    onClick={(e) => { 
                      e.stopPropagation();
                      handleCreateTaskForClient(client.id); 
                    }}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Create Task
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6">Client Name</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6">Company</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6">Status</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6">Email</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6">Next VAT</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6">Next Accounts</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedClients.map(renderListItem)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Client Dialog */}
          <Dialog open={isAddClientOpen} onOpenChange={setIsAddClientOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-5 w-5" />
                <span>Add Client</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="w-screen max-w-none min-w-[700px] h-[96vh] bg-white border-none shadow-xl rounded-xl flex flex-col">
              <DialogHeader className="border-b pb-4">
                <DialogTitle className="text-2xl font-semibold text-[#1a365d]">Add New Client</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
                <Tabs defaultValue="client_company" className="flex-1 flex flex-col">
                  <TabsList className="grid grid-cols-3 mb-4 px-4">
                    <TabsTrigger value="client_company">Client & Company Info</TabsTrigger>
                    <TabsTrigger value="dates_services">Key Dates & Services</TabsTrigger>
                    <TabsTrigger value="additional">Additional</TabsTrigger>
                  </TabsList>

                  <div className="flex-1 overflow-hidden">
                    <ScrollArea className="h-full px-4">
                      <TabsContent value="client_company" className="space-y-8 mt-0">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="clientName" className="text-gray-900 font-medium">Client Name *</Label>
                            <Input
                              id="clientName"
                              name="clientName"
                              value={formData.clientName}
                              onChange={handleInputChange}
                              placeholder="Enter client name"
                              className="border-gray-200 focus:border-[#1a365d] focus:ring-[#1a365d] text-gray-900"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="clientRole" className="text-gray-900 font-medium">Role</Label>
                            <Select
                              value={formData.clientRole || ''}
                              onValueChange={(value) => setFormData(prev => ({ ...prev, clientRole: value as string | null }))}
                            >
                              <SelectTrigger className="border-gray-200 focus:border-[#1a365d] focus:ring-[#1a365d] text-gray-900">
                                <SelectValue placeholder="Select role" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="director">Director</SelectItem>
                                <SelectItem value="sole-trader">Sole Trader</SelectItem>
                                <SelectItem value="bookkeeper">Bookkeeper</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="clientEmail" className="text-gray-900 font-medium">Email *</Label>
                            <Input
                              id="clientEmail"
                              name="clientEmail"
                              type="email"
                              value={formData.clientEmail}
                              onChange={handleInputChange}
                              placeholder="Enter email"
                              className="border-gray-200 focus:border-[#1a365d] focus:ring-[#1a365d] text-gray-900"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="clientPhone" className="text-gray-900 font-medium">Phone</Label>
                            <Input
                              id="clientPhone"
                              name="clientPhone"
                              type="tel"
                              value={formData.clientPhone}
                              onChange={handleInputChange}
                              placeholder="Enter phone number"
                              className="border-gray-200 focus:border-[#1a365d] focus:ring-[#1a365d] text-gray-900"
                            />
                          </div>
                          <div className="space-y-2 col-span-2">
                            <Label className="text-gray-900 font-medium">Preferred Contact Method</Label>
                            <RadioGroup
                              value={formData.preferredContactMethod}
                              onValueChange={(value: 'email' | 'sms' | 'whatsapp' | 'phone') => 
                                setFormData(prev => ({ ...prev, preferredContactMethod: value }))}
                              className="flex gap-4"
                            >
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="email" id="email" />
                                <Label htmlFor="email">Email</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="sms" id="sms" />
                                <Label htmlFor="sms">SMS</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="whatsapp" id="whatsapp" />
                                <Label htmlFor="whatsapp">WhatsApp</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="phone" id="phone" />
                                <Label htmlFor="phone">Phone</Label>
                              </div>
                            </RadioGroup>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="companyName" className="text-gray-900 font-medium">Company Name *</Label>
                            <Input
                              id="companyName"
                              name="companyName"
                              value={formData.companyName}
                              onChange={handleInputChange}
                              placeholder="Enter company name"
                              className="border-gray-200 focus:border-[#1a365d] focus:ring-[#1a365d] text-gray-900"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="companyNumber" className="text-gray-900 font-medium">Company Number</Label>
                            <div className="flex items-center gap-2">
                              <Input 
                                id="companyNumber"
                                name="companyNumber"
                                value={formData.companyNumber} 
                                onChange={handleInputChange} 
                                className="flex-1"
                              />
                              <Button 
                                type="button" 
                                variant="outline"
                                size="icon"
                                onClick={handleAutoFillFromCompanyNumber}
                                disabled={isAutoFilling}
                                title="Auto-fill from Company Number"
                              >
                                {isAutoFilling ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                              </Button>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="sicCode" className="text-gray-900 font-medium">SIC Code</Label>
                            <Input
                              id="sicCode"
                              name="sicCode"
                              value={formData.sicCode}
                              onChange={handleInputChange}
                              placeholder="Enter SIC code"
                              className="border-gray-200 focus:border-[#1a365d] focus:ring-[#1a365d] text-gray-900"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="incorporationDate" className="text-gray-900 font-medium">Incorporation Date</Label>
                            <Input
                              id="incorporationDate"
                              name="incorporationDate"
                              type="date"
                              value={formData.incorporationDate}
                              onChange={handleInputChange}
                              className="border-gray-200 focus:border-[#1a365d] focus:ring-[#1a365d] text-gray-900"
                            />
                          </div>
                          <div className="space-y-2 col-span-2">
                            <Label htmlFor="companyAddress" className="text-gray-900 font-medium">Registered Office Address</Label>
                            <Textarea
                              id="companyAddress"
                              name="companyAddress"
                              value={formData.companyAddress}
                              onChange={handleInputChange}
                              placeholder="Enter address"
                              className="border-gray-200 focus:border-[#1a365d] focus:ring-[#1a365d] text-gray-900"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="companyStatus" className="text-gray-900 font-medium">Company Status</Label>
                            <Select
                              value={formData.companyStatus}
                              onValueChange={(value: 'active' | 'dormant' | 'dissolved') => 
                                setFormData(prev => ({ ...prev, companyStatus: value }))}
                            >
                              <SelectTrigger className="border-gray-200 focus:border-[#1a365d] focus:ring-[#1a365d] text-gray-900">
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="dormant">Dormant</SelectItem>
                                <SelectItem value="dissolved">Dissolved</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="dates_services" className="space-y-8 mt-0">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="yearEndDate" className="text-gray-900 font-medium">Year End Date</Label>
                            <Input
                              id="yearEndDate"
                              name="yearEndDate"
                              type="date"
                              value={formData.yearEndDate}
                              onChange={handleInputChange}
                              className="border-gray-200 focus:border-[#1a365d] focus:ring-[#1a365d] text-gray-900"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="nextAccountsDue" className="text-gray-900 font-medium">Next Accounts Due</Label>
                            <Input
                              id="nextAccountsDue"
                              name="nextAccountsDue"
                              type="date"
                              value={formData.nextAccountsDue}
                              onChange={handleInputChange}
                              className="border-gray-200 focus:border-[#1a365d] focus:ring-[#1a365d] text-gray-900"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="nextConfirmationStatementDue" className="text-gray-900 font-medium">Next Confirmation Statement Due</Label>
                            <Input
                              id="nextConfirmationStatementDue"
                              name="nextConfirmationStatementDue"
                              type="date"
                              value={formData.nextConfirmationStatementDue}
                              onChange={handleInputChange}
                              className="border-gray-200 focus:border-[#1a365d] focus:ring-[#1a365d] text-gray-900"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="vatFilingFrequency" className="text-gray-900 font-medium">VAT Filing Frequency</Label>
                            <Select
                              value={formData.vatFilingFrequency}
                              onValueChange={(value: 'monthly' | 'quarterly' | 'annually') => 
                                setFormData(prev => ({ ...prev, vatFilingFrequency: value }))}
                            >
                              <SelectTrigger className="border-gray-200 focus:border-[#1a365d] focus:ring-[#1a365d] text-gray-900">
                                <SelectValue placeholder="Select frequency" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="monthly">Monthly</SelectItem>
                                <SelectItem value="quarterly">Quarterly</SelectItem>
                                <SelectItem value="annually">Annually</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="nextVatDue" className="text-gray-900 font-medium">Next VAT Due</Label>
                            <Input
                              id="nextVatDue"
                              name="nextVatDue"
                              type="date"
                              value={formData.nextVatDue}
                              onChange={handleInputChange}
                              className="border-gray-200 focus:border-[#1a365d] focus:ring-[#1a365d] text-gray-900"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="corporationTaxDeadline" className="text-gray-900 font-medium">Corporation Tax Deadline</Label>
                            <Input
                              id="corporationTaxDeadline"
                              name="corporationTaxDeadline"
                              type="date"
                              value={formData.corporationTaxDeadline}
                              onChange={handleInputChange}
                              className="border-gray-200 focus:border-[#1a365d] focus:ring-[#1a365d] text-gray-900"
                            />
                          </div>
                          <div className="space-y-2 col-span-2">
                            <Label htmlFor="payrollDeadlines" className="text-gray-900 font-medium">Payroll Deadlines</Label>
                            <Textarea
                              id="payrollDeadlines"
                              name="payrollDeadlines"
                              value={formData.payrollDeadlines.join('\n')} // Assuming array of strings, join for display
                              onChange={(e) => setFormData(prev => ({ ...prev, payrollDeadlines: e.target.value.split('\n') }))} // Split by newline for array
                              placeholder="Enter each deadline on a new line"
                              className="border-gray-200 focus:border-[#1a365d] focus:ring-[#1a365d] text-gray-900"
                              rows={3}
                            />
                          </div>
                        </div>
                        <div className="space-y-4">
                          <Label className="text-gray-900 font-medium">Services</Label>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="bookkeeping"
                                checked={formData.services.includes('bookkeeping')}
                                onCheckedChange={() => handleServiceChange('bookkeeping')}
                                className="border-gray-300 data-[state=checked]:bg-[#1a365d] data-[state=checked]:border-[#1a365d]"
                              />
                              <Label htmlFor="bookkeeping" className="text-gray-900 font-medium">Bookkeeping</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="payroll"
                                checked={formData.services.includes('payroll')}
                                onCheckedChange={() => handleServiceChange('payroll')}
                                className="border-gray-300 data-[state=checked]:bg-[#1a365d] data-[state=checked]:border-[#1a365d]"
                              />
                              <Label htmlFor="payroll" className="text-gray-900 font-medium">Payroll</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="vat"
                                checked={formData.services.includes('vat_returns')}
                                onCheckedChange={() => handleServiceChange('vat_returns')}
                                className="border-gray-300 data-[state=checked]:bg-[#1a365d] data-[state=checked]:border-[#1a365d]"
                              />
                              <Label htmlFor="vat" className="text-gray-900 font-medium">VAT Returns</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="corporation-tax"
                                checked={formData.services.includes('corporation_tax')}
                                onCheckedChange={() => handleServiceChange('corporation_tax')}
                                className="border-gray-300 data-[state=checked]:bg-[#1a365d] data-[state=checked]:border-[#1a365d]"
                              />
                              <Label htmlFor="corporation-tax" className="text-gray-900 font-medium">Corporation Tax</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="self-assessment"
                                checked={formData.services.includes('self_assessment')}
                                onCheckedChange={() => handleServiceChange('self_assessment')}
                                className="border-gray-300 data-[state=checked]:bg-[#1a365d] data-[state=checked]:border-[#1a365d]"
                              />
                              <Label htmlFor="self-assessment" className="text-gray-900 font-medium">Self Assessment</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="accounts"
                                checked={formData.services.includes('accounts_production')}
                                onCheckedChange={() => handleServiceChange('accounts_production')}
                                className="border-gray-300 data-[state=checked]:bg-[#1a365d] data-[state=checked]:border-[#1a365d]"
                              />
                              <Label htmlFor="accounts" className="text-gray-900 font-medium">Accounts Production</Label>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="engagementLetterStatus" className="text-gray-900 font-medium">Engagement Letter Status</Label>
                            <Select
                              value={formData.engagementLetterStatus}
                              onValueChange={(value: 'signed' | 'pending' | 'not_sent') => 
                                setFormData(prev => ({ ...prev, engagementLetterStatus: value }))}
                            >
                              <SelectTrigger className="border-gray-200 focus:border-[#1a365d] focus:ring-[#1a365d] text-gray-900">
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="signed">Signed</SelectItem>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="not_sent">Not Sent</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="additional" className="space-y-4 mt-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <Label className="text-gray-900 font-medium mb-2 block">Financial Summary</Label>
                            <div className="space-y-4 p-4 border rounded-md">
                              <div className="space-y-2">
                                <Label htmlFor="lastYearTurnover" className="text-gray-900 font-medium">Last Year Turnover (£)</Label>
                                <Input
                                  id="lastYearTurnover"
                                  name="lastYearTurnover"
                                  type="number"
                                  value={formData.lastYearTurnover}
                                  onChange={(e) => setFormData(prev => ({ ...prev, lastYearTurnover: parseFloat(e.target.value) || 0 }))}
                                  placeholder="e.g., 50000"
                                  className="border-gray-200 focus:border-[#1a365d] focus:ring-[#1a365d] text-gray-900"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="profitLoss" className="text-gray-900 font-medium">Profit / Loss (£)</Label>
                                <Input
                                  id="profitLoss"
                                  name="profitLoss"
                                  type="number"
                                  value={formData.profitLoss}
                                  onChange={(e) => setFormData(prev => ({ ...prev, profitLoss: parseFloat(e.target.value) || 0 }))}
                                  placeholder="e.g., 10000 (negative for loss)"
                                  className="border-gray-200 focus:border-[#1a365d] focus:ring-[#1a365d] text-gray-900"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="taxOwed" className="text-gray-900 font-medium">Tax Owed (£)</Label>
                                <Input
                                  id="taxOwed"
                                  name="taxOwed"
                                  type="number"
                                  value={formData.taxOwed}
                                  onChange={(e) => setFormData(prev => ({ ...prev, taxOwed: parseFloat(e.target.value) || 0 }))}
                                  placeholder="e.g., 2000"
                                  className="border-gray-200 focus:border-[#1a365d] focus:ring-[#1a365d] text-gray-900"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-gray-900 font-medium mb-2 block">General Notes</Label>
                             <Textarea
                              id="notes"
                              name="notes"
                              value={formData.notes}
                              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                              placeholder="Enter any general notes for this client"
                              className="border-gray-200 focus:border-[#1a365d] focus:ring-[#1a365d] text-gray-900"
                              rows={5}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-gray-900 font-medium">Required Documents</Label>
                            <div className="space-y-2">
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="bankStatements"
                                  checked={formData.requiredDocuments.bankStatements}
                                  onCheckedChange={(checked) => 
                                    setFormData(prev => ({
                                      ...prev,
                                      requiredDocuments: {
                                        ...prev.requiredDocuments,
                                        bankStatements: checked as boolean
                                      }
                                    }))}
                                  className="border-gray-300 data-[state=checked]:bg-[#1a365d] data-[state=checked]:border-[#1a365d]"
                                />
                                <Label htmlFor="bankStatements" className="text-gray-900 font-medium">Bank Statements</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="receipts"
                                  checked={formData.requiredDocuments.receipts}
                                  onCheckedChange={(checked) => 
                                    setFormData(prev => ({
                                      ...prev,
                                      requiredDocuments: {
                                        ...prev.requiredDocuments,
                                        receipts: checked as boolean
                                      }
                                    }))}
                                  className="border-gray-300 data-[state=checked]:bg-[#1a365d] data-[state=checked]:border-[#1a365d]"
                                />
                                <Label htmlFor="receipts" className="text-gray-900 font-medium">Receipts</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="payrollSummaries"
                                  checked={formData.requiredDocuments.payrollSummaries}
                                  onCheckedChange={(checked) => 
                                    setFormData(prev => ({
                                      ...prev,
                                      requiredDocuments: {
                                        ...prev.requiredDocuments,
                                        payrollSummaries: checked as boolean
                                      }
                                    }))}
                                  className="border-gray-300 data-[state=checked]:bg-[#1a365d] data-[state=checked]:border-[#1a365d]"
                                />
                                <Label htmlFor="payrollSummaries" className="text-gray-900 font-medium">Payroll Summaries</Label>
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="taskStatus" className="text-gray-900 font-medium">Task Status</Label>
                            <Select
                              value={formData.taskStatus}
                              onValueChange={(value: 'waiting' | 'in_progress' | 'completed') => 
                                setFormData(prev => ({ ...prev, taskStatus: value }))}
                            >
                              <SelectTrigger className="border-gray-200 focus:border-[#1a365d] focus:ring-[#1a365d] text-gray-900">
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="waiting">Waiting on Client</SelectItem>
                                <SelectItem value="in_progress">In Progress</SelectItem>
                                <SelectItem value="completed">Completed</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2 col-span-2">
                            <Label htmlFor="lastInteractionNotes" className="text-gray-900 font-medium">Last Interaction Notes</Label>
                            <Textarea
                              id="lastInteractionNotes"
                              name="lastInteractionNotes"
                              value={formData.lastInteractionNotes}
                              onChange={(e) => setFormData(prev => ({ ...prev, lastInteractionNotes: e.target.value }))}
                              placeholder="Enter notes from last interaction"
                              className="border-gray-200 focus:border-[#1a365d] focus:ring-[#1a365d] text-gray-900"
                            />
                          </div>
                          <div className="space-y-2 col-span-2">
                            <Label className="text-gray-900 font-medium">Automations</Label>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label className="text-sm text-gray-600">Standard Alerts</Label> {/* Changed label */} 
                                <div className="space-y-2">
                                  {/* REMOVE_START */}
                                  <div className="flex items-center space-x-2">
                                    <Switch
                                      id="missedReminders"
                                      checked={formData.customAlerts.missedReminders}
                                      onCheckedChange={(checked) => 
                                        setFormData(prev => ({
                                          ...prev,
                                          customAlerts: {
                                            ...prev.customAlerts,
                                            missedReminders: checked
                                          }
                                        }))}
                                    />
                                    <Label htmlFor="missedReminders" className="text-sm">Notify on missed reminders</Label>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <Switch
                                      id="documentOverdue"
                                      checked={formData.customAlerts.documentOverdue}
                                      onCheckedChange={(checked) => 
                                        setFormData(prev => ({
                                          ...prev,
                                          customAlerts: {
                                            ...prev.customAlerts,
                                            documentOverdue: checked
                                          }
                                        }))}
                                    />
                                    <Label htmlFor="documentOverdue" className="text-sm">Notify on overdue documents</Label>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <Switch
                                      id="automatedEmails"
                                      checked={formData.automatedEmails}
                                      onCheckedChange={(checked) => 
                                        setFormData(prev => ({
                                          ...prev,
                                          automatedEmails: checked
                                        }))}
                                    />
                                    <Label htmlFor="automatedEmails" className="text-sm">Enable automated emails</Label>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </TabsContent>
                    </ScrollArea>
                  </div>

                  <div className="flex justify-end space-x-4 p-4 border-t mt-4 bg-white">
                    <Button 
                      variant="outline" 
                      onClick={() => setIsAddClientOpen(false)}
                      className="border-gray-200 hover:bg-gray-50"
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit"
                    >
                      Save Client
                    </Button>
                  </div>
                </Tabs>
              </form>
            </DialogContent>
          </Dialog>

      {/* CSV Upload Dialog */}
          <UploadDialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
            <UploadDialogTrigger asChild>
              <Button>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" /></svg>
                <span>Upload Clients (CSV)</span>
              </Button>
            </UploadDialogTrigger>
            <UploadDialogContent className="max-w-lg w-full bg-white border-none shadow-xl rounded-xl">
              <UploadDialogHeader className="border-b pb-4">
                <UploadDialogTitle className="text-2xl font-semibold text-primary">Upload Clients via CSV</UploadDialogTitle>
              </UploadDialogHeader>
              <form onSubmit={handleCsvSubmit} className="py-4 flex flex-col gap-6">
                <div className="text-gray-700">Upload a CSV file to add multiple clients at once. Please use the provided template for correct formatting.</div>
                <Button type="button" variant="outline" className="border-gray-200 w-fit" onClick={handleDownloadTemplate}>
                  Download CSV Template
                </Button>
                <div>
                  <label htmlFor="csv-upload-input" className="block text-gray-900 font-medium mb-2">Select CSV File</label>
                  <input id="csv-upload-input" type="file" accept=".csv" onChange={handleCsvUpload} className="block w-full text-gray-700" />
                  {csvFile && <div className="mt-2 text-sm text-gray-600">Selected: {csvFile.name}</div>}
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button type="button" variant="outline" className="border-gray-200" onClick={() => { setIsUploadDialogOpen(false); setCsvFile(null); }}>Cancel</Button>
                  <Button type="submit">Upload</Button>
                </div>
              </form>
            </UploadDialogContent>
          </UploadDialog>
        </div>
  );
}

// Helper function to format date for display
const formatDate = (dateString: string) => {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { // Changed _ to an empty catch block
    return dateString;
  }
};

// Helper function to get appropriate status colors
const getStatusColor = (status: string | undefined) => {
  if (!status) return 'bg-gray-100 text-gray-800';
  
  switch (status) {
    case 'Up to Date':
    case 'No Active Tasks':
      return 'bg-green-100 text-green-800';
    case 'New Request / To Do':
    case 'Information Gathering / Waiting on Client':
      return 'bg-blue-100 text-blue-800';
    case 'In Progress':
    case 'Internal Review':
    case 'Pending Client Approval':
    case 'Ready to File / Submit':
      return 'bg-amber-100 text-amber-800';
    case 'Completed / Filed':
      return 'bg-purple-100 text-purple-800';
    case 'On Hold / Blocked':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}; 