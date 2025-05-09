'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Building2, Mail, Phone, Calendar, FileText, AlertCircle, LayoutGrid, List, ChevronDown, Search, RefreshCw } from 'lucide-react';
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
import { BarChart3 } from 'lucide-react';

// Helper function to generate a UUID v4
function generateUUID() { // Public Domain/MIT
    var d = new Date().getTime();//Timestamp
    var d2 = ((typeof performance !== 'undefined') && performance.now && (performance.now()*1000)) || 0;//Time in microseconds since page-load or 0 if unsupported
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16;//random number between 0 and 16
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
  reminderSchedule: {
    vatReminderDays: number;
    accountsReminderDays: number;
    confirmationStatementReminderDays: number;
  };
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
  reminderSchedule: {
    vatReminderDays: 30,
    accountsReminderDays: 30,
    confirmationStatementReminderDays: 30,
  },
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

export default function ClientsPage() {
  const router = useRouter();
  const [isAddClientOpen, setIsAddClientOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [sortBy, setSortBy] = useState<'name' | 'company' | 'status' | 'nextVat' | 'nextAccounts' | 'yearEnd'>('name');
  const [formData, setFormData] = useState<FormData>(initialClientFormData);
  const [clients, setClients] = useState<Client[]>([]);
  const [allClientTasks, setAllClientTasks] = useState<ClientTask[]>([]); // Store all tasks
  const [loading, setLoading] = useState(true);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isAutoFilling, setIsAutoFilling] = useState(false);

  // Modified fetchClients to also get all client_tasks
  const fetchClientsAndTasks = async () => {
    setLoading(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        console.error('Error getting session or user not logged in:', sessionError);
        setClients([]);
        toast.error('Authentication error. Please log in again.');
        return;
      }

      // Fetch Clients
      const { data: clientsData, error: clientsError } = await supabase.from('clients').select('*');
      if (clientsError) throw clientsError;

      // Fetch all Client Tasks
      const { data: tasksData, error: tasksError } = await supabase.from('client_tasks').select('id, client_id, stage');
      if (tasksError) throw tasksError;
      setAllClientTasks(tasksData || []);

      const convertedClients = (clientsData || []).map((client: any) => {
        let parsedRequiredDocuments = { bankStatements: false, receipts: false, payrollSummaries: false };
        try {
          if (client.required_documents && typeof client.required_documents === 'string') {
            parsedRequiredDocuments = JSON.parse(client.required_documents);
          } else if (typeof client.required_documents === 'object') {
            parsedRequiredDocuments = client.required_documents;
          }
        } catch (e) { console.error("Failed to parse required_documents", e); }

        let parsedReminderSchedule = { vatReminderDays: 30, accountsReminderDays: 30, confirmationStatementReminderDays: 30 };
        try {
          if (client.reminder_schedule && typeof client.reminder_schedule === 'string') {
            parsedReminderSchedule = JSON.parse(client.reminder_schedule);
          } else if (typeof client.reminder_schedule === 'object') {
            parsedReminderSchedule = client.reminder_schedule;
          }
        } catch (e) { console.error("Failed to parse reminder_schedule", e); }
        
        let parsedCustomAlerts = { missedReminders: false, documentOverdue: false };
        try {
          if (client.custom_alerts && typeof client.custom_alerts === 'string') {
            parsedCustomAlerts = JSON.parse(client.custom_alerts);
          } else if (typeof client.custom_alerts === 'object') {
            parsedCustomAlerts = client.custom_alerts;
          }
        } catch (e) { console.error("Failed to parse custom_alerts", e); }

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
          companyStatus: client.company_status || 'active',
          incorporationDate: client.incorporation_date || '',
          yearEndDate: client.year_end_date || '',
          nextAccountsDue: client.next_accounts_due || '',
          nextConfirmationStatementDue: client.next_confirmation_statement_due || '',
          vatFilingFrequency: client.vat_filing_frequency || 'quarterly',
          nextVatDue: client.next_vat_due || '',
          payrollDeadlines: client.payroll_deadlines || [],
          corporationTaxDeadline: client.corporation_tax_deadline || '',
          services: client.services || [],
          engagementLetterStatus: client.engagement_letter_signed ? 'signed' : 'not_sent', // Assuming engagement_letter_signed maps to status
          requiredDocuments: parsedRequiredDocuments,
          originalTaskStatus: client.task_status || 'waiting', // Store original from DB
          derivedTaskStatus: getClientTaskStatus(client.id, tasksData || []), // Compute new status
          recentFiles: client.recent_files ? (typeof client.recent_files === 'string' ? JSON.parse(client.recent_files) : client.recent_files) : [],
          lastInteractionNotes: client.last_interaction_notes || '',
          reminderSchedule: parsedReminderSchedule,
          customAlerts: parsedCustomAlerts,
          automatedEmails: client.automated_emails !== undefined ? client.automated_emails : true,
          lastYearTurnover: client.last_year_turnover || 0,
          profitLoss: client.profit_loss || 0,
          taxOwed: client.tax_owed || 0,
          shareableLinkToken: client.shareable_link_token || '',
          notes: client.notes || '',
          meetingLog: client.meeting_log || [],
          emailHistory: client.email_history || [],
        };
      });
      setClients(convertedClients as Client[]); // Ensure type cast after map

    } catch (error) {
      console.error('Error fetching clients or tasks:', error);
      toast.error('Failed to load client data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClientsAndTasks();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Add dependencies if needed, e.g. if session changes should trigger refetch

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

  const handleAutoFillFromCompanyNumber = useCallback(async () => {
    const companyNumberToLookup = formData.companyNumber?.trim();
    if (!companyNumberToLookup) {
      toast.warning('Please enter a Company Number first.');
      return;
    }

    setIsAutoFilling(true);
    let companyData: CompanyHouseData | null = null; // Initialize companyData as null

    try {
      console.log(`Looking up company number: ${companyNumberToLookup}`);
      const { data, error } = await supabase
        .from('companies_house_data') 
        .select(
          'company_name, company_number, reg_address_address_line1, reg_address_address_line2, reg_address_post_town, reg_address_county, reg_address_post_code, company_status, incorporation_date, sic_code_sic_text_1, ' + 
          'accounts_next_due_date, conf_stmt_next_due_date' 
        )
        .eq('company_number', companyNumberToLookup)
        .maybeSingle(); // Expect 0 or 1 result

      if (error) {
        console.error('Supabase lookup error:', error);
        // Ensure error is thrown so it's caught by the catch block
        throw new Error(`Database lookup failed: ${error.message}`); 
      }
      
      // If no error, data is either CompanyHouseData or null
      companyData = data as CompanyHouseData | null;

      if (!companyData) {
        toast.error(`Company number "${companyNumberToLookup}" not found in the database.`);
      } else {
        // Re-assert companyData is not null for TypeScript within this block scope
        const data = companyData; 
        console.log('Found company data:', data);
        
        const addressParts = [
          data.reg_address_address_line1,
          data.reg_address_address_line2,
          data.reg_address_post_town,
          data.reg_address_county,
          data.reg_address_post_code
        ];
        const fullAddress = addressParts.filter(part => part && part.trim() !== '').join(', ');

        setFormData(prev => ({
          ...prev,
          companyName: data.company_name || prev.companyName || '',
          companyAddress: fullAddress || prev.companyAddress || '',
          companyStatus: (data.company_status?.toLowerCase() === 'active' || data.company_status?.toLowerCase() === 'dormant' || data.company_status?.toLowerCase() === 'dissolved') 
                         ? data.company_status.toLowerCase() as Client['companyStatus'] 
                         : prev.companyStatus,
          incorporationDate: data.incorporation_date || prev.incorporationDate || '',
          sicCode: data.sic_code_sic_text_1 || prev.sicCode || '',
          nextAccountsDue: data.accounts_next_due_date || prev.nextAccountsDue || '',
          nextConfirmationStatementDue: data.conf_stmt_next_due_date || prev.nextConfirmationStatementDue || '',
        }));

        toast.success('Client details auto-filled from Companies House data!');
      }

    } catch (err: any) {
      console.error('Auto-fill failed:', err);
      toast.error(`Auto-fill failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsAutoFilling(false);
    }
  }, [formData.companyNumber]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const { checked } = e.target as HTMLInputElement;
      if (name.startsWith('requiredDocuments.')) {
        const key = name.split('.')[1] as keyof Client['requiredDocuments'];
        setFormData(prev => ({
          ...prev,
          requiredDocuments: { ...prev.requiredDocuments, [key]: checked }
        }));
      } else if (name.startsWith('customAlerts.')) {
        const key = name.split('.')[1] as keyof Client['customAlerts'];
        setFormData(prev => ({
          ...prev,
          customAlerts: { ...prev.customAlerts, [key]: checked }
        }));
      } else if (name === 'automatedEmails') {
          setFormData(prev => ({
              ...prev,
              automatedEmails: checked
          }));
      }
    } else if (name.startsWith('reminderSchedule.')) {
      const key = name.split('.')[1] as keyof Client['reminderSchedule'];
      setFormData(prev => ({
        ...prev,
        reminderSchedule: { ...prev.reminderSchedule, [key]: parseInt(value) || 0 }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        toast.error('You must be logged in to add clients. Please log in again.');
        // Potentially redirect to login: router.push('/login');
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
        reminder_schedule: JSON.stringify(formData.reminderSchedule),
        custom_alerts: JSON.stringify(formData.customAlerts),
        automatedEmails: formData.automatedEmails,
        last_year_turnover: formData.lastYearTurnover,
        profit_loss: formData.profitLoss,
        tax_owed: formData.taxOwed,
        notes: formData.notes,
        shareable_link_token: formData.shareableLinkToken || generateUUID(),
        created_by: session.user.id,
        updated_by: session.user.id,
      };
      
      const { error } = await supabase
        .from('clients')
        .insert([clientDataToSave]);

      if (error) {
        throw error;
      }
      
      toast.success('Client saved successfully!');
      setIsAddClientOpen(false);
      setFormData(initialClientFormData); // Reset form to initial state
      fetchClientsAndTasks(); // Refresh the client list

    } catch (error: any) {
      console.error('Error saving client:', error);
      toast.error('Error saving client: ' + error.message);
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

  const handleCsvSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvFile) {
      alert('Please select a CSV file to upload.');
      return;
    }
    // TODO: Implement CSV parsing and upload logic
    alert(`Selected CSV file: ${csvFile.name}`);
    setIsUploadDialogOpen(false);
    setCsvFile(null);
    fetchClientsAndTasks(); // Corrected from fetchClients
  };

  const handleDownloadTemplate = () => {
    // Create a simple CSV template
    const csvContent = 'clientName,clientEmail,clientPhone,clientRole,companyName,companyNumber,companyAddress,sicCode,companyStatus,incorporationDate\n';
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'client_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Add this function to handle client selection
  const handleClientClick = (clientId: string) => {
    router.push(`/dashboard/clients/${clientId}`);
  };

  // Helper function to handle navigation for creating a task
  const handleCreateTaskForClient = (clientId: string) => {
    router.push(`/dashboard/tasks?clientId=${clientId}`);
  };

  // Updated Grid View Rendering
  const renderGridItem = (client: Client) => (
    <Card 
      key={client.id} 
      className="hover:shadow-lg transition-shadow border-gray-200 flex flex-col justify-between"
      // onClick={() => handleClientClick(client.id)} // Keep or remove if card content gets too busy with buttons
    >
      <CardHeader className="cursor-pointer" onClick={() => handleClientClick(client.id)}>
        <div className="flex justify-between items-start">
          <CardTitle className="text-xl text-primary font-semibold">{client.clientName}</CardTitle>
          {/* We can use derivedTaskStatus for a more dynamic badge here too if preferred, or keep companyStatus */} 
          <Badge 
            variant={client.companyStatus === 'active' ? 'default' : 'secondary'}
            className={client.companyStatus === 'active' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-900'}
          >
            {client.companyStatus} 
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-grow cursor-pointer" onClick={() => handleClientClick(client.id)}>
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Building2 className="h-4 w-4 text-primary flex-shrink-0" />
            <span className="text-gray-900 truncate" title={client.companyName}>{client.companyName}</span>
          </div>
          <div className="flex items-center space-x-2">
            <Mail className="h-4 w-4 text-primary flex-shrink-0" />
            <span className="text-gray-900 truncate" title={client.clientEmail}>{client.clientEmail}</span>
          </div>
          {/* Add other essential info as before, keeping it concise for card view */}
          <div className="flex items-center space-x-2 pt-2">
            <BarChart3 className="h-4 w-4 text-primary flex-shrink-0" />
            <span className="text-sm font-medium text-gray-700">Status:</span>
            <span className="text-sm text-gray-900 font-semibold truncate" title={client.derivedTaskStatus}>{client.derivedTaskStatus || 'N/A'}</span>
          </div>
        </div>
      </CardContent>
      <div className="p-4 border-t border-gray-100 mt-auto"> {/* Footer for actions */}
        {(client.derivedTaskStatus === "No Active Tasks" || client.derivedTaskStatus === "Up to Date") && (
          <Button 
            size="sm"
            className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground"
            onClick={(e) => { 
              e.stopPropagation(); // Prevent card click if it has one
              handleCreateTaskForClient(client.id); 
            }}
          >
            <Plus className="h-4 w-4 mr-2" /> Create Task
          </Button>
        )}
        {/* You can add other actions here like 'View Details' if the main card click is removed */}
      </div>
    </Card>
  );

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
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-[#1a365d]">Clients</h1>
        <div className="flex gap-2">
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
                                <Label className="text-sm text-gray-600">Reminder Schedule (days before)</Label>
                                <div className="grid grid-cols-3 gap-2">
                                  <div>
                                    <Label htmlFor="vatReminderDays" className="text-xs">VAT</Label>
                                    <Input
                                      id="vatReminderDays"
                                      name="reminderSchedule.vatReminderDays"
                                      type="number"
                                      value={formData.reminderSchedule.vatReminderDays}
                                      onChange={(e) => setFormData(prev => ({
                                        ...prev,
                                        reminderSchedule: {
                                          ...prev.reminderSchedule,
                                          vatReminderDays: parseInt(e.target.value)
                                        }
                                      }))}
                                      className="border-gray-200 focus:border-[#1a365d] focus:ring-[#1a365d] text-gray-900"
                                    />
                                  </div>
                                  <div>
                                    <Label htmlFor="accountsReminderDays" className="text-xs">Accounts</Label>
                                    <Input
                                      id="accountsReminderDays"
                                      name="reminderSchedule.accountsReminderDays"
                                      type="number"
                                      value={formData.reminderSchedule.accountsReminderDays}
                                      onChange={(e) => setFormData(prev => ({
                                        ...prev,
                                        reminderSchedule: {
                                          ...prev.reminderSchedule,
                                          accountsReminderDays: parseInt(e.target.value)
                                        }
                                      }))}
                                      className="border-gray-200 focus:border-[#1a365d] focus:ring-[#1a365d] text-gray-900"
                                    />
                                  </div>
                                  <div>
                                    <Label htmlFor="confirmationStatementReminderDays" className="text-xs">Confirmation</Label>
                                    <Input
                                      id="confirmationStatementReminderDays"
                                      name="reminderSchedule.confirmationStatementReminderDays"
                                      type="number"
                                      value={formData.reminderSchedule.confirmationStatementReminderDays}
                                      onChange={(e) => setFormData(prev => ({
                                        ...prev,
                                        reminderSchedule: {
                                          ...prev.reminderSchedule,
                                          confirmationStatementReminderDays: parseInt(e.target.value)
                                        }
                                      }))}
                                      className="border-gray-200 focus:border-[#1a365d] focus:ring-[#1a365d] text-gray-900"
                                    />
                                  </div>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label className="text-sm text-gray-600">Custom Alerts</Label>
                                <div className="space-y-2">
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
      </div>

      {/* View Controls */}
      <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-lg border border-gray-200">
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === 'grid' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('grid')}
            className={viewMode === 'grid' ? 'bg-primary text-white' : 'border-gray-200'}
          >
            <LayoutGrid className="h-4 w-4 text-primary" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('list')}
            className={viewMode === 'list' ? 'bg-primary text-white' : 'border-gray-200'}
          >
            <List className="h-4 w-4 text-primary" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-900">Sort by:</span>
          <Select value={sortBy} onValueChange={(value: 'name' | 'company' | 'status' | 'nextVat' | 'nextAccounts' | 'yearEnd') => setSortBy(value)}>
            <SelectTrigger className="w-[180px] border-gray-200">
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
        <div className="text-center text-gray-500 py-12">Loading clients...</div>
      ) : clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <div className="text-gray-500 text-lg">No clients found. Get started by adding your first client!</div>
          <Button
            className="bg-primary hover:bg-[#2a4a7d] text-white px-6 py-3 rounded-lg flex items-center gap-2 shadow-md hover:shadow-lg transition-all"
            onClick={() => setIsAddClientOpen(true)}
          >
            <Plus className="h-5 w-5" />
            <span>Add Client</span>
          </Button>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedClients.map(renderGridItem)}
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6">Client Name</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6">Company Name</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6">Task Status</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6">Email</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6">Phone</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6">Next VAT Due</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6">Next Accounts Due</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6">Year End Date</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedClients.map(renderListItem)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
} 