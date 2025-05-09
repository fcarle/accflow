'use client';

import { useState, useEffect, FormEvent, useRef } from 'react';
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
  ListChecks,
  Sparkles, // Import Sparkles icon for the analyze button
  AlertTriangle, // For 'Okay' status
  MessageCircleQuestion, // For 'Ask Question' button
  SendHorizontal, // <-- ADD SendHorizontal ICON
  User as UserIcon // <-- ADD UserIcon
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
import ReactMarkdown from 'react-markdown'; // Import react-markdown
import remarkGfm from 'remark-gfm'; // Import remark-gfm for full markdown support

// Added imports for form components
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

// Import the Client interface from the main clients page to keep types consistent
interface Client {
  // Basic Info
  id: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientRole: string;
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
  taskStatus: 'waiting' | 'in_progress' | 'completed';
  recentFiles: ClientFileRecord[];
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
  
  // AI Analysis Fields (add these)
  ai_document_status?: 'Good' | 'Okay' | 'Missing' | 'Pending Analysis' | null;
  ai_document_notes?: string | null;
  last_ai_analysis_at?: string | null;
}

// Define the structure for parsed chat messages
interface ChatMessage {
  id: string;
  type: 'user' | 'ai' | 'system_report' | 'ai_typing'; // Added 'ai_typing' type
  content: string;
  timestamp?: string;
  isFullReport?: boolean;
}

// Define the interface for individual client notes based on the client_notes table
interface ClientNote {
  id: string;
  client_id: string;
  note: string;
  created_at: string;
  created_by: string;
  // Optionally, we can add user details here if we join with a users table later
  // created_by_name?: string; 
}

// Add ClientTask interface
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

// Add Profile interface for assignee lookup
interface Profile {
  id: string;
  email: string; // Or other display name
}

// FormData will exclude id as it's not directly editable in the form itself
// Copied from edit/page.tsx
type FormData = Omit<Client, 'id' | 'recentFiles' | 'meetingLog' | 'emailHistory' | 'shareableLinkToken'>;

// Copied from edit/page.tsx
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

// --- Constants --- 
// Workflow stages - should be shared
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

export default function ClientDetailPage() {
  const router = useRouter();
  const { id: routeId } = useParams();
  const clientId = Array.isArray(routeId) ? routeId[0] : routeId;
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

  // State for detailed client notes
  const [detailedClientNotes, setDetailedClientNotes] = useState<ClientNote[]>([]);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null); // For delete loading state

  // State for AI Analysis
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAskingQuestion, setIsAskingQuestion] = useState(false); // <-- ADD THIS NEW STATE
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [customUserQuestion, setCustomUserQuestion] = useState('');
  const [chatDisplayMessages, setChatDisplayMessages] = useState<ChatMessage[]>([]); // <-- RE-ADD THIS
  const [aiActionStep, setAiActionStep] = useState<string | null>(null); // <-- RE-ADD THIS
  const typingIntervalRef = useRef<NodeJS.Timeout | null>(null); // <-- RE-ADD THIS

  // AI Processing steps for simulation - RE-ADD THIS
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

  const checkBucket = async () => {
    const bucketId = clientId ? `client_${clientId}` : null;
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
    if (!clientId || typeof clientId !== 'string') {
      toast.error('Invalid Client ID.');
      router.push('/dashboard/clients');
      setLoading(false);
      return;
    }

    try {
      // Fetch Client Details - Explicitly add AI columns
      const { data: clientData, error: clientError } = await supabase // Use the standard client-side instance
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
      
      let existingRecentFiles: ClientFileRecord[] = tryParseJSON(clientData.recent_files) || [];
      
      // Fetch files from Supabase Storage
      const storageFiles: ClientFileRecord[] = [];
      const categories: ('bankStatements' | 'receipts' | 'payrollSummaries' | 'other')[] = [
        'bankStatements', 'receipts', 'payrollSummaries', 'other'
      ];

      for (const category of categories) {
        const pathPrefix = `clients/${clientId}/${category}/`;
        const { data: filesInCategory, error: listError } = await supabase.storage
          .from('client-files')
          .list(pathPrefix, {
            limit: 100, // Adjust limit as needed
            offset: 0,
            sortBy: { column: 'name', order: 'asc' },
          });

        if (listError) {
          console.error(`Error listing files in ${pathPrefix}:`, listError);
          // Continue to other categories even if one fails, or handle error more strictly
        } else if (filesInCategory) {
          for (const file of filesInCategory) {
            if (file.name === '.emptyFolderPlaceholder') continue; // Skip placeholder files if you use them

            const filePathInBucket = `${pathPrefix}${file.name}`;
            const { data: signedUrlData, error: signedUrlError } = await supabase.storage
              .from('client-files')
              .createSignedUrl(filePathInBucket, 300); // 300 seconds = 5 minutes validity
            
            if (signedUrlError) {
              console.error(`Error generating signed URL for ${filePathInBucket}:`, signedUrlError);
              storageFiles.push({
                fileName: file.name,
                fileUrl: '#error-generating-url', // Indicate error
              });
              continue; // Move to the next file
            }
            
            // Check if signedUrlData itself is null or if signedUrl is missing
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
                fileUrl: '#no-url-generated', // Indicate URL was not generated
              });
            }
          }
        }
      }

      // Combine and de-duplicate files. Prioritize storage files in case of name collision for simplicity.
      // A more robust de-duplication might be needed if fileNames are not unique enough.
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
        recentFiles: allRecentFiles, // Use the combined and de-duplicated list
        lastInteractionNotes: clientData.last_interaction_notes || '',
        reminderSchedule: clientData.reminder_schedule ? (typeof clientData.reminder_schedule === 'string' ? JSON.parse(clientData.reminder_schedule) : clientData.reminder_schedule) : { vatReminderDays: 30, accountsReminderDays: 30, confirmationStatementReminderDays: 30 },
        customAlerts: clientData.custom_alerts ? (typeof clientData.custom_alerts === 'string' ? JSON.parse(clientData.custom_alerts) : clientData.custom_alerts) : { missedReminders: false, documentOverdue: false },
        automatedEmails: clientData.automated_emails === true,
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

      // Fetch Client Tasks for this client
      const { data: tasksData, error: tasksError } = await supabase
        .from('client_tasks')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (tasksError) throw tasksError;
      setClientTasks(tasksData || []);

      // Fetch Profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email');

      if (profilesError) throw profilesError;
      setProfiles(profilesData || []);

      // Fetch detailed notes
      await fetchClientNotes(clientId);

      // Check bucket status
      await checkBucket();

    } catch (error: any) {
      console.error('Error fetching client data:', error);
      toast.error('Failed to fetch client details.');
      setClient(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClientDataAndRelated();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => {
    const checkBucket = async () => {
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
    
    checkBucket();
  }, [client?.id, clientId]);

  // Fetch notes when client ID is available or refreshFiles (now client.id) changes
  useEffect(() => {
    if (client?.id) {
      fetchClientNotes(client.id);
    }
  }, [client?.id, refreshFiles]);

  // Effect to parse notes from client data into displayable chat messages
  useEffect(() => {
    if (client?.ai_document_notes) {
      const parsedMessages = parseAiNotesToMessages(client.ai_document_notes, client.last_ai_analysis_at);
      setChatDisplayMessages(parsedMessages);
    } else {
      setChatDisplayMessages([]); // Clear if no notes
    }
  }, [client?.ai_document_notes, client?.last_ai_analysis_at]);

  const fetchClientNotes = async (clientId: string) => {
    if (!clientId) return;
    console.log(`Fetching client notes for clientId: ${clientId}`); // Log: Start fetching
    const { data: notesData, error: notesError } = await supabase
      .from('client_notes')
      .select('*') // Fetches all columns: id, client_id, note, created_at, created_by
      .eq('client_id', clientId)
      .order('created_at', { ascending: false }); // Show newest first

    if (notesError) {
      console.error('Error fetching client notes:', notesError);
      toast.error('Failed to fetch detailed notes.');
      setDetailedClientNotes([]);
    } else {
      console.log('Fetched notesData:', notesData); // Log: Data received from Supabase
      setDetailedClientNotes(notesData || []);
      console.log('detailedClientNotes state after set:', notesData || []); // Log: State after setting
    }
  };

  // Handler functions for form editing (copied and adapted from edit/page.tsx)
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    // @ts-ignore
    const checked = type === 'checkbox' ? e.target.checked : undefined;
  
    setFormData((prev) => {
      const keys = name.split('.');
      if (keys.length > 1) {
        // Handle nested state (e.g., reminderSchedule.vatReminderDays)
        let nestedState = { ...prev };
        let currentLevel = nestedState;
        for (let i = 0; i < keys.length - 1; i++) {
          // @ts-ignore
          currentLevel[keys[i]] = { ...currentLevel[keys[i]] };
          // @ts-ignore
          currentLevel = currentLevel[keys[i]];
        }
        // @ts-ignore
        currentLevel[keys[keys.length - 1]] = type === 'checkbox' ? checked : (type === 'number' ? parseFloat(value) || 0 : value);
        return nestedState;
      } else {
        return {
          ...prev,
          [name]: type === 'checkbox' ? checked : (type === 'number' ? parseFloat(value) || 0 : value),
        };
      }
    });
  };
  
  const handleSelectChange = (name: string, value: string | boolean) => {
     // Handle boolean values for Select if they are strings like "true" / "false"
     if (typeof value === 'string' && (value.toLowerCase() === 'true' || value.toLowerCase() === 'false')) {
      setFormData((prev) => ({ ...prev, [name]: value.toLowerCase() === 'true' }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
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
      required_documents: JSON.stringify(formData.requiredDocuments), // Ensure this is stringified
      task_status: formData.taskStatus,
      last_interaction_notes: formData.lastInteractionNotes,
      reminder_schedule: JSON.stringify(formData.reminderSchedule), // Ensure this is stringified
      custom_alerts: JSON.stringify(formData.customAlerts), // Ensure this is stringified
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
      setIsEditing(false); // Exit editing mode
      setRefreshFiles(prev => prev + 1); // Trigger general refresh which includes notes
    }
  };

  function tryParseJSON(inputValue: any): ClientFileRecord[] {
    console.log('Attempting to process recent_files from DB. Input type:', typeof inputValue, 'Value:', inputValue);

    // Check if it's already a parsed array
    if (Array.isArray(inputValue)) {
      // It's already an array, assume it's in the correct format.
      // Add further validation here if needed to ensure items match ClientFileRecord structure.
      return inputValue as ClientFileRecord[];
    }

    // If it's a string, try to parse it
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

    // If it's not an array and not a parsable string (e.g., null, undefined, empty string, other non-array object type), return empty array.
    // This handles cases like null, undefined, or if inputValue is an object but not an array.
    console.log('recent_files is not a processable array or JSON string, returning []. Input was:', inputValue);
    return [];
  }

  const handleEditClient = () => {
    if (client) {
      // Populate formData from the current client state
      // Omit fields not in FormData type, similar to edit/page.tsx logic
      const { 
        id: _id, 
        recentFiles: _recentFiles, 
        meetingLog: _meetingLog, 
        emailHistory: _emailHistory, 
        shareableLinkToken: _shareableLinkToken, 
        ...editableClientData 
      } = client;
      
      // Ensure all fields in formData are correctly mapped and initialized
      // This mapping should align with the structure of initialFormData
      const populatedFormData: FormData = {
        clientName: editableClientData.clientName || '',
        clientEmail: editableClientData.clientEmail || '',
        clientPhone: editableClientData.clientPhone || '',
        clientRole: editableClientData.clientRole || '',
        preferredContactMethod: editableClientData.preferredContactMethod || 'email',
        companyName: editableClientData.companyName || '',
        companyNumber: editableClientData.companyNumber || '',
        companyAddress: editableClientData.companyAddress || '',
        sicCode: editableClientData.sicCode || '',
        companyStatus: editableClientData.companyStatus || 'active',
        incorporationDate: editableClientData.incorporationDate || '',
        yearEndDate: editableClientData.yearEndDate || '',
        nextAccountsDue: editableClientData.nextAccountsDue || '',
        nextConfirmationStatementDue: editableClientData.nextConfirmationStatementDue || '',
        vatFilingFrequency: editableClientData.vatFilingFrequency || 'quarterly',
        nextVatDue: editableClientData.nextVatDue || '',
        payrollDeadlines: editableClientData.payrollDeadlines || [],
        corporationTaxDeadline: editableClientData.corporationTaxDeadline || '',
        services: editableClientData.services || [],
        engagementLetterStatus: editableClientData.engagementLetterStatus || 'not_sent',
        requiredDocuments: editableClientData.requiredDocuments || { bankStatements: false, receipts: false, payrollSummaries: false },
        taskStatus: editableClientData.taskStatus || 'waiting',
        lastInteractionNotes: editableClientData.lastInteractionNotes || '',
        reminderSchedule: editableClientData.reminderSchedule || { vatReminderDays: 30, accountsReminderDays: 30, confirmationStatementReminderDays: 30 },
        customAlerts: editableClientData.customAlerts || { missedReminders: false, documentOverdue: false },
        automatedEmails: editableClientData.automatedEmails === undefined ? true : editableClientData.automatedEmails, // Default to true if undefined
        lastYearTurnover: editableClientData.lastYearTurnover || 0,
        profitLoss: editableClientData.profitLoss || 0,
        taxOwed: editableClientData.taxOwed || 0,
        notes: editableClientData.notes || '',
      };
      setFormData(populatedFormData);
      setIsEditing(true);
    } else {
      toast.error("Cannot edit: Client data not loaded.");
    }
  };
  
  const handleCancelEdit = () => {
    setIsEditing(false);
    // Optionally, reset formData to client's current state if any optimistic updates were made
    // or simply rely on the next render to use `client` state for display.
    // For simplicity, we can refetch or re-populate from `client` if needed.
    if (client) { // Re-populate from original client data to discard changes
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
    // Add explicit check for client state
    if (!client) {
      toast.error("Client data not loaded, cannot delete.");
      return;
    }
    const clientName = client.clientName; // Now safe to access
    if (window.confirm(`Are you sure you want to delete ${clientName}? This action cannot be undone.`)) {
      try {
        const { error } = await supabase
          .from('clients')
          .delete()
          .eq('id', clientId);

        if (error) throw error;
        
        toast.success('Client deleted successfully!');
        router.push('/dashboard/clients'); // Navigate back to the list
      } catch (error: any) {
        console.error('Error deleting client:', error);
        toast.error('Error deleting client: ' + error.message);
      }
    }
  };

  const handleDownloadFile = (fileUrl: string, fileName: string) => { // Added fileName parameter
    console.log('[ClientDetailPage] Attempting to download:', { fileUrl, fileName }); // Logging parameters
    // Create a temporary link element
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = fileName; // Use fileName for the download attribute
    link.style.display = 'none';

    // Append to the DOM, click, and remove
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShareClient = async () => {
    // Implementation for updating shareable link
    // This is a placeholder and should be implemented based on your requirements
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
        // Update client state with the new token
        setClient(prevClient => prevClient ? { ...prevClient, shareableLinkToken: data.new_token } : null);
        // Optionally, copy to clipboard
        copyToClipboard(`${typeof window !== 'undefined' ? window.location.origin : ''}/share/${data.new_token}`);
      } else if (data && data.existing_token) {
         toast.info('Shareable link already exists and is up to date.');
         copyToClipboard(`${typeof window !== 'undefined' ? window.location.origin : ''}/share/${data.existing_token}`);
      }
       else {
        toast.info('Shareable link processed.'); // Generic message if no specific token status
      }
    } catch (error: any) {
      console.error('Error creating/updating shareable link:', error);
      toast.error(`Failed to process shareable link: ${error.message}`);
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
      router.push('/login'); // Redirect to login if not authenticated
      return;
    }

    const { error } = await supabase
      .from('client_notes')
      .insert([
        {
          client_id: clientId,
          note: newNoteContent,
          created_by: user.id,
          // created_at will be set by the database default
        },
      ]);

    setAddingNote(false);
    if (error) {
      console.error('Error adding client note:', error);
      toast.error(`Failed to add note: ${error.message}`);
    } else {
      toast.success('Note added successfully!');
      setNewNoteContent('');
      // fetchClientNotes(clientId); // Direct call is kept, but also trigger effect
      // Trigger the useEffect that depends on refreshFiles to ensure notes are re-fetched
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
      // Refresh notes list
      setRefreshFiles(prev => prev + 1);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch (error) {
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
    // No direct refresh of files here, but we will update the client state

    const newFileRecord: ClientFileRecord = {
      fileName,
      fileUrl,
      // Removed: id, fileType, fileSize, uploadedAt, clientId
    };

    // Add the new file to the client's recentFiles in the local state
    // and then update the client record in Supabase
    const updatedRecentFiles = [newFileRecord, ...(client.recentFiles || [])];

    try {
      const { error: updateError } = await supabase
        .from('clients')
        .update({ recent_files: updatedRecentFiles }) // Store as JSON/JSONB
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
        setRefreshFiles(prev => prev + 1); // Refresh to show updated file list if necessary
      }
    } catch (error) {
      console.error('An unexpected error occurred while updating client record:', error);
      toast.error('An unexpected error occurred while saving file information.');
    }
  };

  // --- Task Action Handlers (Defined in component scope) --- 
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
    } catch (err: any) {
      console.error('Failed to update task stage:', err);
      setClientTasks(prevTasks => prevTasks.map(task => task.id === taskId ? { ...task, stage: originalStage } : task));
      toast.error('Failed to move task. Please try again.');
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
    } catch (err: any) {
      console.error('Failed to delete task:', err);
      toast.error('Failed to clear task. Ensure RLS allows delete.');
    }
  };

  // Function to trigger AI analysis (FULL ANALYSIS)
  const handleAnalyzeDocuments = async () => {
    if (!client || !client.id) {
      toast.error("Client data not available to start analysis.");
      return;
    }

    // Optimistic UI update: Add user's action to chat
    const userActionMessage: ChatMessage = {
      id: `user-action-${Date.now()}`,
      type: 'user',
      content: "Requesting full document analysis...",
      timestamp: new Date().toISOString(),
    };
    setChatDisplayMessages(prev => [...prev, userActionMessage]);
    setCustomUserQuestion(''); // Clear input if it was used to trigger

    setIsAnalyzing(true);
    setAnalysisError(null);
    // toast.info("Starting full AI document analysis..."); // Toast is less needed with chat updates

    // Start AI typing simulation
    let stepIndex = 0;
    setAiActionStep(aiProcessingSteps[stepIndex]);
    if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
    typingIntervalRef.current = setInterval(() => {
      stepIndex++;
      if (stepIndex < aiProcessingSteps.length) {
        setAiActionStep(aiProcessingSteps[stepIndex]);
      } else {
        // Optional: could cycle back or hold last message, for now, just hold
        // clearInterval(typingIntervalRef.current as NodeJS.Timeout);
        // setAiActionStep("Finalizing report..."); // Keep a persistent message if needed
      }
    }, 2500); // Adjust timing as desired

    try {
      if (!client) return; // ADDED FOR LINTER SATISFACTION
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
      
      // Directly update client state
      setClient(prevClient => {
        if (!prevClient) return null;
        return {
          ...prevClient,
          ai_document_status: responseData.analysis?.status as Client['ai_document_status'],
          ai_document_notes: responseData.analysis?.notes,
          last_ai_analysis_at: new Date().toISOString(), // The backend sets this, but we can mirror it
        };
      });

    } catch (e: any) {
      console.error('Error during full AI analysis:', e);
      const errorMsg = e.message || 'An unexpected error occurred during full analysis.';
      setAnalysisError(errorMsg);
      toast.error(`Full AI analysis failed: ${errorMsg}`);
    } finally {
      setIsAnalyzing(false);
      clearInterval(typingIntervalRef.current);
    }
  };

  // Function to ask a custom question to the AI
  const handleAskCustomQuestion = async () => {
    if (!client || !client.id) {
      toast.error("Client data not available for custom question.");
      return;
    }
    if (!customUserQuestion.trim()) {
      toast.info("Please enter a question.");
      return;
    }

    // Optimistic UI update: Add user's question to chat
    const userMessage: ChatMessage = {
      id: `user-q-${Date.now()}`,
      type: 'user',
      content: customUserQuestion,
      timestamp: new Date().toISOString(),
    };
    setChatDisplayMessages(prev => [...prev, userMessage]);

    setIsAskingQuestion(true);
    setAnalysisError(null);
    // toast.info("Sending your question to the AI..."); // Toast less needed

    // Start AI typing simulation (can be simpler for questions)
    let stepIndex = 0;
    const questionSteps = ["Thinking...", "Searching documents for relevant information...", "Formulating answer..."];
    setAiActionStep(questionSteps[stepIndex]);
    if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
    typingIntervalRef.current = setInterval(() => {
      stepIndex++;
      if (stepIndex < questionSteps.length) {
        setAiActionStep(questionSteps[stepIndex]);
      } else {
        // clearInterval(typingIntervalRef.current as NodeJS.Timeout);
      }
    }, 2000);

    try {
      if (!client) return; // ADDED FOR LINTER SATISFACTION
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
      
      // Directly update client state (only notes)
      setClient(prevClient => {
        if (!prevClient) return null;
        return {
          ...prevClient,
          ai_document_notes: responseData.analysis?.notes, // Backend appends question & answer to existing notes
        };
      });
      setCustomUserQuestion(''); // Clear the question input

    } catch (e: any) {
      console.error('Error during custom AI question:', e);
      const errorMsg = e.message || 'An unexpected error occurred while asking the question.';
      setAnalysisError(errorMsg);
      toast.error(`Failed to get answer: ${errorMsg}`);
    } finally {
      setIsAskingQuestion(false);
      clearInterval(typingIntervalRef.current);
    }
  };

  // Helper function to parse the AI notes string into structured messages
  function parseAiNotesToMessages(aiNotesString: string | null | undefined, initialAnalysisTimestamp?: string | null): ChatMessage[] {
    if (!aiNotesString?.trim()) {
      return [];
    }

    const messages: ChatMessage[] = [];
    let messageIdCounter = 0;

    const qnaSeparator = "\n\n---\n";
    const segments = aiNotesString.split(new RegExp(qnaSeparator.replace(/\n/g, '\\n')));

    const firstSegment = segments.shift()?.trim();

    if (firstSegment) {
      const userQuestionPattern = /\*\*User Question \(answered on (.*?)\):\*\*\s*([\s\S]*?)(?=\n\*\*AI Answer:\*\*|$)/;
      const isFirstSegmentQnA = userQuestionPattern.test(firstSegment);

      if (isFirstSegmentQnA) {
        segments.unshift(firstSegment); // Put it back to be processed as a Q&A
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
          // If it's not a Q&A pair and not the first segment, treat as general AI content if it doesn't directly follow a user message.
          // This avoids creating an extra AI bubble if an AI answer was already captured by aiAnswerMatch.
           messages.push({
             id: `msg-${messageIdCounter++}`,
             type: 'ai',
             content: trimmedSegment,
           });
      }
    }
    return messages;
  }

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
      {/* Header with navigation and actions - modified for edit mode */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center">
          <Button 
            variant="outline" 
            className="mr-4"
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
        {!isEditing && client && (
          <div className="flex gap-2">
            <Button 
              variant="outline"
              onClick={handleEditClient}
            >
              <Edit className="mr-2 h-4 w-4" />
              Edit Client
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="destructive" size="icon" title="Delete Client">
                  <Trash2 className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Confirm Deletion</DialogTitle>
                </DialogHeader>
                <p>Are you sure you want to delete {client!.clientName}? This action cannot be undone.</p>
                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="destructive" onClick={handleDeleteClient}>Confirm Delete</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {isEditing && client ? (
        // EDITING MODE JSX (Form based on edit/page.tsx)
        <Card>
          <CardHeader>
            {/* Title is now above */}
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Basic Info Section */}
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
                        {/* Add other roles as needed */}
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

              {/* Company Details Section */}
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
              
              {/* Key Dates Section */}
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

              {/* Services & Engagement Section */}
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
                {/* Placeholder for services - consider multi-select or similar */}
                {/* <div>
                  <Label htmlFor="services">Services</Label>
                  <Input id="services" name="services" value={formData.services.join(', ')} onChange={(e) => setFormData(prev => ({...prev, services: e.target.value.split(',').map(s => s.trim())}))} placeholder="Comma-separated services" />
                </div> */}
              </div>

              {/* Financial Summary Section */}
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
              
              {/* Notes Section */}
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

              {/* Automation Settings Section */}
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

              {/* Required Documents - Example of handling a nested object with booleans */}
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
        // DISPLAY MODE JSX (Existing Tabs structure)
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="mb-6 grid grid-cols-4 w-full max-w-4xl">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="financial">Financial</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Client Info Card */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl text-[#1a365d]">Client Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
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
                      <Mail className="h-4 w-4 mr-2 text-[#1a365d]" />
                      <a href={`mailto:${client.clientEmail}`} className="text-blue-600 hover:underline">
                        {client.clientEmail}
                      </a>
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Phone</div>
                    <div className="font-medium flex items-center">
                      <Phone className="h-4 w-4 mr-2 text-[#1a365d]" />
                      <a href={`tel:${client.clientPhone}`} className="text-blue-600 hover:underline">
                        {client.clientPhone}
                      </a>
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Preferred Contact Method</div>
                    <div className="font-medium">{client.preferredContactMethod}</div>
                  </div>
                </CardContent>
              </Card>

              {/* Company Info Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl text-[#1a365d]">Company Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="text-sm text-gray-500">Company Name</div>
                    <div className="font-medium flex items-center">
                      <Building2 className="h-4 w-4 mr-2 text-[#1a365d]" />
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

              {/* Shareable Link Card */}
              {client && client.shareableLinkToken && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-xl text-[#1a365d]">Shareable Client Portal Link</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-gray-600">
                      Share this link with your client to allow them to upload documents directly.
                    </p>
                    <div className="flex items-center space-x-2 p-2 border rounded-md bg-gray-50">
                      <input 
                        type="text" 
                        readOnly 
                        value={`${typeof window !== 'undefined' ? window.location.origin : ''}/share/${client.shareableLinkToken}`} 
                        className="flex-grow p-2 border-none bg-transparent focus:ring-0 text-sm"
                      />
                      <Button 
                        variant="outline" 
                        size="icon" 
                        onClick={() => copyToClipboard(`${typeof window !== 'undefined' ? window.location.origin : ''}/share/${client.shareableLinkToken}`)}
                        title="Copy link"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Detailed Notes / Activity Log Card - NEW */}
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
                              {/* Show delete button only if created_by matches current user - assuming auth.uid() is available in scope or fetched */}
                              {/* For simplicity, for now, we'll add the button and RLS will enforce it */}
                              {/* We'd ideally check if noteItem.created_by === auth.data.user?.id here to conditionally render the button client-side too */} 
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteClientNote(noteItem.id)}
                                disabled={deletingNoteId === noteItem.id}
                                className="ml-2 flex-shrink-0 w-8 h-8 p-0" // Smaller icon button
                                title="Delete note"
                              >
                                {deletingNoteId === noteItem.id ? (
                                  <Clock className="h-4 w-4 animate-spin" /> // Simple loading spinner
                                ) : (
                                  <TrashIcon className="h-4 w-4 text-red-500" />
                                )}
                              </Button>
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                              Added on: {new Date(noteItem.created_at).toLocaleString()}
                              {/* TODO: Optionally display user who created (noteItem.created_by) by fetching user details if needed */}
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
            </div>

            {/* Key Dates Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-xl text-[#1a365d]">Key Dates</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                  <div>
                    <div className="text-sm text-gray-500">Year End Date</div>
                    <div className="font-medium flex items-center">
                      <Calendar className="h-4 w-4 mr-2 text-[#1a365d]" />
                      {formatDate(client.yearEndDate)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Next Accounts Due</div>
                    <div className="font-medium flex items-center">
                      <FileText className="h-4 w-4 mr-2 text-[#1a365d]" />
                      {formatDate(client.nextAccountsDue)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Next Confirmation Statement Due</div>
                    <div className="font-medium flex items-center">
                      <FileText className="h-4 w-4 mr-2 text-[#1a365d]" />
                      {formatDate(client.nextConfirmationStatementDue)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">VAT Filing Frequency</div>
                    <div className="font-medium">{client.vatFilingFrequency}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Next VAT Due</div>
                    <div className="font-medium flex items-center">
                      <AlertCircle className="h-4 w-4 mr-2 text-[#1a365d]" />
                      {formatDate(client.nextVatDue)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Corporation Tax Deadline</div>
                    <div className="font-medium flex items-center">
                      <AlertCircle className="h-4 w-4 mr-2 text-[#1a365d]" />
                      {formatDate(client.corporationTaxDeadline)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Services Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-xl text-[#1a365d]">Services & Engagement</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="text-sm text-gray-500 mb-2">Services</div>
                    <div className="flex flex-wrap gap-2">
                      {client.services && client.services.length > 0 ? (
                        client.services.map((service) => (
                          <Badge 
                            key={service} 
                            variant="outline" 
                            className="border-[#1a365d] text-[#1a365d]"
                          >
                            {service.replace('_', ' ')}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-gray-500">No services assigned</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Engagement Letter Status</div>
                    <div className="font-medium flex items-center mt-1">
                      {client.engagementLetterStatus === 'signed' ? (
                        <>
                          <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                          <span>Signed</span>
                        </>
                      ) : client.engagementLetterStatus === 'pending' ? (
                        <>
                          <Clock className="h-4 w-4 mr-2 text-amber-600" />
                          <span>Pending</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="h-4 w-4 mr-2 text-red-600" />
                          <span>Not Sent</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Notes Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-xl text-[#1a365d]">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="p-4 border rounded-md bg-gray-50 min-h-[100px] whitespace-pre-line">
                  {client.notes || 'No notes available for this client.'}
                </div>
              </CardContent>
            </Card>
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
                        Upload a document for {client.clientName}. The file will be securely stored and accessible from this client's profile.
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
                          onClick={() => handleDownloadFile(file.fileUrl, file.fileName)} // Pass fileName
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
             {/* AI Analysis Section - Placed below Recent Files */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-xl text-[#1a365d]">AI Document Analysis</CardTitle>
                  {/* "Run AI Analysis" button is MOVED from here */}
              </CardHeader>
              <CardContent className="space-y-6">
                {client ? (
                  <>
                    {/* Section 1: Overall Analysis Status (Remains at the top) */}
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

                    {/* Section 2: AI Notes & Responses Log (Chat Display Area) */}
                    {(client.ai_document_notes || isAnalyzing || isAskingQuestion) && (
                      <div className="pt-4 border-t min-h-[150px] max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600 mb-4 bg-white dark:bg-slate-900 p-4 rounded-md border dark:border-slate-700">
                        <h4 className="text-md font-semibold text-gray-700 dark:text-gray-300 mb-3 sticky top-0 bg-white dark:bg-slate-900 py-2 z-10">
                          Analysis & Conversation Log:
                        </h4>
                        {(isAnalyzing && !isAskingQuestion) && !client.ai_document_notes && <p className='text-sm text-gray-500 dark:text-gray-400 px-2'>Running full analysis, results will appear shortly...</p>}
                        {isAskingQuestion && <p className='text-sm text-gray-500 dark:text-gray-400 px-2'>Waiting for AI to answer your question...</p>}
                        
                        {client.ai_document_notes && (
                          <div className="space-y-4 px-1">
                            {parseAiNotesToMessages(client.ai_document_notes, client.last_ai_analysis_at).map((msg) => (
                              <div 
                                key={msg.id} 
                                className={`flex flex-col ${msg.type === 'user' ? 'items-end' : 'items-start'}`}
                              >
                                <div 
                                  className={`max-w-[85%] p-3 rounded-lg shadow-sm ${ 
                                    msg.type === 'user' ? 'bg-primary text-primary-foreground rounded-br-none' : 
                                    msg.type === 'system_report' ? 'bg-blue-50 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-800 w-full' : 
                                    'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-bl-none'
                                  }`}
                                >
                                  {msg.isFullReport && (
                                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1.5 border-b border-dashed pb-1.5">
                                      Full Analysis Report {msg.timestamp ? `(from ${new Date(msg.timestamp).toLocaleString()})` : ''}
                                    </div>
                                  )}
                                  {msg.type === 'user' && (
                                    <div className="flex items-center text-xs text-primary-foreground/80 mb-1">
                                      <UserIcon className="h-4 w-4 mr-1.5" /> You {msg.timestamp ? `(asked on ${msg.timestamp})` : ''}
                                    </div>
                                  )}
                                  {msg.type === 'ai' && (
                                    <div className="flex items-center text-xs text-slate-500 dark:text-slate-400 mb-1">
                                      <Sparkles className="h-4 w-4 mr-1.5 text-primary" /> AI Assistant
                                    </div>
                                  )}
                                  <div className={`prose prose-sm max-w-none ${msg.type === 'user' ? 'text-primary-foreground' : msg.type === 'system_report' ? 'dark:text-blue-100' : 'dark:text-slate-200'}`}>
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                      {msg.content}
                                    </ReactMarkdown>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Initial Empty State for the Log Area */}
                    {!client.ai_document_notes && !isAnalyzing && !isAskingQuestion && (
                         <div className="text-center py-6 text-gray-500 dark:text-gray-400 min-h-[150px] flex flex-col justify-center items-center border rounded-md dark:border-slate-700">
                           <MessageCircleQuestion className="h-10 w-10 mx-auto mb-3 text-slate-400"/>
                           <p className='mb-1 font-semibold'>AI Assistant Ready</p>
                           <p className='text-xs'>Use the input below to ask a question or run a full document analysis.</p>
                         </div>
                    )}

                    {/* Section 3: Chat Input Area */}
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
                          {/* Task Details Section */}
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
                          {/* Actions Section */}
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
        </Tabs>
      ) : (
        <div className="text-center py-12">
          <div className="text-2xl font-semibold text-[#1a365d]">Client data not available.</div>
        </div>
      )}
    </div>
  );
} 