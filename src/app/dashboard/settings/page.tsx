'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, Info, Loader2, AlertTriangle } from 'lucide-react';
import TiptapEditor from './TiptapEditor';
import { Checkbox } from "@/components/ui/checkbox"; // Added for services

interface Profile {
  id: string;
  email: string;
  company_name: string;
  role: string;
  accountancy_name: string;
  created_at: string;
  location?: string; // Added location
  services_offered?: string[]; // Added services_offered
}

// Interface for Alert Templates
interface AlertTemplate {
  alert_type: string;
  subject: string;
  message_template: string;
  updated_at?: string;
  schedule_index: number;
}

// Helper function to get descriptions for template types
const getTemplateDescription = (alertType: string): string => {
  switch (alertType) {
    case 'NEXT_ACCOUNTS_DUE':
      return 'Reminders about upcoming statutory accounts filings with Companies House.';
    case 'NEXT_CONFIRMATION_STATEMENT_DUE':
      return 'Notifications about confirmation statement deadlines.';
    case 'NEXT_VAT_DUE':
      return 'Alerts for upcoming VAT return submissions.';
    case 'CORPORATION_TAX_DEADLINE':
      return 'Reminders for corporation tax payment deadlines.';
    case 'CLIENT_TASK':
      return 'Generic task reminders for specific client activities.';
    case 'DEFAULT':
      return 'General purpose reminder template used when no specific template is available.';
    default:
      return 'Customize this alert message template.';
  }
};

// Define the list of accountancy services
const ukAccountancyServices = [
  // Core Accounting & Tax
  "Annual Accounts Preparation",
  "Self Assessment Tax Returns",
  "Corporation Tax",
  "VAT Returns & Advice",
  "Bookkeeping",
  "Payroll Services",
  "Company Secretarial",
  // Specialist & Advisory
  "Management Accounts & Reporting",
  "Business Startup & Formation",
  "Business Planning & Forecasting",
  "Capital Gains Tax",
  "Inheritance Tax Planning",
  "Research & Development (R&D) Tax Credits",
  "Making Tax Digital (MTD) Compliance",
  "Audit & Assurance",
  "Forensic Accounting",
  "Insolvency & Restructuring",
  "Cloud Accounting Software Advice", // e.g., Xero, QuickBooks, Sage
  "HMRC Investigations Support"
];

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    company_name: '',
    accountancy_name: '',
    location: '', // Added location
    services_offered: [] as string[] // Added services_offered
  });
  const [formErrors, setFormErrors] = useState({
    email: '',
    company_name: '',
    accountancy_name: '',
    location: '' // Added location error field
  });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const router = useRouter();

  // --- Alert Templates State ---
  const [templates, setTemplates] = useState<AlertTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [savingTemplateType, setSavingTemplateType] = useState<string | null>(null);
  const [savingTemplateIndex, setSavingTemplateIndex] = useState<number | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) return;

        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (error) {
          console.error('Error fetching profile:', error);
          toast.error('Failed to load profile data');
          return;
        }

        setProfile(data);
        setFormData({
          email: data.email || '',
          company_name: data.company_name || '',
          accountancy_name: data.accountancy_name || '',
          location: data.location || '', // Initialize location
          services_offered: data.services_offered || [] // Initialize services_offered
        });
      } catch (error) {
        console.error('Error:', error);
        toast.error('Failed to load profile data');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  useEffect(() => {
    const fetchTemplates = async () => {
      setIsLoadingTemplates(true);
      try {
        const response = await fetch('/api/settings/alert-templates');
        if (!response.ok) {
          throw new Error('Failed to fetch alert templates');
        }
        // Raw data from API will be like: { id, user_id, alert_type, subject, body, ... }
        const rawData: Array<{
          alert_type: string;
          subject: string; // Subject is available from API
          body: string;    // Body is available from API
          updated_at?: string;
        }> = await response.json();

        // Transform rawData to fit the AlertTemplate interface expected by the UI
        const transformedData: AlertTemplate[] = rawData.map(item => ({
          alert_type: item.alert_type,
          subject: item.subject,
          message_template: item.body, // Use body for message_template
          schedule_index: 0,          // Assume all are primary templates
          updated_at: item.updated_at,
        }));
        
        setTemplates(transformedData || []);
      } catch (error: unknown) {
        console.error('Error fetching templates:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        toast.error(`Error loading templates: ${errorMessage}`);
        setTemplates([]); // Set empty on error
      } finally {
        setIsLoadingTemplates(false);
      }
    };

    if (profile && profile.id) {
      fetchTemplates();
    }
  }, [profile]);

  const validateForm = () => {
    let isValid = true;
    const errors = {
      email: '',
      company_name: '',
      accountancy_name: '',
      location: '' // Initialize location error
    };

    // Email validation
    if (!formData.email) {
      errors.email = 'Email is required';
      isValid = false;
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = 'Email address is invalid';
      isValid = false;
    }

    // Basic validation for location (optional)
    // if (!formData.location) {
    //   errors.location = 'Location is required';
    //   isValid = false;
    // }

    setFormErrors(errors);
    return isValid;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear error when user types
    if (formErrors[name as keyof typeof formErrors]) {
      setFormErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handleServiceChange = (service: string, checked: boolean) => {
    setFormData(prev => {
      const currentServices = prev.services_offered || [];
      if (checked) {
        if (!currentServices.includes(service)) {
          return { ...prev, services_offered: [...currentServices, service] };
        }
      } else {
        return { ...prev, services_offered: currentServices.filter(s => s !== service) };
      }
      return prev;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!profile) return;
    if (!validateForm()) return;
    
    try {
      setUpdating(true);
      
      const { error } = await supabase
        .from('profiles')
        .update({
          company_name: formData.company_name,
          accountancy_name: formData.accountancy_name,
          // email: formData.email, // Typically email updates are handled separately due to verification
          location: formData.location, // Add location to update
          services_offered: formData.services_offered // Add services_offered to update
        })
        .eq('id', profile.id);

      if (error) {
        toast.error('Failed to update profile');
        console.error('Error updating profile:', error);
        return;
      }

      // Update local profile state
      setProfile({
        ...profile,
        email: formData.email,
        company_name: formData.company_name,
        accountancy_name: formData.accountancy_name,
        location: formData.location, // Update location
        services_offered: formData.services_offered // Update services_offered
      });

      toast.success('Profile updated successfully!');
      
      // Also update the auth email if it was changed
      if (formData.email !== profile.email) {
        const { error: authError } = await supabase.auth.updateUser({
          email: formData.email,
        });
        
        if (authError) {
          toast.error('Email updated in profile but failed to update in authentication');
          console.error('Error updating auth email:', authError);
        } else {
          toast.info('A confirmation email may be sent to verify your new email address');
        }
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile');
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!profile) return;
    
    setDeleteLoading(true);
    
    try {
      // 1. Update clients to be placed back in new leads (created_by)
      const { error: clientsCreatedByError } = await supabase
        .from('clients')
        .update({ 
          created_by: null
        })
        .eq('created_by', profile.id);

      if (clientsCreatedByError) {
        toast.error('Failed to release clients (created_by)');
        console.error('Error updating client created_by:', clientsCreatedByError);
        // Potentially return or decide how to handle partial failure
      }

      // 1b. Update clients to nullify updated_by
      const { error: clientsUpdatedByError } = await supabase
        .from('clients')
        .update({ updated_by: null })
        .eq('updated_by', profile.id);

      if (clientsUpdatedByError) {
        toast.error('Failed to release clients (updated_by)');
        console.error('Error updating client updated_by:', clientsUpdatedByError);
        // Potentially return
      }
      
      // 1c. Delete client_documents uploaded_by this user
      const { error: documentsError } = await supabase
        .from('client_documents')
        .delete()
        .eq('uploaded_by', profile.id);
      if (documentsError) {
        toast.error('Failed to delete user documents');
        console.error('Error deleting client documents:', documentsError);
        // Potentially return
      }

      // 1d. Delete client_notes created_by this user
      const { error: notesError } = await supabase
        .from('client_notes')
        .delete()
        .eq('created_by', profile.id);
      if (notesError) {
        toast.error('Failed to delete user notes');
        console.error('Error deleting client notes:', notesError);
        // Potentially return
      }

      // 1e. Delete client_alerts created_by this user
      const { error: alertsError } = await supabase
        .from('client_alerts')
        .delete()
        .eq('created_by', profile.id);
      if (alertsError) {
        toast.error('Failed to delete user alerts');
        console.error('Error deleting client alerts:', alertsError);
        // Potentially return
      }

      // 1f. Update drafted_reminders to nullify reviewed_by
      const { error: remindersReviewedByError } = await supabase
        .from('drafted_reminders')
        .update({ reviewed_by: null })
        .eq('reviewed_by', profile.id);
      if (remindersReviewedByError) {
        toast.error('Failed to update drafted reminders (reviewed_by)');
        console.error('Error updating drafted_reminders reviewed_by:', remindersReviewedByError);
        // Potentially return
      }
      
      // 2. Delete user profile
      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', profile.id);
        
      if (profileError) {
        toast.error('Failed to delete profile');
        console.error('Error deleting profile:', profileError);
        return;
      }
      
      // 3. Delete auth user via API Route
      const deleteAuthUserResponse = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: profile.id }),
      });

      if (!deleteAuthUserResponse.ok) {
        const errorData = await deleteAuthUserResponse.json();
        // Log the error, but proceed with sign out as profile and client links are handled.
        // You might want to show a more specific error to the user here in a real app.
        console.error('Failed to delete auth user (via API route):', errorData.error);
        toast.error(`Account data partially cleared, but failed to delete authentication record: ${errorData.error || 'Unknown error'}`);
        // Optionally, do not proceed to sign out if auth user deletion is critical and failed.
        // For now, we proceed as per original logic, but with an error toast.
      } else {
        toast.success('Your account has been deleted');
      }
      
      // 4. Sign out and redirect
      await supabase.auth.signOut();
      router.push('/login');
      
    } catch (error: unknown) {
      toast.error('An error occurred while deleting your account');
      console.error('Error:', error);
    } finally {
      setDeleteLoading(false);
      setDeleteDialogOpen(false);
    }
  };

  // Handle changes in template textareas
  const handleTemplateChange = (alertType: string, scheduleIndex: number, newMessage: string) => {
    setTemplates(prevTemplates =>
      prevTemplates.map(t =>
        t.alert_type === alertType && t.schedule_index === scheduleIndex
          ? { ...t, message_template: newMessage }
          : t
      )
    );
  };

  const handleTemplateSubjectChange = (alertType: string, scheduleIndex: number, newSubject: string) => {
    setTemplates(prevTemplates =>
      prevTemplates.map(t =>
        t.alert_type === alertType && t.schedule_index === scheduleIndex
          ? { ...t, subject: newSubject }
          : t
      )
    );
  };

  // Save a specific template
  const handleSaveTemplate = async (alertType: string, scheduleIndex: number) => {
    const templateToSave = templates.find(t => t.alert_type === alertType && t.schedule_index === scheduleIndex);
    if (!templateToSave) {
      toast.error('Cannot find template to save.');
      return;
    }

    setSavingTemplateType(alertType);
    setSavingTemplateIndex(scheduleIndex);
    try {
      // The API expects alertType in the query, and subject/body in the JSON payload for PUT
      const response = await fetch(`/api/settings/alert-templates?alertType=${encodeURIComponent(alertType)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: templateToSave.subject, // Send the original subject
          body: templateToSave.message_template // Send message_template as body
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to save template. Status: ${response.status}`);
      }
      toast.success(`Template '${alertType.replace(/_/g, ' ')}' saved successfully!`);
    } catch (error: unknown) {
      console.error('Error saving template:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error(`Error saving template: ${errorMessage}`);
      // Optionally revert changes if save fails
    } finally {
      setSavingTemplateType(null);
      setSavingTemplateIndex(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Settings</h1>
      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="mb-6 bg-gray-100 p-1 rounded-lg grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-1 w-full md:w-auto">
          <TabsTrigger value="profile" className="data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-md transition-all">
            Profile
          </TabsTrigger>
          {/* <TabsTrigger value="general" className="data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-md transition-all">
            General
          </TabsTrigger> */}
          <TabsTrigger value="alert-templates" className="data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-md transition-all">
            Alert Templates
          </TabsTrigger>
          <TabsTrigger value="account" className="data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-md transition-all">
             Account
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>User Profile</CardTitle>
              <CardDescription>Manage your account details, location, and services offered.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                    disabled // Email is usually not changed here or requires verification
                    className="mt-1"
                />
                  {formErrors.email && <p className="text-red-500 text-sm mt-1">{formErrors.email}</p>}
              </div>
                <div>
                <Label htmlFor="company_name">Company Name</Label>
                <Input
                  id="company_name"
                  name="company_name"
                  value={formData.company_name}
                  onChange={handleChange}
                    className="mt-1"
                />
                   {formErrors.company_name && <p className="text-red-500 text-sm mt-1">{formErrors.company_name}</p>}
              </div>
                <div>
                  <Label htmlFor="accountancy_name">Accountancy Name (if applicable)</Label>
                <Input
                  id="accountancy_name"
                  name="accountancy_name"
                  value={formData.accountancy_name}
                  onChange={handleChange}
                    className="mt-1"
                />
                  {formErrors.accountancy_name && <p className="text-red-500 text-sm mt-1">{formErrors.accountancy_name}</p>}
                </div>

                {/* Added Location Field */}
                <div>
                  <Label htmlFor="location">Location / Address</Label>
                  <Input
                    id="location"
                    name="location"
                    value={formData.location}
                    onChange={handleChange}
                    placeholder="e.g., 123 Main St, London, UK"
                    className="mt-1"
                  />
                  {formErrors.location && <p className="text-red-500 text-sm mt-1">{formErrors.location}</p>}
                </div>

                {/* Added Services Offered Checkboxes */}
                <div>
                  <Label className="mb-2 block">Services Offered</Label>
                  <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3 p-4 border rounded-md max-h-72 overflow-y-auto">
                    {ukAccountancyServices.map((service, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <Checkbox
                          id={`service-${index}`}
                          checked={(formData.services_offered || []).includes(service)}
                          onCheckedChange={(checkedState) => {
                            const isChecked = checkedState === true;
                            handleServiceChange(service, isChecked);
                          }}
                        />
                        <Label htmlFor={`service-${index}`} className="font-normal text-sm cursor-pointer">
                          {service}
                        </Label>
              </div>
                    ))}
                  </div>
            </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0 sm:space-x-4 pt-4">
                    <Button type="submit" disabled={updating} className="w-full sm:w-auto">
                    {updating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Changes
              </Button>
              <Button 
                type="button"
                        variant="destructive"
                        onClick={() => setDeleteDialogOpen(true)}
                        disabled={deleteLoading}
                className="w-full sm:w-auto"
                    >
                        {deleteLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <AlertTriangle className="mr-2 h-4 w-4" />}
                        Delete Account
              </Button>
          </div>
        </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alert-templates" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Alert Message Templates</CardTitle>
              <CardDescription>
                Customize the content of automated alert messages sent to clients or drafted for review.
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md text-sm">
                  <Info className="inline-block w-4 h-4 mr-1.5 -mt-0.5 text-blue-600" />
                  Available Placeholders:
                  <span className="mx-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-mono text-xs">{'{{client_name}}'}</span>
                  <span className="mx-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-mono text-xs">{'{{company_name}}'}</span>
                  <span className="mx-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-mono text-xs">{'{{due_date}}'}</span>
                  <span className="mx-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-mono text-xs">{'{{client_portal_link}}'}</span>
                  <span className="mx-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-mono text-xs">{'{{task_title}}'}</span>
                  <span className="mx-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-mono text-xs">{'{{task_description}}'}</span>
                  <p className="mt-1.5 text-xs text-gray-600">Ensure your templates are valid HTML. Placeholders are case-sensitive.</p>
                </div>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              {isLoadingTemplates ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="ml-2 text-muted-foreground">Loading templates...</p>
                </div>
              ) : templates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <AlertTriangle className="h-10 w-10 text-orange-400 mb-3" />
                  <p className="font-semibold text-lg">No Alert Templates Found</p>
                  <p className="text-sm text-muted-foreground">
                    System alert templates could not be loaded. This might be due to a network issue or a problem with the configuration.
                    Please try refreshing the page. If the problem persists, contact support.
                  </p>
                </div>
              ) : (
                // Group templates by alert_type for display
                Object.entries(
                  templates.reduce((acc, template) => {
                    if (!acc[template.alert_type]) {
                      acc[template.alert_type] = [];
                    }
                    acc[template.alert_type].push(template);
                    return acc;
                  }, {} as Record<string, AlertTemplate[]>)
                ).map(([alertType, typeTemplates]) => (
                  <div key={alertType} className="p-4 border rounded-lg bg-slate-50/50">
                    <h3 className="text-lg font-semibold mb-1 capitalize">
                      {alertType.replace(/_/g, ' ').toLowerCase()}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      {/* Add a description for each template type if available, or a generic one */}
                      {getTemplateDescription(alertType)}
                    </p>
                    {typeTemplates.map((template, innerMapIndex) => ( // Use innerMapIndex for a unique key
                      <div key={`${alertType}-${innerMapIndex}`} className="space-y-2 mt-2">
                        <Label htmlFor={`template-subject-${alertType}-${template.schedule_index}`} className="text-sm font-medium">Subject</Label>
                        <Input
                          id={`template-subject-${alertType}-${template.schedule_index}`}
                          value={template.subject}
                          onChange={(e) => handleTemplateSubjectChange(alertType, template.schedule_index, e.target.value)}
                          className="bg-white"
                        />
                        <Label htmlFor={`template-message-${alertType}-${template.schedule_index}`} className="text-sm font-medium">
                          Message Template (Primary Alert)
                        </Label>
                        <TiptapEditor
                          content={template.message_template}
                          onChange={(newContent: string) => handleTemplateChange(alertType, template.schedule_index, newContent)}
                        />
                        <div className="flex justify-end mt-3">
                          <Button
                            onClick={() => handleSaveTemplate(alertType, template.schedule_index)}
                            disabled={savingTemplateType === alertType && savingTemplateIndex === template.schedule_index}
                            size="sm"
                            variant="default"
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                          >
                            {savingTemplateType === alertType && savingTemplateIndex === template.schedule_index ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Save className="mr-2 h-4 w-4" />
                            )}
                            Save Template
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="account">
            <Card className="border-red-200 bg-red-50">
               <CardHeader>
                 <CardTitle className="text-red-700">Account Management</CardTitle>
                 <CardDescription className="text-red-600">
                   Manage your account settings or delete your account.
                 </CardDescription>
               </CardHeader>
               <CardContent>
          <Button
            variant="destructive"
            onClick={() => setDeleteDialogOpen(true)}
                   disabled={deleteLoading}
          >
            Delete Account
          </Button>
               </CardContent>
      </Card>
        </TabsContent>

      </Tabs>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Delete Account</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete your account? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-4">
            <Button 
              variant="outline" 
              onClick={() => setDeleteDialogOpen(false)}
              className="sm:w-auto"
              disabled={deleteLoading}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteAccount}
              className="sm:w-auto"
              disabled={deleteLoading}
            >
              {deleteLoading ? (
                <>
                  <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-b-transparent"></span>
                  Deleting...
                </>
              ) : 'Delete Account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 