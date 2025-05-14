'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { ChevronLeft, Save } from 'lucide-react';
import { ClientFileRecord } from '@/lib/models'; // Assuming this is the correct path

// Copied Client interface from [id]/page.tsx for consistency
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
}

// FormData will exclude id as it's not directly editable in the form itself
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


export default function EditClientPage() {
  const router = useRouter();
  const params = useParams(); // Get params object
  const id = params && typeof params.id === 'string' ? params.id : undefined; // Safely get id, checking for null params
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) {
      toast.error('Client ID not found.');
      router.push('/dashboard/clients');
      return;
    }

    async function fetchClient() {
      setLoading(true);
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        toast.error('Authentication error. Please log in again.');
        router.push('/login');
        return;
      }

      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('Error fetching client:', error);
        toast.error('Failed to fetch client details.');
        setLoading(false);
        router.push(`/dashboard/clients/${id}`); // Go back to detail page if fetch fails
        return;
      }

      if (data) {
        // Convert snake_case from DB to camelCase for the form
        const clientData: Client = {
          id: data.id,
          clientName: data.client_name || '',
          clientEmail: data.client_email || '',
          clientPhone: data.client_phone || '',
          clientRole: data.client_role || '',
          preferredContactMethod: (data.preferred_contact_method || 'email') as Client['preferredContactMethod'],
          companyName: data.company_name || '',
          companyNumber: data.company_number || '',
          companyAddress: data.registered_office_address || '',
          sicCode: data.sic_code || '',
          companyStatus: (data.company_status || 'active') as Client['companyStatus'],
          incorporationDate: data.incorporation_date || '',
          yearEndDate: data.year_end_date || '',
          nextAccountsDue: data.next_accounts_due || '',
          nextConfirmationStatementDue: data.next_confirmation_statement_due || '',
          vatFilingFrequency: (data.vat_filing_frequency || 'quarterly') as Client['vatFilingFrequency'],
          nextVatDue: data.next_vat_due || '',
          payrollDeadlines: data.payroll_deadlines || [],
          corporationTaxDeadline: data.corporation_tax_deadline || '',
          services: data.services || [],
          engagementLetterStatus: (data.engagement_letter_signed === true ? 'signed' : (data.engagement_letter_signed === false ? 'not_sent' : 'pending')) as Client['engagementLetterStatus'],
          requiredDocuments: data.required_documents ? (typeof data.required_documents === 'string' ? JSON.parse(data.required_documents) : data.required_documents) : { bankStatements: false, receipts: false, payrollSummaries: false },
          taskStatus: (data.task_status || 'waiting') as Client['taskStatus'],
          recentFiles: data.recent_files ? (typeof data.recent_files === 'string' ? JSON.parse(data.recent_files) : data.recent_files) : [],
          lastInteractionNotes: data.last_interaction_notes || '',
          reminderSchedule: data.reminder_schedule ? (typeof data.reminder_schedule === 'string' ? JSON.parse(data.reminder_schedule) : data.reminder_schedule) : { vatReminderDays: 30, accountsReminderDays: 30, confirmationStatementReminderDays: 30 },
          customAlerts: data.custom_alerts ? (typeof data.custom_alerts === 'string' ? JSON.parse(data.custom_alerts) : data.custom_alerts) : { missedReminders: false, documentOverdue: false },
          automatedEmails: data.automated_emails === true,
          lastYearTurnover: data.last_year_turnover || 0,
          profitLoss: data.profit_loss || 0,
          taxOwed: data.tax_owed || 0,
          notes: data.notes || '',
          meetingLog: data.meeting_log || [],
          emailHistory: data.email_history || [],
          shareableLinkToken: data.shareable_link_token || undefined,
        };
        setClient(clientData);
        // Set form data, excluding fields not in FormData type
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _clientId, recentFiles: _recentFiles, meetingLog: _meetingLog, emailHistory: _emailHistory, shareableLinkToken: _shareableLinkToken, ...formDataFromClient } = clientData;
        setFormData(formDataFromClient);
      }
      setLoading(false);
    }

    fetchClient();
  }, [id, router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;
  
    setFormData((prev) => {
      const keys = name.split('.');
      if (keys.length > 1) {
        const nestedState = { ...prev };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let currentLevel: Record<string, any> = nestedState;
        for (let i = 0; i < keys.length - 1; i++) {
          if (typeof currentLevel[keys[i]] !== 'object' || currentLevel[keys[i]] === null) {
            currentLevel[keys[i]] = {};
          }
          currentLevel[keys[i]] = { ...currentLevel[keys[i]] };
          currentLevel = currentLevel[keys[i]];
        }
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
  
  const handleSelectChange = (name: string, value: string) => {
     setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!id || !client) {
      toast.error('Client data is not loaded properly.');
      return;
    }
    setSaving(true);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
        toast.error('User not authenticated. Please log in again.');
        setSaving(false);
        // Optionally, redirect to login: router.push('/login');
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
      automated_emails: formData.automatedEmails,
      last_year_turnover: formData.lastYearTurnover,
      profit_loss: formData.profitLoss,
      tax_owed: formData.taxOwed,
      notes: formData.notes,
      updated_by: user.id,
      // Note: 'id', 'recent_files', 'meeting_log', 'email_history', 'shareable_link_token' are not updated here directly
      // 'created_by' should not be changed on update
    };

    const { error } = await supabase
      .from('clients')
      .update(clientDataToSave)
      .eq('id', id);

    setSaving(false);
    if (error) {
      console.error('Error updating client:', error);
      toast.error(`Error updating client: ${error.message}`);
    } else {
      toast.success('Client updated successfully!');
      router.push(`/dashboard/clients/${id}`); // Navigate back to the client detail page
    }
  };

  if (loading) {
    return <div className="container mx-auto p-6 text-center">Loading client details...</div>;
  }

  if (!client) {
    return <div className="container mx-auto p-6 text-center">Client not found or could not be loaded.</div>;
  }

  return (
    <div className="container mx-auto p-6">
      <Button 
        variant="outline" 
        className="mb-6"
        onClick={() => router.push(`/dashboard/clients/${id}`)}
      >
        <ChevronLeft className="mr-2 h-4 w-4" />
        Back to Client Details
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-[#1a365d]">Edit Client: {client.clientName}</CardTitle>
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

            {/* Services & Engagement Section (Simplified for now) */}
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
              {/* Consider adding a multi-select or checklist for services if needed */}
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

            {/* Add more sections for other Client fields as needed, e.g., Automations, Task & Documents */}
            {/* Example for a nested field (Reminder Schedule) */}
            <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-700 border-b pb-2">Automation Settings</h3>
                 <div>
                  <Label htmlFor="automatedEmails">Automated Emails Enabled</Label>
                  <Select name="automatedEmails" value={formData.automatedEmails.toString()} onValueChange={(value) => handleSelectChange('automatedEmails', value)}>
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


            <div className="flex justify-end space-x-4 pt-6 border-t">
              <Button 
                variant="outline" 
                type="button" 
                onClick={() => router.push(`/dashboard/clients/${id}`)}
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
    </div>
  );
} 