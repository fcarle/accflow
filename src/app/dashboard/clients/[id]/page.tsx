'use client';

import React, { useState, useEffect, FormEvent, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Building2,
  Mail,
  Phone,
  Calendar,
  FileText,
  AlertCircle,
  ChevronLeft,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  Download,
  File,
  Copy,
  Save,
  Trash2 as TrashIcon,
  ArrowRight,
  Sparkles, 
  AlertTriangle, 
  MessageCircleQuestion, 
  SendHorizontal, 
  User as UserIcon,
  Edit3 as EditIcon,
  Send as SendIcon,
  RefreshCw,
  FileCog,
  Plus,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/lib/supabase';
import { FileUploader } from '@/components/FileUploader';
import { ClientFileRecord } from '@/lib/models';
import { ensureBucketExists } from '@/lib/storage-utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
// import ReactMarkdown from 'react-markdown'; 
// import remarkGfm from 'remark-gfm'; 

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
// Use relative paths for these imports
import ClientAlertForm from '../../../../../components/admin/ClientAlertForm'; 
import { Switch as UISwitch } from '@/components/ui/switch'; // Specific import for ShadCN UI Switch

// Helper function to truncate text to a specified number of words
const truncateText = (text: string | null | undefined, wordLimit: number): string => {
  if (!text) return '';
  
  // First try to get a clean section by removing markdown and other formatting
  const cleanText = text.replace(/\*\*/g, '')
                     .replace(/\n\n---\n\n/g, ' ')
                     .replace(/\n+/g, ' ')
                     .replace(/\s+/g, ' ');
  
  const words = cleanText.trim().split(' ');
  if (words.length <= wordLimit) return cleanText;
  
  return words.slice(0, wordLimit).join(' ') + '...';
};

interface Client {
  id: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientRole: string;
  preferredContactMethod: 'email' | 'sms' | 'whatsapp' | 'phone';
  companyName: string;
  companyNumber: string;
  companyAddress: string;
  sicCode: string;
  companyStatus: 'active' | 'dormant' | 'dissolved';
  incorporationDate: string;
  yearEndDate: string;
  nextAccountsDue: string;
  nextConfirmationStatementDue: string;
  vatFilingFrequency: 'monthly' | 'quarterly' | 'annually';
  nextVatDue: string;
  payrollDeadlines: string[];
  corporationTaxDeadline: string;
  services: string[];
  engagementLetterStatus: 'signed' | 'pending' | 'not_sent';
  requiredDocuments: {
    bankStatements: boolean;
    receipts: boolean;
    payrollSummaries: boolean;
  };
  taskStatus: 'waiting' | 'in_progress' | 'completed';
  recentFiles: ClientFileRecord[];
  lastInteractionNotes: string;
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
  lastYearTurnover: number;
  profitLoss: number;
  taxOwed: number;
  shareableLinkToken?: string;
  notes: string;
  meetingLog: string[];
  emailHistory: string[];
  ai_document_status?: 'Good' | 'Okay' | 'Missing' | 'Pending Analysis' | null;
  ai_document_notes?: string | null;
  last_ai_analysis_at?: string | null;
}

interface ChatMessage {
  id: string;
  type: 'user' | 'ai' | 'system_report' | 'ai_typing'; 
  content: string;
  timestamp?: string;
  isFullReport?: boolean;
}

interface ClientNote {
  id: string;
  client_id: string;
  note: string;
  created_at: string;
  created_by: string;
}

interface ClientTask {
  id: string;
  client_id: string;
  task_title: string;
  task_description?: string | null;
  stage: string;
  assigned_user_id?: string | null;
  due_date?: string | null;
  priority?: string | null;
  created_at: string;
}

interface Profile {
  id: string;
  email: string; 
}

type FormData = Omit<Client, 'id' | 'recentFiles' | 'meetingLog' | 'emailHistory' | 'shareableLinkToken'>;

const initialFormData: FormData = {
  clientName: '',
  clientEmail: '',
  clientPhone: '',
  clientRole: '',
  preferredContactMethod: 'email',
  companyName: '',
  companyNumber: '',
  companyAddress: '',
  sicCode: '',
  companyStatus: 'active',
  incorporationDate: '',
  yearEndDate: '',
  nextAccountsDue: '',
  nextConfirmationStatementDue: '',
  vatFilingFrequency: 'quarterly',
  nextVatDue: '',
  payrollDeadlines: [],
  corporationTaxDeadline: '',
  services: [],
  engagementLetterStatus: 'not_sent',
  requiredDocuments: { bankStatements: false, receipts: false, payrollSummaries: false },
  taskStatus: 'waiting',
  lastInteractionNotes: '',
  reminderSchedule: { vatReminderDays: 30, accountsReminderDays: 30, confirmationStatementReminderDays: 30 },
  customAlerts: { missedReminders: false, documentOverdue: false },
  automatedEmails: true,
  lastYearTurnover: 0,
  profitLoss: 0,
  taxOwed: 0,
  notes: '',
};

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

// Define ReminderSchedule interface matching the one in ClientAlertForm and API
interface ReminderSchedule {
  id?: string; // From client_alert_schedules table
  client_alert_id?: string;
  days_before_due: number;
  alert_message?: string | null;
  is_active?: boolean;
  use_custom_message?: boolean; // This field is used in ClientAlertForm, ensure it's handled/available if needed for display logic
  // created_at and updated_at could also be here if fetched from client_alert_schedules
}

interface YourClientAlertType { 
  id: string; 
  client_id: string; 
  alert_type: string; 
  days_before_due: number;
  notification_preference: 'DRAFT_FOR_TEAM' | 'SEND_DIRECT_TO_CLIENT';
  is_active: boolean; 
  subject?: string | null; // Ensure subject is part of the type
  body: string; // Use body, as expected by ClientAlertForm
  source_task_id?: string | null;
  clients?: { client_name?: string }; 
  use_multi_schedule?: boolean;
  reminder_schedules?: ReminderSchedule[];
}

// Define RawClientAlert for API response type
interface RawClientAlert {
  id: string;
  client_id: string;
  alert_type: string;
  alert_message?: string | null;
  subject?: string | null;
  days_before_due: number;
  is_active: boolean;
  notification_preference: 'DRAFT_FOR_TEAM' | 'SEND_DIRECT_TO_CLIENT';
  source_task_id?: string | null;
  use_multi_schedule?: boolean;
  reminder_schedules?: ReminderSchedule[];
  [key: string]: unknown; // Allow other properties
}

// Type for the values in services form, used in handleServicesChange
type ServicesFormValue = string[] | 'monthly' | 'quarterly' | 'annually' | 'signed' | 'pending' | 'not_sent';

export default function ClientDetailPage() {
  const router = useRouter();
  const params = useParams();
  const routeId = params?.id; // Safer access to id
  const clientId = Array.isArray(routeId) ? routeId[0] : routeId; // clientId can be string | undefined
  const [client, setClient] = useState<Client | null>(null);
  const [clientTasks, setClientTasks] = useState<ClientTask[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [refreshFiles, setRefreshFiles] = useState(0);
  const [isBucketReady, setIsBucketReady] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [saving, setSaving] = useState(false);
  
  // New state for inline editing of Services & Engagement
  const [isEditingServices, setIsEditingServices] = useState(false);
  const [savingServices, setSavingServices] = useState(false);
  const [servicesFormData, setServicesFormData] = useState<{
    services: string[];
    vatFilingFrequency: 'monthly' | 'quarterly' | 'annually';
    engagementLetterStatus: 'signed' | 'pending' | 'not_sent';
  }>({
    services: [],
    vatFilingFrequency: 'quarterly',
    engagementLetterStatus: 'not_sent'
  });

  // State for inline editing of Key Dates
  const [isEditingDates, setIsEditingDates] = useState(false);
  const [savingDates, setSavingDates] = useState(false);
  const [datesFormData, setDatesFormData] = useState<{
    yearEndDate: string;
    nextAccountsDue: string;
    nextConfirmationStatementDue: string;
    nextVatDue: string;
    corporationTaxDeadline: string;
  }>({
    yearEndDate: '',
    nextAccountsDue: '',
    nextConfirmationStatementDue: '',
    nextVatDue: '',
    corporationTaxDeadline: ''
  });
  
  // State for inline editing of Client Information
  const [isEditingClientInfo, setIsEditingClientInfo] = useState(false);
  const [savingClientInfo, setSavingClientInfo] = useState(false);
  const [clientInfoFormData, setClientInfoFormData] = useState<{
    clientName: string;
    clientRole: string;
    clientEmail: string;
    clientPhone: string;
    preferredContactMethod: 'email' | 'sms' | 'whatsapp' | 'phone';
  }>({
    clientName: '',
    clientRole: '',
    clientEmail: '',
    clientPhone: '',
    preferredContactMethod: 'email'
  });

  const [detailedClientNotes, setDetailedClientNotes] = useState<ClientNote[]>([]);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAskingQuestion, setIsAskingQuestion] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [customUserQuestion, setCustomUserQuestion] = useState('');
  const [chatDisplayMessages, setChatDisplayMessages] = useState<ChatMessage[]>([]); 
  const typingIntervalRef = useRef<NodeJS.Timeout | null>(null); 

  const aiProcessingSteps = [
    "Initializing analysis...",
    "Accessing document registry...",
    "Scanning uploaded files...",
    "Extracting textual content...",
    "Performing OCR on images (if any)...",
    "Analyzing content against requirements...",
    "Consulting knowledge base for insights...",
    "Checking for common issues...",
    "Formulating recommendations...",
    "Generating report summary...",
    "Finalizing response..."
  ];
  
  const [showCreateAlertForm, setShowCreateAlertForm] = useState(false);
  const [clientAlerts, setClientAlerts] = useState<YourClientAlertType[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [apiBaseUrl, setApiBaseUrl] = useState('');

  // New state for managing alert editing
  const [editingAlert, setEditingAlert] = useState<YourClientAlertType | null>(null); // Changed any to YourClientAlertType
  const [showEditAlertForm, setShowEditAlertForm] = useState(false);

  // New state for testing alerts
  const [testingAlertId, setTestingAlertId] = useState<string | null>(null);

  useEffect(() => {
    const currentApiBaseUrl = window.location.origin + '/api';
    setApiBaseUrl(currentApiBaseUrl);
  }, []);

  const fetchClientAlertsForCurrentClient = async (currentClientId: string) => {
    if (!currentClientId) return;
    setLoadingAlerts(true);
    try {
      // Ensure currentClientId is a string before using in URL
      const response = await fetch(`/api/client-alerts?client_id=${encodeURIComponent(currentClientId)}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch client alerts');
      }
      const data: RawClientAlert[] = await response.json(); // Use RawClientAlert[]
      // Map API response (which has alert_message) to form's expected structure (body and subject)
      const mappedData: YourClientAlertType[] = data.map((alertItem) => ({
        ...alertItem,
        body: alertItem.alert_message || '', // Ensure body is always a string
        subject: alertItem.subject || `Reminder: ${(alertItem.alert_type || '').replace(/_/g, ' ')}`,
        // Ensure reminder_schedules is an array, even if null/undefined from API
        reminder_schedules: alertItem.reminder_schedules || [], 
      }));
      setClientAlerts(mappedData || []);
    } catch (error) {
      console.error("Error fetching client alerts:", error);
      toast.error((error as Error).message || 'Could not load client alerts.');
      setClientAlerts([]);
    } finally {
      setLoadingAlerts(false);
    }
  };

  useEffect(() => {
    if (clientId && typeof clientId === 'string') {
      fetchClientAlertsForCurrentClient(clientId);
    }
  }, [clientId]);


  const checkBucket = async () => {
    const bucketId = clientId && typeof clientId === 'string' ? `client_${clientId}` : null;
    if (!bucketId) {
      console.log('Client ID not available for bucket check.');
      return;
    }

    try {
      await ensureBucketExists(bucketId);
      setIsBucketReady(true);
      console.log(`Bucket ${bucketId} is ready.`);
    } catch (error) {
      console.error('Error ensuring bucket exists: ', error);
      toast.error('Could not prepare file storage for this client.');
      setIsBucketReady(false);
    }
  };

  const fetchClientDataAndRelated = async () => {
    setLoading(true);
    setError(null);
    if (!clientId || typeof clientId !== 'string') { // Check if clientId is a valid string
      toast.error('Invalid Client ID.');
      router.push('/dashboard/clients');
      setLoading(false);
      return;
    }

    try {
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select(`
          *,
          ai_document_status,
          ai_document_notes,
          last_ai_analysis_at
        `)
        .eq('id', clientId)
        .single();

      if (clientError) throw clientError;
      if (!clientData) throw new Error('Client not found.');
      
      const existingRecentFiles: ClientFileRecord[] = tryParseJSON(clientData.recent_files) || []; // Changed let to const
      
      const storageFiles: ClientFileRecord[] = [];
      const categories: ('bankStatements' | 'receipts' | 'payrollSummaries' | 'other')[] = [
        'bankStatements', 'receipts', 'payrollSummaries', 'other'
      ];

      for (const category of categories) {
        const pathPrefix = `clients/${clientId}/${category}/`;
        const { data: filesInCategory, error: listError } = await supabase.storage
          .from('client-files')
          .list(pathPrefix, {
            limit: 100, 
            offset: 0,
            sortBy: { column: 'name', order: 'asc' },
          });

        if (listError) {
          console.error(`Error listing files in ${pathPrefix}:`, listError);
        } else if (filesInCategory) {
          for (const file of filesInCategory) {
            if (file.name === '.emptyFolderPlaceholder') continue; 

            const filePathInBucket = `${pathPrefix}${file.name}`;
            const { data: signedUrlData, error: signedUrlError } = await supabase.storage
              .from('client-files')
              .createSignedUrl(filePathInBucket, 300); 
            
            if (signedUrlError) {
              console.error(`Error generating signed URL for ${filePathInBucket}:`, signedUrlError);
              storageFiles.push({
                fileName: file.name,
                fileUrl: '#error-generating-url', 
              });
              continue; 
            }
            
            if (signedUrlData && signedUrlData.signedUrl) {
              console.log('[ClientDetailPage] Generated Signed URL:', signedUrlData.signedUrl, 'for storage path:', filePathInBucket);
              storageFiles.push({
                fileName: file.name,
                fileUrl: signedUrlData.signedUrl,
              });
            } else {
              console.warn(`Could not get signed URL for ${filePathInBucket}. signedUrlData:`, signedUrlData);
              storageFiles.push({
                fileName: file.name,
                fileUrl: '#no-url-generated', 
              });
            }
          }
        }
      }
      const combinedFilesMap = new Map<string, ClientFileRecord>();
      existingRecentFiles.forEach(file => combinedFilesMap.set(file.fileName, file));
      storageFiles.forEach(file => combinedFilesMap.set(file.fileName, file));
      const allRecentFiles = Array.from(combinedFilesMap.values());

      const formattedClient: Client = {
        id: clientData.id,
        clientName: clientData.client_name || '',
        clientEmail: clientData.client_email || '',
        clientPhone: clientData.client_phone || '',
        clientRole: clientData.client_role || '',
        preferredContactMethod: (clientData.preferred_contact_method || 'email') as Client['preferredContactMethod'],
        companyName: clientData.company_name || '',
        companyNumber: clientData.company_number || '',
        companyAddress: clientData.registered_office_address || '',
        sicCode: clientData.sic_code || '',
        companyStatus: (clientData.company_status || 'active') as Client['companyStatus'],
        incorporationDate: clientData.incorporation_date || '',
        yearEndDate: clientData.year_end_date || '',
        nextAccountsDue: clientData.next_accounts_due || '',
        nextConfirmationStatementDue: clientData.next_confirmation_statement_due || '',
        vatFilingFrequency: (clientData.vat_filing_frequency || 'quarterly') as Client['vatFilingFrequency'],
        nextVatDue: clientData.next_vat_due || '',
        payrollDeadlines: clientData.payroll_deadlines || [],
        corporationTaxDeadline: clientData.corporation_tax_deadline || '',
        services: clientData.services || [],
        engagementLetterStatus: (clientData.engagement_letter_signed === true ? 'signed' : (clientData.engagement_letter_signed === false ? 'not_sent' : 'pending')) as Client['engagementLetterStatus'],
        requiredDocuments: clientData.required_documents ? (typeof clientData.required_documents === 'string' ? JSON.parse(clientData.required_documents) : clientData.required_documents) : { bankStatements: false, receipts: false, payrollSummaries: false },
        taskStatus: (clientData.task_status || 'waiting') as Client['taskStatus'],
        recentFiles: allRecentFiles, 
        lastInteractionNotes: clientData.last_interaction_notes || '',
        reminderSchedule: clientData.reminder_schedule ? (typeof clientData.reminder_schedule === 'string' ? JSON.parse(clientData.reminder_schedule) : clientData.reminder_schedule) : { vatReminderDays: 30, accountsReminderDays: 30, confirmationStatementReminderDays: 30 },
        customAlerts: clientData.custom_alerts ? (typeof clientData.custom_alerts === 'string' ? JSON.parse(clientData.custom_alerts) : clientData.custom_alerts) : { missedReminders: false, documentOverdue: false },
        automatedEmails: clientData.automatedEmails === true,
        lastYearTurnover: clientData.last_year_turnover || 0,
        profitLoss: clientData.profit_loss || 0,
        taxOwed: clientData.tax_owed || 0,
        notes: clientData.notes || '',
        meetingLog: clientData.meeting_log || [],
        emailHistory: clientData.email_history || [],
        shareableLinkToken: clientData.shareable_link_token || undefined,
        ai_document_status: clientData.ai_document_status,
        ai_document_notes: clientData.ai_document_notes,
        last_ai_analysis_at: clientData.last_ai_analysis_at,
      };
      setClient(formattedClient);
      setFormData(formattedClient as FormData);

      const { data: tasksData, error: tasksError } = await supabase
        .from('client_tasks')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (tasksError) throw tasksError;
      setClientTasks(tasksData || []);

      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email');

      if (profilesError) throw profilesError;
      setProfiles(profilesData || []);
      await fetchClientNotes(clientId);
      await checkBucket();

    } catch (error: unknown) { // Changed any to unknown
      console.error('Error fetching client data:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to fetch client details.'); // Type-safe error message
      setClient(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClientDataAndRelated();
    // eslint-disable-next-line react-hooks/exhaustive-deps 
  }, [clientId, refreshFiles]); // Added refreshFiles dependency

  useEffect(() => {
    const checkBucketOnMount = async () => { // Renamed to avoid conflict
      const bucketId = clientId ? `client_${clientId}` : null;
      if (!bucketId) return;

      try {
        await ensureBucketExists(bucketId);
        setIsBucketReady(true);
        console.log(`Bucket ${bucketId} is ready.`);
      } catch (error) {
        console.error('Error ensuring bucket exists: ', error);
        toast.error('Could not prepare file storage for this client.');
        setIsBucketReady(false);
      }
    };
    
    if (clientId) { // Ensure clientId is available before checking bucket
        checkBucketOnMount();
    }
  }, [clientId]);

  useEffect(() => {
    if (client?.id) {
      fetchClientNotes(client.id);
    }
  }, [client?.id]); // Removed refreshFiles, handled by main fetch now

  useEffect(() => {
    if (client?.ai_document_notes) {
      const parsedMessages = parseAiNotesToMessages(client.ai_document_notes, client.last_ai_analysis_at);
      setChatDisplayMessages(parsedMessages);
    } else {
      setChatDisplayMessages([]); 
    }
  }, [client?.ai_document_notes, client?.last_ai_analysis_at]);

  const fetchClientNotes = async (notesClientId: string) => { // Renamed parameter
    if (!notesClientId) return;
    console.log(`Fetching client notes for clientId: ${notesClientId}`); 
    const { data: notesData, error: notesError } = await supabase
      .from('client_notes')
      .select('*') 
      .eq('client_id', notesClientId)
      .order('created_at', { ascending: false }); 

    if (notesError) {
      console.error('Error fetching client notes:', notesError);
      toast.error('Failed to fetch detailed notes.');
      setDetailedClientNotes([]);
    } else {
      console.log('Fetched notesData:', notesData); 
      setDetailedClientNotes(notesData || []);
      console.log('detailedClientNotes state after set:', notesData || []); 
    }
  };
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;
  
    setFormData((prev) => {
      const keys = name.split('.');
      if (keys.length > 1) {
        const nestedState: FormData = { ...prev }; // Changed let to const, removed 'as any'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let currentLevel: any = nestedState; // Explicitly make currentLevel any for dynamic access
        for (let i = 0; i < keys.length - 1; i++) {
          currentLevel[keys[i]] = { ...(currentLevel[keys[i]] || {}) };
          currentLevel = currentLevel[keys[i]];
        }
        currentLevel[keys[keys.length - 1]] = type === 'checkbox' ? checked : (name.includes("Days") || name.includes("Turnover") || name.includes("Profit") || name.includes("Owed") ? parseFloat(value) || 0 : value);
        return nestedState as FormData;
      } else {
        return {
          ...prev,
          [name]: type === 'checkbox' ? checked : (name.includes("Days") || name.includes("Turnover") || name.includes("Profit") || name.includes("Owed") ? parseFloat(value) || 0 : value),
        } as FormData;
      }
    });
  };
  
  const handleSelectChange = (name: string, value: string | boolean) => {
     if (typeof value === 'string' && (value.toLowerCase() === 'true' || value.toLowerCase() === 'false')) {
      setFormData((prev) => ({ ...prev, [name]: value.toLowerCase() === 'true' } as FormData));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value } as FormData));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!clientId || !client) {
      toast.error('Client data is not loaded properly.');
      return;
    }
    setSaving(true);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
        toast.error('User not authenticated. Please log in again.');
        setSaving(false);
        router.push('/login');
        return;
    }

    const clientDataToSave = {
      client_name: formData.clientName,
      client_email: formData.clientEmail,
      client_phone: formData.clientPhone,
      client_role: formData.clientRole,
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
      last_interaction_notes: formData.lastInteractionNotes,
      reminder_schedule: JSON.stringify(formData.reminderSchedule), 
      custom_alerts: JSON.stringify(formData.customAlerts), 
      automatedEmails: formData.automatedEmails,
      last_year_turnover: formData.lastYearTurnover,
      profit_loss: formData.profitLoss,
      tax_owed: formData.taxOwed,
      notes: formData.notes,
      updated_by: user.id,
    };

    const { error } = await supabase
      .from('clients')
      .update(clientDataToSave)
      .eq('id', clientId);

    setSaving(false);
    if (error) {
      console.error('Error updating client:', error);
      toast.error(`Error updating client: ${error.message}`);
    } else {
      toast.success('Client updated successfully!');
      setIsEditing(false); 
      setRefreshFiles(prev => prev + 1); 
    }
  };

  function tryParseJSON(inputValue: unknown): ClientFileRecord[] { // Changed any to unknown
    console.log('Attempting to process recent_files from DB. Input type:', typeof inputValue, 'Value:', inputValue);
    if (Array.isArray(inputValue)) {
      // If it's already an array, assume it's in the correct format or needs to be validated.
      // For now, let's cast. Consider adding validation if needed.
      return inputValue as ClientFileRecord[];
    }
    if (typeof inputValue === 'string' && inputValue.trim()) {
      try {
        const parsed = JSON.parse(inputValue);
        if (Array.isArray(parsed)) {
          return parsed as ClientFileRecord[];
        } else {
          console.warn('Parsed recent_files string is not an array. Input string was:', inputValue, 'Parsed value:', parsed);
          return [];
        }
      } catch (e) {
        console.error('Error parsing JSON string for recent_files. Input string was:', inputValue, 'Error:', e);
        return [];
      }
    }
    console.log('recent_files is not a processable array or JSON string, returning []. Input was:', inputValue);
    return [];
  }

  const handleCancelEdit = () => {
    setIsEditing(false);
    if (client) { 
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, recentFiles: _recentFiles, meetingLog: _meetingLog, emailHistory: _emailHistory, shareableLinkToken: _shareableLinkToken, ...currentClientData } = client;
        const resetFormData: FormData = {
            clientName: currentClientData.clientName || '',
            clientEmail: currentClientData.clientEmail || '',
            clientPhone: currentClientData.clientPhone || '',
            clientRole: currentClientData.clientRole || '',
            preferredContactMethod: currentClientData.preferredContactMethod || 'email',
            companyName: currentClientData.companyName || '',
            companyNumber: currentClientData.companyNumber || '',
            companyAddress: currentClientData.companyAddress || '',
            sicCode: currentClientData.sicCode || '',
            companyStatus: currentClientData.companyStatus || 'active',
            incorporationDate: currentClientData.incorporationDate || '',
            yearEndDate: currentClientData.yearEndDate || '',
            nextAccountsDue: currentClientData.nextAccountsDue || '',
            nextConfirmationStatementDue: currentClientData.nextConfirmationStatementDue || '',
            vatFilingFrequency: currentClientData.vatFilingFrequency || 'quarterly',
            nextVatDue: currentClientData.nextVatDue || '',
            payrollDeadlines: currentClientData.payrollDeadlines || [],
            corporationTaxDeadline: currentClientData.corporationTaxDeadline || '',
            services: currentClientData.services || [],
            engagementLetterStatus: currentClientData.engagementLetterStatus || 'not_sent',
            requiredDocuments: currentClientData.requiredDocuments || { bankStatements: false, receipts: false, payrollSummaries: false },
            taskStatus: currentClientData.taskStatus || 'waiting',
            lastInteractionNotes: currentClientData.lastInteractionNotes || '',
            reminderSchedule: currentClientData.reminderSchedule || { vatReminderDays: 30, accountsReminderDays: 30, confirmationStatementReminderDays: 30 },
            customAlerts: currentClientData.customAlerts || { missedReminders: false, documentOverdue: false },
            automatedEmails: currentClientData.automatedEmails === undefined ? true : currentClientData.automatedEmails,
            lastYearTurnover: currentClientData.lastYearTurnover || 0,
            profitLoss: currentClientData.profitLoss || 0,
            taxOwed: currentClientData.taxOwed || 0,
            notes: currentClientData.notes || '',
        };
        setFormData(resetFormData);
    }
    toast.info("Editing cancelled.");
  };

  const handleDeleteClient = async () => {
    if (!clientId) {
      toast.error("Client ID not found.");
      return;
    }
    if (!client) {
      toast.error("Client data not loaded, cannot delete.");
      return;
    }
    const clientName = client.clientName; 
    if (window.confirm(`Are you sure you want to delete ${clientName}? This action cannot be undone.`)) {
      try {
        const { error } = await supabase
          .from('clients')
          .delete()
          .eq('id', clientId);

        if (error) throw error;
        
        toast.success('Client deleted successfully!');
        router.push('/dashboard/clients'); 
      } catch (error: unknown) { // Changed any to unknown
        console.error('Error deleting client:', error);
        toast.error('Error deleting client: ' + (error instanceof Error ? error.message : String(error))); // Safe message access
      }
    }
  };

  const handleDownloadFile = (fileUrl: string, fileName: string) => { 
    console.log('[ClientDetailPage] Attempting to download:', { fileUrl, fileName }); 
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = fileName; 
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success("Link copied to clipboard!");
    }).catch(err => {
      console.error('Failed to copy link: ', err);
      toast.error("Failed to copy link.");
    });
  };


  const handleShareClient = async () => {
    if (!clientId || !client) {
      toast.error("Client data not available.");
      return;
    }
  
    try {
      const { data, error } = await supabase.rpc('create_or_update_shareable_link', { p_client_id: clientId });
  
      if (error) {
        throw error;
      }
  
      if (data && data.new_token) {
        toast.success('Shareable link created/updated successfully!');
        setClient(prevClient => prevClient ? { ...prevClient, shareableLinkToken: data.new_token } : null);
        copyToClipboard(`${typeof window !== 'undefined' ? window.location.origin : ''}/share/${data.new_token}`);
      } else if (data && data.existing_token) {
         toast.info('Shareable link already exists and is up to date.');
         copyToClipboard(`${typeof window !== 'undefined' ? window.location.origin : ''}/share/${data.existing_token}`);
      }
       else {
        toast.info('Shareable link processed.'); 
      }
    } catch (error: unknown) { // Changed any to unknown
      console.error('Error creating/updating shareable link:', error);
      toast.error(`Failed to process shareable link: ${(error instanceof Error ? error.message : String(error))}`); // Safe message access
    }
  };

  const handleAddClientNote = async () => {
    if (!newNoteContent.trim()) {
      toast.info("Note content cannot be empty.");
      return;
    }
    if (!clientId) {
      toast.error("Client ID not found. Cannot add note.");
      return;
    }

    setAddingNote(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("User not authenticated. Please log in again.");
      setAddingNote(false);
      router.push('/login'); 
      return;
    }

    const { error } = await supabase
      .from('client_notes')
      .insert([
        {
          client_id: clientId,
          note: newNoteContent,
          created_by: user.id,
        },
      ]);

    setAddingNote(false);
    if (error) {
      console.error('Error adding client note:', error);
      toast.error(`Failed to add note: ${error.message}`);
    } else {
      toast.success('Note added successfully!');
      setNewNoteContent('');
      setRefreshFiles(prev => prev + 1);
    }
  };

  const handleDeleteClientNote = async (noteId: string) => {
    if (!window.confirm("Are you sure you want to delete this note?")) {
      return;
    }
    setDeletingNoteId(noteId);
    const { error } = await supabase
      .from('client_notes')
      .delete()
      .eq('id', noteId);
    
    setDeletingNoteId(null);
    if (error) {
      console.error('Error deleting client note:', error);
      toast.error(`Failed to delete note: ${error.message}`);
    } else {
      toast.success('Note deleted successfully!');
      setRefreshFiles(prev => prev + 1);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch { // Removed unused error variable
      return 'Invalid date';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'dormant':
        return 'bg-amber-100 text-amber-800';
      case 'dissolved':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleUploadComplete = async (fileUrl: string, fileName: string) => { 
    if (!clientId) return;
    console.log('File upload complete:', { fileUrl, fileName });
    setIsUploadDialogOpen(false);
    const newFileRecord: ClientFileRecord = {
      fileName,
      fileUrl,
    };
    const updatedRecentFiles = [newFileRecord, ...(client?.recentFiles || [])];

    try {
      const { error: updateError } = await supabase
        .from('clients')
        .update({ recent_files: updatedRecentFiles }) 
        .eq('id', clientId);

      if (updateError) {
        console.error('Error updating client record with new file:', updateError);
        toast.error(`Error saving file information: ${updateError.message}`);
      } else {
        toast.success(`File '${fileName}' added to client records.`);
        setClient(prevClient => {
          if (!prevClient) return null;
          return { ...prevClient, recentFiles: updatedRecentFiles };
        });
        setRefreshFiles(prev => prev + 1); 
      }
    } catch (error) {
      console.error('An unexpected error occurred while updating client record:', error);
      toast.error('An unexpected error occurred while saving file information.');
    }
  };
  
  const handleMoveToNextStage = async (taskId: string) => {
    const taskToMove = clientTasks.find(task => task.id === taskId);
    if (!taskToMove) return;

    const currentStageIndex = workflowStages.indexOf(taskToMove.stage);
    if (currentStageIndex === -1 || currentStageIndex >= workflowStages.length - 1 || taskToMove.stage === 'On Hold / Blocked') {
      console.log('Task is in the last stage or On Hold/Blocked, cannot move further automatically.');
      return;
    }

    const nextStage = workflowStages[currentStageIndex + 1];
    const originalStage = taskToMove.stage;

    setClientTasks(prevTasks => prevTasks.map(task => task.id === taskId ? { ...task, stage: nextStage } : task));

    try {
      const { error: updateError } = await supabase
        .from('client_tasks')
        .update({ stage: nextStage })
        .eq('id', taskId);
      if (updateError) throw updateError;
      toast.success(`Task moved to: ${nextStage}`);
    } catch (err: unknown) { // Changed any to unknown
      console.error('Failed to update task stage:', err);
      setClientTasks(prevTasks => prevTasks.map(task => task.id === taskId ? { ...task, stage: originalStage } : task));
      toast.error('Failed to move task. Please try again. Error: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!window.confirm("Are you sure you want to clear this task? This action cannot be undone.")) {
      return;
    }
    try {
      const { error: deleteError } = await supabase
        .from('client_tasks')
        .delete()
        .eq('id', taskId);
      if (deleteError) throw deleteError;
      setClientTasks(prevTasks => prevTasks.filter(task => task.id !== taskId));
      toast.success('Task cleared successfully.');
    } catch (err: unknown) { // Changed any to unknown
      console.error('Failed to delete task:', err);
      toast.error('Failed to clear task. Ensure RLS allows delete. Error: ' + (err instanceof Error ? err.message : String(err)));
    }
  };
  
  const handleAnalyzeDocuments = async () => {
    if (!client || !client.id) {
      toast.error("Client data not available to start analysis.");
      return;
    }
    const userActionMessage: ChatMessage = {
      id: `user-action-${Date.now()}`,
      type: 'user',
      content: "Requesting full document analysis...",
      timestamp: new Date().toISOString(),
    };
    setChatDisplayMessages(prev => [...prev, userActionMessage]);
    setCustomUserQuestion(''); 

    setIsAnalyzing(true);
    setAnalysisError(null);
    let stepIndex = 0;
    if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
    typingIntervalRef.current = setInterval(() => {
      stepIndex++;
      if (stepIndex < aiProcessingSteps.length) {
      } 
    }, 2500); 

    try {
      if (!client) return; 
      const response = await fetch('/api/analyze-documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          clientId: client.id,
          analysisType: 'full_analysis'
        }),
      });

      const responseData = await response.json();

      if (!response.ok || !responseData.success) {
        throw new Error(responseData.error || responseData.message || `API request failed with status ${response.status}`);
      }

      console.log('Full AI analysis API response:', responseData);
      toast.success('Full AI analysis complete!');
      
      setClient(prevClient => {
        if (!prevClient) return null;
        return {
          ...prevClient,
          ai_document_status: responseData.analysis?.status as Client['ai_document_status'],
          ai_document_notes: responseData.analysis?.notes,
          last_ai_analysis_at: new Date().toISOString(), 
        };
      });

    } catch (e: unknown) { // Changed any to unknown
      console.error('Error during full AI analysis:', e);
      const errorMsg = (e instanceof Error ? e.message : String(e)) || 'An unexpected error occurred during full analysis.';
      setAnalysisError(errorMsg);
      toast.error(`Full AI analysis failed: ${errorMsg}`);
    } finally {
      setIsAnalyzing(false);
      if (typingIntervalRef.current) clearInterval(typingIntervalRef.current); // Clear interval here
    }
  };

  const handleAskCustomQuestion = async () => {
    if (!client || !client.id) {
      toast.error("Client data not available for custom question.");
      return;
    }
    if (!customUserQuestion.trim()) {
      toast.info("Please enter a question.");
      return;
    }
    const userMessage: ChatMessage = {
      id: `user-q-${Date.now()}`,
      type: 'user',
      content: customUserQuestion,
      timestamp: new Date().toISOString(),
    };
    setChatDisplayMessages(prev => [...prev, userMessage]);

    setIsAskingQuestion(true);
    setAnalysisError(null);
    let stepIndex = 0;
    const questionSteps = ["Thinking...", "Searching documents for relevant information...", "Formulating answer..."];
    if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
    typingIntervalRef.current = setInterval(() => {
      stepIndex++;
      if (stepIndex < questionSteps.length) {
      } 
    }, 2000);

    try {
      if (!client) return; 
      const response = await fetch('/api/analyze-documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientId: client.id,
          customQuestion: customUserQuestion,
          analysisType: 'question'
        }),
      });

      const responseData = await response.json();

      if (!response.ok || !responseData.success) {
        throw new Error(responseData.error || responseData.message || `API request failed with status ${response.status}`);
      }

      console.log('Custom question AI response:', responseData);
      toast.success('AI has responded to your question!');
      
      setClient(prevClient => {
        if (!prevClient) return null;
        return {
          ...prevClient,
          ai_document_notes: responseData.analysis?.notes, 
        };
      });
      setCustomUserQuestion(''); 

    } catch (e: unknown) { // Changed any to unknown
      console.error('Error during custom AI question:', e);
      const errorMsg = (e instanceof Error ? e.message : String(e)) || 'An unexpected error occurred while asking the question.';
      setAnalysisError(errorMsg);
      toast.error(`Failed to get answer: ${errorMsg}`);
    } finally {
      setIsAskingQuestion(false);
      if (typingIntervalRef.current) clearInterval(typingIntervalRef.current); // Clear interval here
    }
  };
  
  function parseAiNotesToMessages(aiNotesString: string | null | undefined, initialAnalysisTimestamp?: string | null): ChatMessage[] {
    if (!aiNotesString?.trim()) {
      return [];
    }

    const messages: ChatMessage[] = [];
    let messageIdCounter = 0;

    const qnaSeparator = "\\n\\n---\\n"; // Use escaped newlines for regex split
    const segments = aiNotesString.split(new RegExp(qnaSeparator.replace(/\\n/g, '\\n')));


    const firstSegment = segments.shift()?.trim();

    if (firstSegment) {
      const userQuestionPattern = /\*\*User Question \(answered on (.*?)\):\*\*\s*([\s\S]*?)(?=\n\*\*AI Answer:\*\*|$)/;
      const isFirstSegmentQnA = userQuestionPattern.test(firstSegment);

      if (isFirstSegmentQnA) {
        segments.unshift(firstSegment); 
      } else {
        messages.push({
          id: `msg-${messageIdCounter++}`,
          type: 'system_report',
          content: firstSegment,
          timestamp: initialAnalysisTimestamp || undefined,
          isFullReport: true,
        });
      }
    }

    for (const segment of segments) {
      const trimmedSegment = segment.trim();
      if (!trimmedSegment) continue;

      const userQuestionMatch = trimmedSegment.match(/\*\*User Question \(answered on (.*?)\):\*\*\s*([\s\S]*?)(?=\n\*\*AI Answer:\*\*|$)/);
      const aiAnswerMatch = trimmedSegment.match(/\*\*AI Answer:\*\*\s*([\s\S]*)/);

      if (userQuestionMatch) {
        messages.push({
          id: `msg-${messageIdCounter++}`,
          type: 'user',
          content: userQuestionMatch[2].trim(),
          timestamp: userQuestionMatch[1].trim(),
        });
      }

      if (aiAnswerMatch) {
        messages.push({
          id: `msg-${messageIdCounter++}`,
          type: 'ai',
          content: aiAnswerMatch[1].trim(),
        });
      } else if (!userQuestionMatch && trimmedSegment && messages[messages.length -1]?.type !== 'user') {
           messages.push({
             id: `msg-${messageIdCounter++}`,
             type: 'ai',
             content: trimmedSegment,
           });
      }
    }
    return messages;
  }

  // Function to handle deleting an alert
  const handleDeleteAlert = async (alertId: string) => {
    if (!window.confirm('Are you sure you want to delete this alert?')) {
      return;
    }
    try {
      const response = await fetch(`${apiBaseUrl}/client-alerts/${alertId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete alert');
      }
      toast.success('Client alert deleted successfully!');
      if (clientId && typeof clientId === 'string') {
        fetchClientAlertsForCurrentClient(clientId);
      }
    } catch (error) {
      console.error('Error deleting client alert:', error);
      toast.error((error as Error).message || 'Could not delete client alert.');
    }
  };
  
  const handleOpenCreateAlertForm = () => {
    setEditingAlert(null);
    setShowEditAlertForm(false); // Ensure edit form is hidden
    setShowCreateAlertForm(true); // Show create form
  };

  const handleOpenEditAlertForm = (alert: YourClientAlertType) => {
    setShowCreateAlertForm(false); // Ensure create form is hidden
    setEditingAlert(alert);
    setShowEditAlertForm(true); // Show edit form
  };

  const handleAlertFormSuccess = (message: string) => {
    toast.success(message);
    setShowCreateAlertForm(false);
    setShowEditAlertForm(false);
    setEditingAlert(null);
    if (clientId && typeof clientId === 'string') {
      fetchClientAlertsForCurrentClient(clientId);
    }
  };

  // Add a function to test an alert
  const handleTestAlert = async (alertId: string) => {
    if (testingAlertId === alertId) return; // Already testing this alert
    
    try {
      setTestingAlertId(alertId);
      
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user?.email) {
        toast.error("Unable to get your email address. Please ensure you're logged in.");
        setTestingAlertId(null); // Reset testing state
        return;
      }

      const response = await fetch(`${apiBaseUrl}/testing/trigger-single-alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_alert_id: alertId,
          test_email: user.email
        }),
      });

      // No early throw, let's parse JSON for all responses
      const result = await response.json(); 

      if (!response.ok) {
        // For non-ok responses, result.error or result.message should contain the error info from the API
        throw new Error(result.error || result.message || `Failed to test alert sequence. Status: ${response.status}`);
      }

      // Handle successful responses (200 and 207)
      if (response.status === 207) { // HTTP 207 Multi-Status, indicates partial success
        toast.warning(result.message || `Test email sequence partially completed. Check console for details.`);
        if (result.errors && result.errors.length > 0) {
          console.warn("Test email sequence errors:", result.errors);
        }
      } else { // HTTP 200 OK
        toast.success(result.message || `Test email sequence initiated successfully.`);
      }

    } catch (error) {
      console.error("Error testing alert:", error);
      toast.error((error as Error).message || "Failed to test the alert sequence");
    } finally {
      setTestingAlertId(null);
    }
  };

  // New handler for services & engagement inline edit mode
  const handleEditServices = () => {
    if (client) {
      setServicesFormData({
        services: client.services || [],
        vatFilingFrequency: client.vatFilingFrequency || 'quarterly',
        engagementLetterStatus: client.engagementLetterStatus || 'not_sent'
      });
      setIsEditingServices(true);
    }
  };

  // New handler for services data changes
  const handleServicesChange = (name: string, value: ServicesFormValue) => {
    setServicesFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // New handler to save just the services & engagement data
  const handleSaveServices = async () => {
    if (!clientId || !client) {
      toast.error('Client data is not loaded properly.');
      return;
    }
    setSavingServices(true);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
        toast.error('User not authenticated. Please log in again.');
        setSavingServices(false);
        router.push('/login');
        return;
    }

    const servicesDataToSave = {
      services: servicesFormData.services,
      vat_filing_frequency: servicesFormData.vatFilingFrequency,
      engagement_letter_signed: servicesFormData.engagementLetterStatus === 'signed' ? true : 
                               (servicesFormData.engagementLetterStatus === 'pending' ? null : false),
      updated_by: user.id,
    };

    const { error } = await supabase
      .from('clients')
      .update(servicesDataToSave)
      .eq('id', clientId);

    setSavingServices(false);
    if (error) {
      console.error('Error updating services:', error);
      toast.error(`Error updating services: ${error.message}`);
    } else {
      toast.success('Services updated successfully!');
      setIsEditingServices(false);
      
      // Update client state with new values
      setClient(prevClient => {
        if (!prevClient) return null;
        return {
          ...prevClient,
          services: servicesFormData.services,
          vatFilingFrequency: servicesFormData.vatFilingFrequency,
          engagementLetterStatus: servicesFormData.engagementLetterStatus
        };
      });
    }
  };

  // New handler to cancel services edit
  const handleCancelServicesEdit = () => {
    setIsEditingServices(false);
  };

  // Handler for Client Information edit mode
  const handleEditClientInfo = () => {
    if (client) {
      setClientInfoFormData({
        clientName: client.clientName || '',
        clientRole: client.clientRole || '',
        clientEmail: client.clientEmail || '',
        clientPhone: client.clientPhone || '',
        preferredContactMethod: client.preferredContactMethod || 'email'
      });
      setIsEditingClientInfo(true);
    }
  };
  
  // Handler for Client Information changes
  const handleClientInfoChange = (name: string, value: string) => {
    setClientInfoFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // Handler to save Client Information
  const handleSaveClientInfo = async () => {
    if (!clientId || !client) {
      toast.error('Client data is not loaded properly.');
      return;
    }
    setSavingClientInfo(true);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
        toast.error('User not authenticated. Please log in again.');
        setSavingClientInfo(false);
        router.push('/login');
        return;
    }

    const clientInfoToSave = {
      client_name: clientInfoFormData.clientName,
      client_email: clientInfoFormData.clientEmail,
      client_phone: clientInfoFormData.clientPhone,
      client_role: clientInfoFormData.clientRole,
      preferred_contact_method: clientInfoFormData.preferredContactMethod,
      updated_by: user.id,
    };

    const { error } = await supabase
      .from('clients')
      .update(clientInfoToSave)
      .eq('id', clientId);

    setSavingClientInfo(false);
    if (error) {
      console.error('Error updating client information:', error);
      toast.error(`Error updating client information: ${error.message}`);
    } else {
      toast.success('Client information updated successfully!');
      setIsEditingClientInfo(false);
      
      // Update client state with new values
      setClient(prevClient => {
        if (!prevClient) return null;
        return {
          ...prevClient,
          clientName: clientInfoFormData.clientName,
          clientRole: clientInfoFormData.clientRole,
          clientEmail: clientInfoFormData.clientEmail,
          clientPhone: clientInfoFormData.clientPhone,
          preferredContactMethod: clientInfoFormData.preferredContactMethod
        };
      });
    }
  };
  
  // Handler to cancel Client Information edit
  const handleCancelClientInfoEdit = () => {
    setIsEditingClientInfo(false);
  };
  
  // Handler for Key Dates edit mode
  const handleEditDates = () => {
    if (client) {
      setDatesFormData({
        yearEndDate: client.yearEndDate || '',
        nextAccountsDue: client.nextAccountsDue || '',
        nextConfirmationStatementDue: client.nextConfirmationStatementDue || '',
        nextVatDue: client.nextVatDue || '',
        corporationTaxDeadline: client.corporationTaxDeadline || ''
      });
      setIsEditingDates(true);
    }
  };
  
  // Handler for Key Dates changes
  const handleDatesChange = (name: string, value: string) => {
    setDatesFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // Handler to save Key Dates
  const handleSaveDates = async () => {
    if (!clientId || !client) {
      toast.error('Client data is not loaded properly.');
      return;
    }
    setSavingDates(true);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
        toast.error('User not authenticated. Please log in again.');
        setSavingDates(false);
        router.push('/login');
        return;
    }

    const datesToSave = {
      year_end_date: datesFormData.yearEndDate || null,
      next_accounts_due: datesFormData.nextAccountsDue || null,
      next_confirmation_statement_due: datesFormData.nextConfirmationStatementDue || null,
      next_vat_due: datesFormData.nextVatDue || null,
      corporation_tax_deadline: datesFormData.corporationTaxDeadline || null,
      updated_by: user.id,
    };

    const { error } = await supabase
      .from('clients')
      .update(datesToSave)
      .eq('id', clientId);

    setSavingDates(false);
    if (error) {
      console.error('Error updating key dates:', error);
      toast.error(`Error updating key dates: ${error.message}`);
    } else {
      toast.success('Key dates updated successfully!');
      setIsEditingDates(false);
      
      // Update client state with new values
      setClient(prevClient => {
        if (!prevClient) return null;
        return {
          ...prevClient,
          yearEndDate: datesFormData.yearEndDate,
          nextAccountsDue: datesFormData.nextAccountsDue,
          nextConfirmationStatementDue: datesFormData.nextConfirmationStatementDue,
          nextVatDue: datesFormData.nextVatDue,
          corporationTaxDeadline: datesFormData.corporationTaxDeadline
        };
      });
    }
  };
  
  // Handler to cancel Key Dates edit
  const handleCancelDatesEdit = () => {
    setIsEditingDates(false);
  };

  useEffect(() => {
    fetchClientDataAndRelated();
    // eslint-disable-next-line react-hooks/exhaustive-deps 
  }, [clientId, refreshFiles]); // Added refreshFiles dependency

  useEffect(() => {
    const checkBucketOnMount = async () => { // Renamed to avoid conflict
      const bucketId = clientId ? `client_${clientId}` : null;
      if (!bucketId) return;

      try {
        await ensureBucketExists(bucketId);
        setIsBucketReady(true);
        console.log(`Bucket ${bucketId} is ready.`);
      } catch (error) {
        console.error('Error ensuring bucket exists: ', error);
        toast.error('Could not prepare file storage for this client.');
        setIsBucketReady(false);
      }
    };
    
    if (clientId) { // Ensure clientId is available before checking bucket
        checkBucketOnMount();
    }
  }, [clientId]);

  useEffect(() => {
    if (client?.id) {
      fetchClientNotes(client.id);
    }
  }, [client?.id]); // Removed refreshFiles, handled by main fetch now

  useEffect(() => {
    if (client?.ai_document_notes) {
      const parsedMessages = parseAiNotesToMessages(client.ai_document_notes, client.last_ai_analysis_at);
      setChatDisplayMessages(parsedMessages);
    } else {
      setChatDisplayMessages([]); 
    }
  }, [client?.ai_document_notes, client?.last_ai_analysis_at]);

  const handleToggleAlertActive = async (alertId: string, newIsActive: boolean) => {
    const originalAlerts = [...clientAlerts];
    const updatedAlerts = clientAlerts.map(alert =>
      alert.id === alertId ? { ...alert, is_active: newIsActive } : alert
    );
    setClientAlerts(updatedAlerts); // Optimistic update

    try {
      const response = await fetch(`${apiBaseUrl}/client-alerts/${alertId}/toggle-active`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_active: newIsActive }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        // Attempt to re-fetch to ensure UI consistency after error before reverting fully
        if (clientId && typeof clientId === 'string') {
          fetchClientAlertsForCurrentClient(clientId);
        }
        throw new Error(errorData.error || 'Failed to update alert status');
      }
      // If API call is successful, the optimistic update is correct.
      toast.success(`Alert ${newIsActive ? 'activated' : 'deactivated'} successfully.`);
      // Optionally re-fetch to get the most up-to-date state from server, though optimistic should be fine.
      // if (clientId && typeof clientId === 'string') {
      //   fetchClientAlertsForCurrentClient(clientId);
      // }

    } catch (error) {
      console.error("Error toggling alert status:", error);
      toast.error((error as Error).message || 'Could not update alert status.');
      setClientAlerts(originalAlerts); // Revert optimistic update on error
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <div className="text-2xl font-semibold text-[#1a365d]">Loading client details...</div>
        </div>
      </div>
    );
  }

  if (error && !client) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <div className="text-2xl font-semibold text-[#1a365d]">Client not found or failed to load.</div>
          <Button 
            onClick={() => router.push('/dashboard/clients')}
            variant="outline"
            className="mt-4"
          >
            Back to Clients
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center">
          <Button 
            variant="outline" 
            className="mr-4 border-gray-200 hover:bg-gray-50 transition-colors"
            onClick={() => isEditing ? handleCancelEdit() : router.push('/dashboard/clients')}
            disabled={saving}
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            {isEditing ? 'Cancel Edit' : 'Back to Clients'}
          </Button>
          {client && !isEditing && (
            <>
              <h1 className="text-3xl font-bold text-[#1a365d]">{client.clientName}</h1>
              <Badge 
                className={`ml-4 ${getStatusColor(client.companyStatus)}`}
              >
                {client.companyStatus}
              </Badge>
            </>
          )}
          {isEditing && client && (
             <h1 className="text-3xl font-bold text-[#1a365d]">Editing: {client.clientName}</h1>
          )}
        </div>
        <div className="flex gap-2">
          {client && !isEditing && (
            <>
              <Button
                variant="outline"
                className="border-gray-200 hover:bg-gray-50 transition-colors"
                onClick={() => handleShareClient()}
                disabled={saving}
              >
                <Copy className="mr-2 h-4 w-4" />
                {client.shareableLinkToken ? 'Copy Share Link' : 'Create Share Link'}
              </Button>
              <Button
                variant="outline"
                className="border-gray-200 hover:bg-gray-50 transition-colors text-amber-600 hover:text-amber-700"
                onClick={() => setIsEditing(true)}
                disabled={saving}
              >
                <Edit className="mr-2 h-4 w-4" />
                Edit Client
              </Button>
              <Button
                variant="outline"
                className="border-gray-200 hover:bg-red-50 transition-colors text-red-600 hover:text-red-700"
                onClick={handleDeleteClient}
                disabled={saving}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </>
          )}
          {isEditing && (
            <>
              <Button
                variant="outline"
                className="border-gray-200 hover:bg-gray-50 transition-colors"
                onClick={handleCancelEdit}
                disabled={saving}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button
                className="bg-primary hover:bg-primary/90 text-white transition-colors"
                onClick={handleSubmit}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>

      {isEditing ? (
        <Card>
          <CardHeader>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-700 border-b pb-2">Basic Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label htmlFor="clientName">Client Name</Label>
                    <Input id="clientName" name="clientName" value={formData.clientName} onChange={handleChange} placeholder="Client Name" required />
                  </div>
                  <div>
                    <Label htmlFor="clientEmail">Email</Label>
                    <Input id="clientEmail" name="clientEmail" type="email" value={formData.clientEmail} onChange={handleChange} placeholder="client@example.com" />
                  </div>
                  <div>
                    <Label htmlFor="clientPhone">Phone</Label>
                    <Input id="clientPhone" name="clientPhone" value={formData.clientPhone} onChange={handleChange} placeholder="Client Phone" />
                  </div>
                  <div>
                    <Label htmlFor="clientRole">Role</Label>
                    <Select name="clientRole" value={formData.clientRole} onValueChange={(value) => handleSelectChange('clientRole', value)}>
                      <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="director">Director</SelectItem>
                        <SelectItem value="sole-trader">Sole Trader</SelectItem>
                        <SelectItem value="bookkeeper">Bookkeeper</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="preferredContactMethod">Preferred Contact Method</Label>
                    <Select name="preferredContactMethod" value={formData.preferredContactMethod} onValueChange={(value) => handleSelectChange('preferredContactMethod', value)}>
                      <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="sms">SMS</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="phone">Phone</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-700 border-b pb-2">Company Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label htmlFor="companyName">Company Name</Label>
                    <Input id="companyName" name="companyName" value={formData.companyName} onChange={handleChange} placeholder="Company Name" />
                  </div>
                  <div>
                    <Label htmlFor="companyNumber">Company Number</Label>
                    <Input id="companyNumber" name="companyNumber" value={formData.companyNumber} onChange={handleChange} placeholder="Company Number" />
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="companyAddress">Company Address</Label>
                    <Input id="companyAddress" name="companyAddress" value={formData.companyAddress} onChange={handleChange} placeholder="Company Address" />
                  </div>
                  <div>
                    <Label htmlFor="sicCode">SIC Code</Label>
                    <Input id="sicCode" name="sicCode" value={formData.sicCode} onChange={handleChange} placeholder="SIC Code" />
                  </div>
                  <div>
                    <Label htmlFor="companyStatus">Company Status</Label>
                    <Select name="companyStatus" value={formData.companyStatus} onValueChange={(value) => handleSelectChange('companyStatus', value)}>
                      <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="dormant">Dormant</SelectItem>
                        <SelectItem value="dissolved">Dissolved</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="incorporationDate">Incorporation Date</Label>
                    <Input id="incorporationDate" name="incorporationDate" type="date" value={formData.incorporationDate} onChange={handleChange} />
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-700 border-b pb-2">Key Dates</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label htmlFor="yearEndDate">Year End Date</Label>
                    <Input id="yearEndDate" name="yearEndDate" type="date" value={formData.yearEndDate} onChange={handleChange} />
                  </div>
                  <div>
                    <Label htmlFor="nextAccountsDue">Next Accounts Due</Label>
                    <Input id="nextAccountsDue" name="nextAccountsDue" type="date" value={formData.nextAccountsDue} onChange={handleChange} />
                  </div>
                  <div>
                    <Label htmlFor="nextConfirmationStatementDue">Next Confirmation Statement Due</Label>
                    <Input id="nextConfirmationStatementDue" name="nextConfirmationStatementDue" type="date" value={formData.nextConfirmationStatementDue} onChange={handleChange} />
                  </div>
                  <div>
                    <Label htmlFor="vatFilingFrequency">VAT Filing Frequency</Label>
                    <Select name="vatFilingFrequency" value={formData.vatFilingFrequency} onValueChange={(value) => handleSelectChange('vatFilingFrequency', value)}>
                      <SelectTrigger><SelectValue placeholder="Select frequency" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="annually">Annually</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="nextVatDue">Next VAT Due</Label>
                    <Input id="nextVatDue" name="nextVatDue" type="date" value={formData.nextVatDue} onChange={handleChange} />
                  </div>
                  <div>
                    <Label htmlFor="corporationTaxDeadline">Corporation Tax Deadline</Label>
                    <Input id="corporationTaxDeadline" name="corporationTaxDeadline" type="date" value={formData.corporationTaxDeadline} onChange={handleChange} />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-700 border-b pb-2">Services & Engagement</h3>
                <div>
                  <Label htmlFor="engagementLetterStatus">Engagement Letter Status</Label>
                  <Select name="engagementLetterStatus" value={formData.engagementLetterStatus} onValueChange={(value) => handleSelectChange('engagementLetterStatus', value)}>
                    <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="signed">Signed</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="not_sent">Not Sent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-700 border-b pb-2">Financial Summary</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <Label htmlFor="lastYearTurnover">Last Year Turnover (£)</Label>
                    <Input id="lastYearTurnover" name="lastYearTurnover" type="number" value={formData.lastYearTurnover} onChange={handleChange} placeholder="e.g., 50000" />
                  </div>
                  <div>
                    <Label htmlFor="profitLoss">Profit/Loss (£)</Label>
                    <Input id="profitLoss" name="profitLoss" type="number" value={formData.profitLoss} onChange={handleChange} placeholder="e.g., 10000" />
                  </div>
                  <div>
                    <Label htmlFor="taxOwed">Tax Owed (£)</Label>
                    <Input id="taxOwed" name="taxOwed" type="number" value={formData.taxOwed} onChange={handleChange} placeholder="e.g., 2000" />
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-700 border-b pb-2">Notes</h3>
                <div>
                  <Label htmlFor="notes">General Notes</Label>
                  <Textarea id="notes" name="notes" value={formData.notes} onChange={handleChange} placeholder="Enter any general notes for this client" rows={5} />
                </div>
                <div>
                  <Label htmlFor="lastInteractionNotes">Last Interaction Notes</Label>
                  <Textarea id="lastInteractionNotes" name="lastInteractionNotes" value={formData.lastInteractionNotes} onChange={handleChange} placeholder="Notes from last call/meeting" rows={3} />
                </div>
              </div>

              <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-700 border-b pb-2">Automation Settings</h3>
                  <div>
                    <Label htmlFor="automatedEmails">Automated Emails Enabled</Label>
                    <Select name="automatedEmails" value={String(formData.automatedEmails)} onValueChange={(value) => handleSelectChange('automatedEmails', value === 'true')}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Yes</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                          <Label htmlFor="reminderSchedule.vatReminderDays">VAT Reminder (Days Before)</Label>
                          <Input id="reminderSchedule.vatReminderDays" name="reminderSchedule.vatReminderDays" type="number" value={formData.reminderSchedule.vatReminderDays} onChange={handleChange} />
                      </div>
                      <div>
                          <Label htmlFor="reminderSchedule.accountsReminderDays">Accounts Reminder (Days Before)</Label>
                          <Input id="reminderSchedule.accountsReminderDays" name="reminderSchedule.accountsReminderDays" type="number" value={formData.reminderSchedule.accountsReminderDays} onChange={handleChange} />
                      </div>
                      <div>
                          <Label htmlFor="reminderSchedule.confirmationStatementReminderDays">Confirmation St. Reminder (Days Before)</Label>
                          <Input id="reminderSchedule.confirmationStatementReminderDays" name="reminderSchedule.confirmationStatementReminderDays" type="number" value={formData.reminderSchedule.confirmationStatementReminderDays} onChange={handleChange} />
                      </div>
                  </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-700 border-b pb-2">Required Documents Checklist</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="flex items-center space-x-2">
                    <Input type="checkbox" id="requiredDocuments.bankStatements" name="requiredDocuments.bankStatements" checked={formData.requiredDocuments.bankStatements} onChange={handleChange} className="h-5 w-5"/>
                    <Label htmlFor="requiredDocuments.bankStatements">Bank Statements</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Input type="checkbox" id="requiredDocuments.receipts" name="requiredDocuments.receipts" checked={formData.requiredDocuments.receipts} onChange={handleChange} className="h-5 w-5"/>
                    <Label htmlFor="requiredDocuments.receipts">Receipts</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Input type="checkbox" id="requiredDocuments.payrollSummaries" name="requiredDocuments.payrollSummaries" checked={formData.requiredDocuments.payrollSummaries} onChange={handleChange} className="h-5 w-5"/>
                    <Label htmlFor="requiredDocuments.payrollSummaries">Payroll Summaries</Label>
                  </div>
                </div>
              </div>


              <div className="flex justify-end space-x-4 pt-6 border-t">
                <Button 
                  variant="outline" 
                  type="button" 
                  onClick={handleCancelEdit}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={saving}
                  className="bg-[#1a365d] hover:bg-[#122a47] text-white"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : client ? (
        <div className="space-y-6">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="bg-gray-100 p-1 mb-6 rounded-lg grid grid-cols-5 gap-2 w-full md:w-auto">
              <TabsTrigger 
                value="overview" 
                className="data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-md transition-all"
              >
                Overview
              </TabsTrigger>
              <TabsTrigger 
                value="documents" 
                className="data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-md transition-all"
              >
                Documents
              </TabsTrigger>
              <TabsTrigger 
                value="tasks" 
                className="data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-md transition-all"
              >
                Tasks
              </TabsTrigger>
              <TabsTrigger 
                value="notes" 
                className="data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-md transition-all"
              >
                Notes
              </TabsTrigger>
              <TabsTrigger 
                value="alerts" 
                className="data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-md transition-all"
              >
                Alerts
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="border-gray-200 shadow-sm hover:shadow-md transition-all">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xl text-[#1a365d] flex items-center justify-between">
                      <div className="flex items-center">
                        <UserIcon className="h-5 w-5 mr-2 text-primary/70" />
                        Client Information
                      </div>
                      {!isEditing && (
                        <div>
                          {isEditingClientInfo ? (
                            <div className="flex gap-2">
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="h-7 text-gray-500"
                                onClick={handleCancelClientInfoEdit}
                                disabled={savingClientInfo}
                              >
                                <XCircle className="h-4 w-4 mr-1" />
                                Cancel
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="h-7 text-primary"
                                onClick={handleSaveClientInfo}
                                disabled={savingClientInfo}
                              >
                                {savingClientInfo ? (
                                  <>
                                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary mr-1"></div>
                                    Saving...
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle className="h-4 w-4 mr-1" />
                                    Save
                                  </>
                                )}
                              </Button>
                            </div>
                          ) : (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="h-7 text-gray-500"
                              onClick={handleEditClientInfo}
                            >
                              <Edit className="h-4 w-4 mr-1" />
                              Edit
                            </Button>
                          )}
                        </div>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {isEditingClientInfo ? (
                      <>
                        <div>
                          <Label htmlFor="clientName" className="mb-1 block text-xs text-gray-500">Name</Label>
                          <Input 
                            id="clientName" 
                            value={clientInfoFormData.clientName} 
                            onChange={(e) => handleClientInfoChange('clientName', e.target.value)}
                            className="h-9"
                          />
                        </div>
                        <div>
                          <Label htmlFor="clientRole" className="mb-1 block text-xs text-gray-500">Role</Label>
                          <Select 
                            value={clientInfoFormData.clientRole} 
                            onValueChange={(value) => handleClientInfoChange('clientRole', value)}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="director">Director</SelectItem>
                              <SelectItem value="sole-trader">Sole Trader</SelectItem>
                              <SelectItem value="bookkeeper">Bookkeeper</SelectItem>
                              <SelectItem value="accountant">Accountant</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="clientEmail" className="mb-1 block text-xs text-gray-500">Email</Label>
                          <Input 
                            id="clientEmail" 
                            type="email"
                            value={clientInfoFormData.clientEmail} 
                            onChange={(e) => handleClientInfoChange('clientEmail', e.target.value)}
                            className="h-9"
                          />
                        </div>
                        <div>
                          <Label htmlFor="clientPhone" className="mb-1 block text-xs text-gray-500">Phone</Label>
                          <Input 
                            id="clientPhone" 
                            value={clientInfoFormData.clientPhone} 
                            onChange={(e) => handleClientInfoChange('clientPhone', e.target.value)}
                            className="h-9"
                          />
                        </div>
                        <div>
                          <Label htmlFor="preferredContactMethod" className="mb-1 block text-xs text-gray-500">Preferred Contact Method</Label>
                          <Select 
                            value={clientInfoFormData.preferredContactMethod} 
                            onValueChange={(value) => handleClientInfoChange('preferredContactMethod', value)}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="email">Email</SelectItem>
                              <SelectItem value="sms">SMS</SelectItem>
                              <SelectItem value="whatsapp">WhatsApp</SelectItem>
                              <SelectItem value="phone">Phone</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <div className="text-sm text-gray-500">Name</div>
                            <div className="font-medium">{client.clientName}</div>
                          </div>
                          <div>
                            <div className="text-sm text-gray-500">Role</div>
                            <div className="font-medium">{client.clientRole}</div>
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-500">Email</div>
                          <div className="font-medium flex items-center">
                            <Mail className="h-4 w-4 mr-2 text-primary/70" />
                            <a href={`mailto:${client.clientEmail}`} className="text-blue-600 hover:underline">
                              {client.clientEmail}
                            </a>
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-500">Phone</div>
                          <div className="font-medium flex items-center">
                            <Phone className="h-4 w-4 mr-2 text-primary/70" />
                            <a href={`tel:${client.clientPhone}`} className="text-blue-600 hover:underline">
                              {client.clientPhone}
                            </a>
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-500">Preferred Contact Method</div>
                          <div className="font-medium">{client.preferredContactMethod}</div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-gray-200 shadow-sm hover:shadow-md transition-all">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xl text-[#1a365d] flex items-center">
                      <Building2 className="h-5 w-5 mr-2 text-primary/70" />
                      Company Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="text-sm text-gray-500">Company Name</div>
                      <div className="font-medium flex items-center">
                        {client.companyName}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">Company Number</div>
                      <div className="font-medium">{client.companyNumber}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">SIC Code</div>
                      <div className="font-medium">{client.sicCode}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">Incorporation Date</div>
                      <div className="font-medium">{formatDate(client.incorporationDate)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">Registered Office Address</div>
                      <div className="font-medium whitespace-pre-line">{client.companyAddress}</div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="border-gray-200 shadow-sm hover:shadow-md transition-all">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xl text-[#1a365d] flex items-center justify-between">
                      <div className="flex items-center">
                        <Calendar className="h-5 w-5 mr-2 text-primary/70" />
                        Key Dates
                      </div>
                      {!isEditing && (
                        <div>
                          {isEditingDates ? (
                            <div className="flex gap-2">
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="h-7 text-gray-500"
                                onClick={handleCancelDatesEdit}
                                disabled={savingDates}
                              >
                                <XCircle className="h-4 w-4 mr-1" />
                                Cancel
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="h-7 text-primary"
                                onClick={handleSaveDates}
                                disabled={savingDates}
                              >
                                {savingDates ? (
                                  <>
                                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary mr-1"></div>
                                    Saving...
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle className="h-4 w-4 mr-1" />
                                    Save
                                  </>
                                )}
                              </Button>
                            </div>
                          ) : (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="h-7 text-gray-500"
                              onClick={handleEditDates}
                            >
                              <Edit className="h-4 w-4 mr-1" />
                              Edit
                            </Button>
                          )}
                        </div>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {isEditingDates ? (
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="yearEndDate" className="mb-1 block text-xs text-gray-500">Year End Date</Label>
                          <Input 
                            id="yearEndDate" 
                            type="date"
                            value={datesFormData.yearEndDate} 
                            onChange={(e) => handleDatesChange('yearEndDate', e.target.value)}
                            className="h-9"
                          />
                        </div>
                        <div>
                          <Label htmlFor="nextAccountsDue" className="mb-1 block text-xs text-gray-500">Next Accounts Due</Label>
                          <Input 
                            id="nextAccountsDue" 
                            type="date"
                            value={datesFormData.nextAccountsDue} 
                            onChange={(e) => handleDatesChange('nextAccountsDue', e.target.value)}
                            className="h-9"
                          />
                        </div>
                        <div>
                          <Label htmlFor="nextConfirmationStatementDue" className="mb-1 block text-xs text-gray-500">Next Confirmation Statement Due</Label>
                          <Input 
                            id="nextConfirmationStatementDue" 
                            type="date"
                            value={datesFormData.nextConfirmationStatementDue} 
                            onChange={(e) => handleDatesChange('nextConfirmationStatementDue', e.target.value)}
                            className="h-9"
                          />
                        </div>
                        <div>
                          <Label htmlFor="nextVatDue" className="mb-1 block text-xs text-gray-500">Next VAT Due</Label>
                          <Input 
                            id="nextVatDue" 
                            type="date"
                            value={datesFormData.nextVatDue} 
                            onChange={(e) => handleDatesChange('nextVatDue', e.target.value)}
                            className="h-9"
                          />
                        </div>
                        <div>
                          <Label htmlFor="corporationTaxDeadline" className="mb-1 block text-xs text-gray-500">Corporation Tax Deadline</Label>
                          <Input 
                            id="corporationTaxDeadline" 
                            type="date"
                            value={datesFormData.corporationTaxDeadline} 
                            onChange={(e) => handleDatesChange('corporationTaxDeadline', e.target.value)}
                            className="h-9"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <div className="text-sm text-gray-500">Year End Date</div>
                          <div className="font-medium">{formatDate(client.yearEndDate)}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-500">Next Accounts Due</div>
                          <div className="font-medium">{formatDate(client.nextAccountsDue)}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-500">Next Confirmation Statement Due</div>
                          <div className="font-medium">{formatDate(client.nextConfirmationStatementDue)}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-500">Next VAT Due</div>
                          <div className="font-medium">{formatDate(client.nextVatDue)}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-500">Corporation Tax Deadline</div>
                          <div className="font-medium">{formatDate(client.corporationTaxDeadline)}</div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-gray-200 shadow-sm hover:shadow-md transition-all">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xl text-[#1a365d] flex items-center justify-between">
                      <div className="flex items-center">
                        <FileText className="h-5 w-5 mr-2 text-primary/70" />
                        Services & Engagement
                      </div>
                      {!isEditing && (
                        <div>
                          {isEditingServices ? (
                            <div className="flex gap-2">
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="h-7 text-gray-500"
                                onClick={handleCancelServicesEdit}
                                disabled={savingServices}
                              >
                                <XCircle className="h-4 w-4 mr-1" />
                                Cancel
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="h-7 text-primary"
                                onClick={handleSaveServices}
                                disabled={savingServices}
                              >
                                {savingServices ? (
                                  <>
                                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary mr-1"></div>
                                    Saving...
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle className="h-4 w-4 mr-1" />
                                    Save
                                  </>
                                )}
                              </Button>
                            </div>
                          ) : (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="h-7 text-gray-500"
                              onClick={handleEditServices}
                            >
                              <Edit className="h-4 w-4 mr-1" />
                              Edit
                            </Button>
                          )}
                        </div>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {isEditingServices ? (
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="services" className="mb-1 block text-xs text-gray-500">Services</Label>
                          <div className="max-h-32 overflow-y-auto border rounded-md p-2">
                            <div className="flex flex-wrap gap-2">
                              {['Accounts', 'Tax Returns', 'VAT', 'Payroll', 'Bookkeeping', 'Company Secretarial', 'Self Assessment', 'Advisory', 'Business Formation', 'Wealth Management'].map((service) => (
                                <div key={service} className="flex items-center">
                                  <input
                                    type="checkbox"
                                    id={`service-${service}`}
                                    checked={servicesFormData.services.includes(service)}
                                    onChange={(e) => {
                                      const newServices = e.target.checked 
                                        ? [...servicesFormData.services, service] 
                                        : servicesFormData.services.filter(s => s !== service);
                                      handleServicesChange('services', newServices);
                                    }}
                                    className="mr-1.5 h-3.5 w-3.5"
                                  />
                                  <label htmlFor={`service-${service}`} className="text-sm">
                                    {service}
                                  </label>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div>
                          <Label htmlFor="vatFilingFrequency" className="mb-1 block text-xs text-gray-500">VAT Filing Frequency</Label>
                          <Select 
                            value={servicesFormData.vatFilingFrequency} 
                            onValueChange={(value) => handleServicesChange('vatFilingFrequency', value as 'monthly' | 'quarterly' | 'annually')}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="monthly">Monthly</SelectItem>
                              <SelectItem value="quarterly">Quarterly</SelectItem>
                              <SelectItem value="annually">Annually</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="engagementLetterStatus" className="mb-1 block text-xs text-gray-500">Engagement Letter Status</Label>
                          <Select 
                            value={servicesFormData.engagementLetterStatus} 
                            onValueChange={(value) => handleServicesChange('engagementLetterStatus', value as 'signed' | 'pending' | 'not_sent')}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="signed">Signed</SelectItem>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="not_sent">Not Sent</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <div className="text-sm text-gray-500">Services</div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {client.services && client.services.length > 0 ? client.services.map((service, index) => (
                              <Badge key={index} variant="secondary" className="bg-gray-100 text-gray-800 font-normal">
                                {service}
                              </Badge>
                            )) : <span className="text-gray-400">No services selected</span>}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-500">VAT Filing Frequency</div>
                          <div className="font-medium capitalize">{client.vatFilingFrequency}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-500">Engagement Letter Status</div>
                          <div className="font-medium">
                            <Badge className={
                              client.engagementLetterStatus === 'signed' ? 'bg-green-100 text-green-800' :
                              client.engagementLetterStatus === 'pending' ? 'bg-amber-100 text-amber-800' :
                              'bg-red-100 text-red-800'
                            }>
                              {client.engagementLetterStatus === 'signed' ? 'Signed' :
                               client.engagementLetterStatus === 'pending' ? 'Pending' : 'Not Sent'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-gray-200 shadow-sm hover:shadow-md transition-all">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xl text-[#1a365d] flex items-center">
                      <Sparkles className="h-5 w-5 mr-2 text-primary/70" />
                      AI Document Analysis
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {client.ai_document_status ? (
                      <div className="space-y-4">
                        <div>
                          <div className="text-sm text-gray-500">Document Status</div>
                          <div className="font-medium">
                            <Badge className={
                              client.ai_document_status === 'Good' ? 'bg-green-100 text-green-800' :
                              client.ai_document_status === 'Okay' ? 'bg-amber-100 text-amber-800' :
                              client.ai_document_status === 'Missing' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                            }>
                              {client.ai_document_status}
                            </Badge>
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-500">Last Analysis</div>
                          <div className="font-medium">{formatDate(client.last_ai_analysis_at || '')}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-500 mb-1">AI Notes</div>
                          <div className="text-sm text-gray-700 bg-gray-50 p-3 rounded-md">
                            {client.ai_document_notes ? (
                              <>
                                {truncateText(client.ai_document_notes, 20)}
                                <div className="mt-2 text-xs text-primary italic flex items-center">
                                  <ArrowRight className="h-3 w-3 mr-1" />
                                  Go to the Documents tab to see the full analysis
                                </div>
                              </>
                            ) : 'No additional notes from AI analysis.'}
                          </div>
                        </div>
                        <div className="pt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full border-primary/30 text-primary hover:bg-primary/5"
                            onClick={handleAnalyzeDocuments}
                            disabled={isAnalyzing}
                          >
                            {isAnalyzing ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2"></div>
                                Analyzing...
                              </>
                            ) : (
                              <>
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Refresh Analysis
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-4 space-y-3">
                        <Sparkles className="h-10 w-10 text-gray-300" />
                        <p className="text-gray-500 text-center">No AI analysis available yet</p>
                        <Button
                          size="sm"
                          className="bg-primary hover:bg-primary/90 text-white transition-colors"
                          onClick={handleAnalyzeDocuments}
                          disabled={isAnalyzing}
                        >
                          {isAnalyzing ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                              Analyzing...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4 mr-2" />
                              Analyze Documents
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="financial" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl text-[#1a365d]">Financial Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-4 border rounded-md bg-blue-50">
                      <div className="text-sm text-gray-600">Last Year Turnover</div>
                      <div className="text-2xl font-bold text-[#1a365d]">
                        £{client.lastYearTurnover.toLocaleString()}
                      </div>
                    </div>
                    <div className="p-4 border rounded-md bg-green-50">
                      <div className="text-sm text-gray-600">Profit/Loss</div>
                      <div className={`text-2xl font-bold ${client.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        £{client.profitLoss.toLocaleString()}
                      </div>
                    </div>
                    <div className="p-4 border rounded-md bg-amber-50">
                      <div className="text-sm text-gray-600">Tax Owed</div>
                      <div className="text-2xl font-bold text-amber-600">
                        £{client.taxOwed.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="documents" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl text-[#1a365d]">Required Documents</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    <li className="flex items-center">
                      {client.requiredDocuments.bankStatements ? (
                        <CheckCircle className="h-5 w-5 mr-2 text-green-600" />
                      ) : (
                        <XCircle className="h-5 w-5 mr-2 text-red-600" />
                      )}
                      <span>Bank Statements</span>
                    </li>
                    <li className="flex items-center">
                      {client.requiredDocuments.receipts ? (
                        <CheckCircle className="h-5 w-5 mr-2 text-green-600" />
                      ) : (
                        <XCircle className="h-5 w-5 mr-2 text-red-600" />
                      )}
                      <span>Receipts</span>
                    </li>
                    <li className="flex items-center">
                      {client.requiredDocuments.payrollSummaries ? (
                        <CheckCircle className="h-5 w-5 mr-2 text-green-600" />
                      ) : (
                        <XCircle className="h-5 w-5 mr-2 text-red-600" />
                      )}
                      <span>Payroll Summaries</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-xl text-[#1a365d]">Recent Files</CardTitle>
                  <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
                    <DialogTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="sm"
                        disabled={!isBucketReady}
                        title={!isBucketReady ? "Storage not configured" : "Upload new file"}
                      >
                        Upload New File
                        {!isBucketReady && (
                          <span className="ml-2 text-xs text-red-500">(Storage not ready)</span>
                        )}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Upload Document</DialogTitle>
                      </DialogHeader>
                      <div className="py-4">
                        <div className="mb-4 text-sm text-gray-600">
                          Upload a document for {client.clientName}. The file will be securely stored and accessible from this client&apos;s profile.
                        </div>
                        <FileUploader 
                          clientId={client.id} 
                          onUploadComplete={handleUploadComplete} 
                        />
                      </div>
                    </DialogContent>
                  </Dialog>
                </CardHeader>
                <CardContent>
                  {client.recentFiles && client.recentFiles.length > 0 ? (
                    <ul className="space-y-2">
                      {client.recentFiles.map((file, index) => (
                        <li key={index} className="flex items-center justify-between p-2 border rounded-md">
                          <div className="flex items-center gap-2 truncate">
                            <File className="h-4 w-4 text-[#1a365d]" />
                            <span className="truncate">{file.fileName}</span>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleDownloadFile(file.fileUrl, file.fileName)} 
                          >
                            <Download className="h-4 w-4 mr-1" />
                            Download
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-center py-6 text-gray-500">No files uploaded yet</div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-xl text-[#1a365d]">AI Document Analysis</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {client ? (
                    <>
                      {(client.ai_document_status || isAnalyzing && !isAskingQuestion) && ( 
                        <div className="p-4 border rounded-md bg-slate-50 dark:bg-slate-800 mb-6">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="font-semibold text-lg">Overall Document Health:</span>
                            {(isAnalyzing && !isAskingQuestion) && !client.ai_document_status && (
                              <Badge variant="secondary">Checking...</Badge>
                            )}
                            {client.ai_document_status && (
                              <Badge 
                                variant={
                                  client.ai_document_status === 'Good' ? 'default' :
                                  client.ai_document_status === 'Missing' ? 'destructive' :
                                  'secondary'
                                }
                                className="flex items-center gap-1.5 text-base px-3 py-1"
                              >
                                {client.ai_document_status === 'Good' && <CheckCircle className="h-4 w-4 text-green-500" />}
                                {client.ai_document_status === 'Okay' && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                                {client.ai_document_status === 'Missing' && <XCircle className="h-4 w-4 text-red-500" />}
                                {client.ai_document_status}
                              </Badge>
                            )}
                          </div>
                          {client.last_ai_analysis_at && client.ai_document_status && (
                             <p className="text-xs text-gray-500 dark:text-gray-400">
                                Full analysis last run: {new Date(client.last_ai_analysis_at).toLocaleString()}
                             </p>
                          )}
                        </div>
                      )}

                      {(client.ai_document_notes || isAnalyzing || isAskingQuestion) && (
                        <div className="pt-4 border-t min-h-[150px] max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600 mb-4 bg-white dark:bg-slate-900 p-4 rounded-md border dark:border-slate-700">
                          <h4 className="text-md font-semibold text-gray-700 dark:text-gray-300 mb-3 sticky top-0 bg-white dark:bg-slate-900 py-2 z-10">
                            Analysis & Conversation Log:
                          </h4>
                          {(isAnalyzing && !isAskingQuestion) && !client.ai_document_notes && <p className="text-sm text-gray-500 dark:text-gray-400 px-2">Running full analysis, results will appear shortly...</p>}
                          {isAskingQuestion && <p className="text-sm text-gray-500 dark:text-gray-400 px-2">Waiting for AI to answer your question...</p>}
                          
                          {chatDisplayMessages.length > 0 && ( // Use chatDisplayMessages state here
                            <div className="space-y-4 px-1">
                              {chatDisplayMessages.map((msg) => ( // Iterate over chatDisplayMessages
                                <div 
                                  key={msg.id} 
                                  className={`flex flex-col ${msg.type === 'user' ? 'items-end' : 'items-start'}`}
                                >
                                  <div 
                                    className={`max-w-[85%] p-3 rounded-lg shadow-sm ${ 
                                      msg.type === 'user' ? "bg-primary text-primary-foreground rounded-br-none" : 
                                      msg.type === 'system_report' ? "bg-blue-50 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-800 w-full" : 
                                      msg.type === 'ai_typing' ? "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 italic" :
                                      "bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-bl-none" // AI message
                                    }`}
                                  >
                                    {msg.type === 'ai_typing' ? (
                                      <div className="flex items-center space-x-1.5">
                                        <div className="w-2 h-2 bg-slate-500 rounded-full animate-pulse delay-75"></div>
                                        <div className="w-2 h-2 bg-slate-500 rounded-full animate-pulse delay-150"></div>
                                        <div className="w-2 h-2 bg-slate-500 rounded-full animate-pulse delay-300"></div>
                                      </div>
                                    ) : msg.isFullReport ? (
                                      // If it's a full report, render with markdown (or however it's intended)
                                      // For now, let's assume it might contain pre-formatted HTML or needs careful rendering
                                      // This part might need specific Markdown rendering logic if msg.content is Markdown
                                      <div 
                                        className="prose prose-sm dark:prose-invert max-w-none" 
                                        dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br />') }} 
                                      />
                                    ) : (
                                      // Standard message content
                                      msg.content.split('\n').map((line, i, arr) => (
                                        <React.Fragment key={i}>
                                          {line}
                                          {i < arr.length - 1 && <br />}
                                        </React.Fragment>
                                      ))
                                    )}
                                  </div>
                                  {msg.timestamp && msg.type !== 'system_report' && msg.type !== 'ai_typing' && (
                                    <p className={`text-xs mt-1 ${msg.type === 'user' ? 'text-slate-400 dark:text-slate-500 mr-1' : 'text-slate-500 dark:text-slate-400 ml-1'}`}>
                                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          {(chatDisplayMessages.length === 0 && !isAnalyzing && !isAskingQuestion) && (
                             <div className="text-center py-6 px-4">
                               <Info className="mx-auto h-10 w-10 text-slate-400 mb-3" />
                               <p className="font-semibold text-slate-700 dark:text-slate-300">AI Assistant Ready</p>
                               <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                 Ask a question about the client&apos;s documents or click &quot;Analyze Documents&quot; for a full report.
                               </p>
                             </div>
                          )}
                        </div>
                      )}
                      
                      {!client.ai_document_notes && !isAnalyzing && !isAskingQuestion && (
                           <div className="text-center py-6 text-gray-500 dark:text-gray-400 min-h-[150px] flex flex-col justify-center items-center border rounded-md dark:border-slate-700">
                             <MessageCircleQuestion className="h-10 w-10 mx-auto mb-3 text-slate-400"/>
                             <p className="mb-1 font-semibold">AI Assistant Ready</p>
                             <p className="text-xs">Use the input below to ask a question or run a full document analysis.</p>
                           </div>
                      )}

                      <div className="mt-auto pt-4 border-t border-dashed dark:border-slate-700">
                        <Label htmlFor="customUserQuestion" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Your Message to AI:
                        </Label>
                        <Textarea
                          id="customUserQuestion"
                          value={customUserQuestion}
                          onChange={(e) => setCustomUserQuestion(e.target.value)}
                          placeholder="Type your question for the AI here..."
                          rows={3}
                          className="w-full mt-1 mb-3 dark:bg-slate-700 dark:text-slate-200 dark:placeholder-slate-400"
                          disabled={isAnalyzing || isAskingQuestion || !client}
                        />
                        <div className="flex flex-col sm:flex-row gap-2 justify-end">
                          <Button 
                            onClick={handleAnalyzeDocuments} 
                            disabled={isAnalyzing || isAskingQuestion || !client}
                            variant="outline"
                            className="w-full sm:w-auto dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                          >
                            <Sparkles className={`mr-2 h-4 w-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
                            {isAnalyzing ? 'Running Full Analysis...' : 'Run Full Analysis'}
                          </Button>
                          <Button 
                            onClick={handleAskCustomQuestion}
                            disabled={isAnalyzing || isAskingQuestion || !client || !customUserQuestion.trim()}
                            className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground"
                          >
                            <SendHorizontal className={`mr-2 h-4 w-4 ${isAskingQuestion ? 'animate-pulse' : ''}`} />
                            {isAskingQuestion ? 'Sending...' : 'Send Question'}
                          </Button>
                        </div>
                      </div>

                      {analysisError && (
                        <div className="mt-6 p-3 border border-red-300 bg-red-50 rounded-md text-red-700 text-sm">
                          <div className="flex items-center">
                             <AlertCircle className="h-5 w-5 mr-2 text-red-600" /> 
                             <strong>Error during analysis:</strong>
                          </div>
                          <p className='mt-1 ml-7'>{analysisError}</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-6 text-gray-500 dark:text-gray-400">
                      Loading client data for AI analysis...
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="tasks" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Client Tasks</CardTitle>
                </CardHeader>
                <CardContent>
                  {clientTasks.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No tasks found for this client.</p>
                  ) : (
                    <div className="space-y-3">
                      {clientTasks.map((task) => {
                        const assignedUser = profiles.find(p => p.id === task.assigned_user_id);
                        const currentStageIndex = workflowStages.indexOf(task.stage);
                        const isLastStageForNextButton = currentStageIndex === workflowStages.length - 1 || task.stage === 'On Hold / Blocked';
                        return (
                          <div key={task.id} className="border rounded-md p-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                            <div className="flex-grow">
                              <p className="font-medium text-gray-800 mb-1">{task.task_title}</p>
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                                <span>Stage: <Badge variant="secondary" className="font-normal">{task.stage}</Badge></span>
                                {task.priority && (
                                  <span>Priority: <Badge variant={task.priority === 'High' ? 'destructive' : task.priority === 'Medium' ? 'secondary' : 'outline'} className="font-normal">{task.priority}</Badge></span>
                                )}
                                {task.due_date && <span>Due: {formatDate(task.due_date)}</span>}
                                <span>Assigned: {assignedUser?.email ?? 'Unassigned'}</span>
                              </div>
                            </div>
                            <div className="flex items-center space-x-1 flex-shrink-0">
                              {task.stage === 'On Hold / Blocked' && (
                                <Button 
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleDeleteTask(task.id)}
                                  title="Clear this task permanently"
                                >
                                  <TrashIcon className="h-4 w-4" />
                                </Button>
                              )}
                              {!isLastStageForNextButton && task.stage !== 'Completed / Filed' && task.stage !== 'On Hold / Blocked' && (
                                <Button 
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleMoveToNextStage(task.id)}
                                  title={`Move to: ${workflowStages[currentStageIndex + 1]}`}
                                >
                                  <ArrowRight className="h-4 w-4" />
                                </Button>
                              )}
                              {task.stage === 'Completed / Filed' && (
                                <span className="text-xs text-green-600 font-semibold inline-flex items-center"><CheckCircle className="h-4 w-4 mr-1"/> Done</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <Button 
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => router.push(`/dashboard/tasks?clientId=${clientId}`)} 
                  > 
                     View Full Task Board / Add Task
                   </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notes" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl text-[#1a365d]">Activity Log / Detailed Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="newClientNote" className="mb-1 block">Add a new note</Label>
                      <Textarea
                        id="newClientNote"
                        value={newNoteContent}
                        onChange={(e) => setNewNoteContent(e.target.value)}
                        placeholder="Type your detailed note here..."
                        rows={3}
                        disabled={addingNote}
                        className="mb-2"
                      />
                      <Button onClick={handleAddClientNote} disabled={addingNote || !newNoteContent.trim()}>
                        {addingNote ? 'Adding Note...' : 'Add Note'}
                      </Button>
                    </div>
                    <div className="mt-6 space-y-3">
                      <h4 className="text-md font-semibold text-gray-700">Previous Notes:</h4>
                      {detailedClientNotes.length > 0 ? (
                        detailedClientNotes.map(noteItem => (
                          <div key={noteItem.id} className="p-3 border rounded-md bg-gray-50 text-sm shadow-sm">
                            <div className="flex justify-between items-start">
                              <p className="whitespace-pre-line text-gray-800 flex-grow">{noteItem.note}</p>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteClientNote(noteItem.id)}
                                disabled={deletingNoteId === noteItem.id}
                                className="ml-2 flex-shrink-0 w-8 h-8 p-0" 
                                title="Delete note"
                              >
                                {deletingNoteId === noteItem.id ? (
                                  <Clock className="h-4 w-4 animate-spin" /> 
                                ) : (
                                  <TrashIcon className="h-4 w-4 text-red-500" />
                                )}
                              </Button>
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                              Added on: {new Date(noteItem.created_at).toLocaleString()}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-gray-500">No detailed notes added yet for this client.</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="alerts" className="space-y-6">
              <Card>
                <CardHeader className="flex flex-row justify-between items-center">
                  <CardTitle className="text-xl text-[#1a365d]">Reminder Alerts</CardTitle>
                  <Button onClick={handleOpenCreateAlertForm} variant="outline" size="sm">
                    <Plus className="mr-2 h-4 w-4" /> Add New Alert
                  </Button>
                </CardHeader>
                <CardContent>
                  {showCreateAlertForm && (
                    <Dialog open={showCreateAlertForm} onOpenChange={setShowCreateAlertForm}>
                      <DialogContent className="sm:max-w-3xl overflow-y-auto max-h-[85vh]"> {/* Added overflow-y-auto and max-h-[85vh] */}
                        <DialogHeader>
                          <DialogTitle>Create New Alert</DialogTitle>
                        </DialogHeader>
                        <ClientAlertForm
                          initialData={{ client_id: clientId as string }}
                          clients={[]} // Provide empty array for required prop
                          onSuccess={(msg) => { handleAlertFormSuccess(msg); setShowCreateAlertForm(false); }}
                          apiBaseUrl={apiBaseUrl}
                          alertToEdit={null}
                        />
                      </DialogContent>
                    </Dialog>
                  )}
                  {showEditAlertForm && editingAlert && (
                     <Dialog open={showEditAlertForm} onOpenChange={setShowEditAlertForm}>
                       <DialogContent className="sm:max-w-3xl overflow-y-auto max-h-[85vh]"> {/* Added overflow-y-auto and max-h-[85vh] */}
                         <DialogHeader>
                           <DialogTitle>Edit Alert</DialogTitle>
                         </DialogHeader>
                         <ClientAlertForm
                           clients={[]} // Provide empty array for required prop
                           alertToEdit={editingAlert} // Use alertToEdit prop
                           onSuccess={(msg) => { handleAlertFormSuccess(msg); setShowEditAlertForm(false);}}
                           apiBaseUrl={apiBaseUrl}
                         />
                       </DialogContent>
                     </Dialog>
                  )}

                  {loadingAlerts ? (
                    <p className="text-gray-500 text-center py-4">Loading alerts...</p>
                  ) : clientAlerts.length === 0 ? (
                    <div className="text-center py-6 text-gray-500 dark:text-gray-400 min-h-[150px] flex flex-col justify-center items-center border rounded-md dark:border-slate-700">
                       <FileCog className="h-10 w-10 mx-auto mb-3 text-slate-400"/>
                       <p className="mb-1 font-semibold">No Reminder Alerts Configured</p>
                       <p className="text-xs mb-3">Click &quot;Add New Alert&quot; to set up automated reminders.</p>
                       <Button onClick={handleOpenCreateAlertForm} variant="default" size="sm">
                         <Plus className="mr-2 h-4 w-4" /> Add First Alert
                       </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {clientAlerts.map((alert) => (
                        <div key={alert.id} className="p-4 border rounded-lg bg-slate-50 dark:bg-slate-800 shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-grow">
                              <p className="font-semibold text-slate-800 dark:text-slate-100 text-md">
                                {alert.alert_type.replace(/_/g, ' ')}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                Notify: <span className="font-medium">{alert.notification_preference.replace('DRAFT_FOR_TEAM', 'Draft for Team').replace('SEND_DIRECT_TO_CLIENT', 'Direct to Client')}</span>
                                {' | '}
                                Primary Trigger: <span className="font-medium">{alert.days_before_due} days before due</span>
                              </p>
                            </div>
                            <div className="flex items-center space-x-2 flex-shrink-0 ml-4">
                               <UISwitch
                                 id={`alert-active-${alert.id}`}
                                 checked={alert.is_active}
                                 onCheckedChange={(newIsActive) => handleToggleAlertActive(alert.id, newIsActive)}
                                 aria-label={alert.is_active ? 'Deactivate Alert' : 'Activate Alert'}
                               />
                               <Label htmlFor={`alert-active-${alert.id}`} className="text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                                 {alert.is_active ? 'Active' : 'Inactive'}
                               </Label>
                             </div>
                          </div>
                          {alert.body && ( // Check alert.body
                            <div className="mt-2 p-2.5 bg-slate-100 dark:bg-slate-700 rounded-md">
                              <p className="text-xs text-slate-600 dark:text-slate-300 font-medium mb-1">Primary Message Preview:</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 truncate" title={alert.body}> {/* Use alert.body for title */}
                                {truncateText(alert.body, 20)} {/* Use alert.body for truncateText */}
                              </p>
                            </div>
                          )}
                          {/* Display Reminder Schedules */}
                          {alert.use_multi_schedule && alert.reminder_schedules && alert.reminder_schedules.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-600">
                              <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Follow-up Reminders:</p>
                              <div className="space-y-2 pl-2">
                                {alert.reminder_schedules
                                  .filter(schedule => schedule.days_before_due !== alert.days_before_due) // Exclude the primary schedule if it's duplicated
                                  .sort((a, b) => b.days_before_due - a.days_before_due) // Show earliest first (more days before)
                                  .map((schedule, index) => (
                                    <div key={schedule.id || `schedule-${index}`} className="p-2 bg-slate-200/50 dark:bg-slate-700/50 rounded">
                                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                                        {schedule.days_before_due} days before due
                                      </p>
                                      {schedule.alert_message && (
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate" title={schedule.alert_message}>
                                          Custom Message: {truncateText(schedule.alert_message, 15)}
                                        </p>
                                      )} 
                                      {!schedule.alert_message && (
                                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 italic">
                                          Uses primary alert message.
                                        </p>
                                      )}
                                    </div>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 flex justify-end items-center space-x-2">
                            <Button variant="ghost" size="sm" onClick={() => handleOpenEditAlertForm(alert)} className="text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100">
                              <EditIcon className="h-4 w-4 mr-1.5" /> Edit
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleTestAlert(alert.id)} 
                              disabled={testingAlertId === alert.id}
                              className="text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100"
                            >
                              {testingAlertId === alert.id ? <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" /> : <SendIcon className="h-4 w-4 mr-1.5" />} 
                              {testingAlertId === alert.id ? 'Sending...' : 'Test'}
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleDeleteAlert(alert.id)}
                              className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-500"
                            >
                              <TrashIcon className="h-4 w-4 mr-1.5" /> Delete
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="text-2xl font-semibold text-[#1a365d]">Client data not available.</div>
        </div>
      )}
    </div>
  );
} 