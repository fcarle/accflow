import React, { useState, useEffect, useCallback } from 'react';
// useRouter might not be needed here anymore if navigation is handled by onAlertCreated prop
// import { useRouter } from 'next/router'; 
import TiptapEditor from './TiptapEditor'; // Import TiptapEditor using relative path

interface ClientOption {
  id: string;
  client_name: string;
}

// Define the structure for a ReminderSchedule
interface ReminderSchedule {
  id?: string; // For existing schedules
  days_before_due: number;
  alert_message?: string | null; // Optional, will use parent alert message if not provided
  is_active?: boolean; // Optional, will default to true
  use_custom_message?: boolean; // Whether to use a custom message for this reminder
}

// Define the structure for the actual form data state
interface ClientAlertFormData {
  client_id: string;
  alert_type: string;
  subject: string;
  body: string;
  days_before_due: number | string;
  is_active: boolean;
  notification_preference: 'DRAFT_FOR_TEAM' | 'SEND_DIRECT_TO_CLIENT';
  source_task_id?: string; // Keep as string, backend handles empty string to null
  use_multi_schedule: boolean;
  reminder_schedules: ReminderSchedule[];
}

// Add YourClientAlertType for alertToEdit prop
interface YourClientAlertType { 
  id: string; 
  alert_type: string; 
  days_before_due: number; 
  notification_preference: 'DRAFT_FOR_TEAM' | 'SEND_DIRECT_TO_CLIENT';
  is_active: boolean; 
  subject?: string | null;
  body: string;
  client_id: string; // Ensure client_id is part of this type
  source_task_id?: string | null;
  use_multi_schedule?: boolean;
  reminder_schedules?: ReminderSchedule[];
}

interface ClientAlertFormProps {
  clients: ClientOption[]; // Full list of clients for the dropdown
  apiBaseUrl: string;
  onSuccess: (message: string) => void; // Renamed from onAlertCreated and accepts a message
  initialData?: Partial<ClientAlertFormData>; // For pre-filling, e.g., client_id
  alertToEdit?: YourClientAlertType | null; // For editing existing alert
}

// Interface for the fetched template structure
interface AlertTemplate {
  id: string;
  user_id: string;
  alert_type: string;
  subject: string;
  body: string;
  created_at: string;
  updated_at?: string;
}

const alertTypes = [
  { value: 'NEXT_ACCOUNTS_DUE', label: 'Next Accounts Due' },
  { value: 'NEXT_CONFIRMATION_STATEMENT_DUE', label: 'Next Confirmation Statement Due' },
  { value: 'NEXT_VAT_DUE', label: 'Next VAT Due' },
  { value: 'CORPORATION_TAX_DEADLINE', label: 'Corporation Tax Deadline' },
  { value: 'CLIENT_TASK', label: 'Specific Client Task' },
  { value: 'DEFAULT', label: 'Default/Generic' }, // Added default
];

// Get default days before due based on reminder position
const getDefaultDaysBeforeDue = (reminderIndex: number): number => {
  // reminderIndex is 0-based, where 0 is the primary reminder
  switch (reminderIndex) {
    case 0: return 45; // Primary reminder
    case 1: return 38; // First follow-up
    case 2: return 28; // Second follow-up
    case 3: return 20; // Third follow-up
    case 4: return 18; // Fourth follow-up
    case 5: return 16; // Fifth follow-up
    default: return Math.max(15 - (reminderIndex - 6), 1); // Decrease by 1 day, minimum 1 day
  }
};

const ClientAlertForm: React.FC<ClientAlertFormProps> = ({ 
  clients, 
  apiBaseUrl, 
  onSuccess, 
  initialData,
  alertToEdit
}) => {
  const [allTemplates, setAllTemplates] = useState<AlertTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);

  // Fetch templates on mount
  useEffect(() => {
    const fetchTemplates = async () => {
      setIsLoadingTemplates(true);
      try {
        const response = await fetch('/api/settings/alert-templates');
        if (!response.ok) {
          throw new Error('Failed to fetch alert templates');
        }
        const data = await response.json();
        setAllTemplates(data || []);
        console.log('Fetched templates in ClientAlertForm:', data);
      } catch (error) {
        console.error('Error fetching templates:', error);
        // Fallback or error handling
        setAllTemplates([{
          id: 'fallback-default',
          user_id: 'system',
          alert_type: 'DEFAULT',
          subject: 'Default Reminder Subject',
          body: '<p>Default reminder for {{client_name}} about {{due_date}}.</p>',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }]);
      } finally {
        setIsLoadingTemplates(false);
      }
    };
    fetchTemplates();
  }, []);

  const getTemplateForType = useCallback((alertType: string): { subject: string, body: string } => {
    if (isLoadingTemplates) return { subject: 'Loading subject...', body: '<p>Loading template body...</p>' };
    const foundTemplate = allTemplates.find(t => t.alert_type === alertType);
    const defaultTemplate = allTemplates.find(t => t.alert_type === 'DEFAULT');
    
    if (foundTemplate) {
        return { subject: foundTemplate.subject, body: foundTemplate.body };
    }
    if (defaultTemplate) {
        return { subject: defaultTemplate.subject, body: defaultTemplate.body };
    }
    return { subject: 'Template Subject Not Found', body: '<p>Template body not found for this type.</p>' };
  }, [isLoadingTemplates, allTemplates]);

  const [formData, setFormData] = useState<ClientAlertFormData>(() => {
    const defaults: ClientAlertFormData = {
      client_id: initialData?.client_id || '',
      alert_type: initialData?.alert_type || alertTypes[0]?.value || '',
      subject: '',
      body: '',
      days_before_due: initialData?.days_before_due || getDefaultDaysBeforeDue(0),
      is_active: initialData?.is_active === undefined ? true : initialData.is_active,
      notification_preference: initialData?.notification_preference || 'DRAFT_FOR_TEAM',
      source_task_id: initialData?.source_task_id || '',
      use_multi_schedule: initialData?.use_multi_schedule || false,
      reminder_schedules: initialData?.reminder_schedules || [],
    };
    return defaults;
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If initialData.client_id is provided, it means we are in a client-specific context OR editing
  const isClientFixed = !!(initialData?.client_id || alertToEdit?.client_id);

  useEffect(() => {
    if (alertToEdit) {
      const templateContent = getTemplateForType(alertToEdit.alert_type);
      setFormData({
        client_id: alertToEdit.client_id,
        alert_type: alertToEdit.alert_type,
        subject: alertToEdit.subject || templateContent.subject,
        body: alertToEdit.body || templateContent.body,
        days_before_due: alertToEdit.days_before_due,
        is_active: alertToEdit.is_active,
        notification_preference: alertToEdit.notification_preference,
        source_task_id: alertToEdit.source_task_id || '',
        use_multi_schedule: alertToEdit.use_multi_schedule || false,
        reminder_schedules: alertToEdit.reminder_schedules || [],
      });
    } else if (initialData && !isLoadingTemplates) { 
      const templateContent = getTemplateForType(initialData.alert_type || alertTypes[0]?.value || '');
      setFormData({
        client_id: initialData.client_id || '',
        alert_type: initialData.alert_type || alertTypes[0]?.value || '',
        subject: initialData.subject || templateContent.subject,
        body: initialData.body || templateContent.body,
        days_before_due: initialData.days_before_due || getDefaultDaysBeforeDue(0),
        is_active: initialData.is_active === undefined ? true : initialData.is_active,
        notification_preference: initialData.notification_preference || 'DRAFT_FOR_TEAM',
        source_task_id: initialData.source_task_id || '',
        use_multi_schedule: initialData.use_multi_schedule || false,
        reminder_schedules: initialData.reminder_schedules || [],
      });
    } else if (!alertToEdit && !initialData && !isLoadingTemplates) {
      // Case for new alert, not editing, no specific initial data, templates loaded
      const defaultAlertType = alertTypes[0]?.value || '';
      const templateContent = getTemplateForType(defaultAlertType);
      setFormData(prev => ({
        ...prev,
        alert_type: defaultAlertType,
        subject: templateContent.subject,
        body: templateContent.body,
      }));
    }
  }, [initialData, alertToEdit, isLoadingTemplates, allTemplates, getTemplateForType]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else if (name === 'alert_type') {
      const template = getTemplateForType(value);
      const cleanBody = template.body
        .replace(/>\s+</g, '><')
        .replace(/\n\s*/g, '');

      setFormData(prev => ({
          ...prev,
          alert_type: value,
          subject: template.subject,
          body: cleanBody,
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  // Function to manually set the template for the current alert type
  const setTemplateMessage = () => {
    const template = getTemplateForType(formData.alert_type);
    // Strip unnecessary whitespace that might cause unwanted spacing
    const cleanBody = template.body
      .replace(/>\s+</g, '><')
      .replace(/\n\s*/g, '');
    
    setFormData(prev => ({ 
      ...prev, 
      subject: template.subject, 
      body: cleanBody 
    }));
  };

  // Function to add a new reminder schedule
  const addReminderSchedule = () => {
    // Add a new empty schedule
    setFormData(prev => {
      const followUpNumber = prev.reminder_schedules.length + 1;
      const defaultFollowUpMessage = getTemplateForType(prev.alert_type).body;
      const daysBeforeDue = getDefaultDaysBeforeDue(followUpNumber);
      
      return {
        ...prev,
        reminder_schedules: [
          ...prev.reminder_schedules,
          {
            days_before_due: daysBeforeDue,
            is_active: true,
            use_custom_message: false,
            alert_message: defaultFollowUpMessage
          }
        ]
      };
    });
  };

  // Function to update a specific reminder schedule
  const updateReminderSchedule = (index: number, field: keyof ReminderSchedule, value: string | number | boolean) => {
    setFormData(prev => {
      const updatedSchedules = [...prev.reminder_schedules];
      const scheduleField = field as keyof ReminderSchedule;
      let processedValue = value;
      if (field === 'days_before_due') {
        processedValue = typeof value === 'string' ? parseInt(value, 10) : value;
      } else if (field === 'is_active' || field === 'use_custom_message') {
        processedValue = typeof value === 'boolean' ? value : String(value).toLowerCase() === 'true';
      }

      updatedSchedules[index] = {
        ...updatedSchedules[index],
        [scheduleField]: processedValue
      };
      return {
        ...prev,
        reminder_schedules: updatedSchedules
      };
    });
  };

  // Function to toggle custom message for a reminder schedule
  const toggleCustomMessage = (index: number) => {
    setFormData(prev => {
      const updatedSchedules = [...prev.reminder_schedules];
      const currentSchedule = updatedSchedules[index];
      const useCustomMessage = !currentSchedule.use_custom_message;
      
      // If enabling custom message and no message exists, generate one
      if (useCustomMessage && (!currentSchedule.alert_message || currentSchedule.alert_message === '')) {
        currentSchedule.alert_message = getTemplateForType(prev.alert_type).body;
      }
      
      currentSchedule.use_custom_message = useCustomMessage;
      
      return {
        ...prev,
        reminder_schedules: updatedSchedules
      };
    });
  };

  // Function to remove a reminder schedule
  const removeReminderSchedule = (index: number) => {
    setFormData(prev => {
      const updatedSchedules = [...prev.reminder_schedules];
      updatedSchedules.splice(index, 1);
      return {
        ...prev,
        reminder_schedules: updatedSchedules
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    let currentClientId = formData.client_id;
    if (alertToEdit) {
        currentClientId = alertToEdit.client_id;
    } else if (isClientFixed && initialData?.client_id) {
        currentClientId = initialData.client_id;
    }

    if (!currentClientId) { // Combined check
        setError('Client ID is missing.');
        setIsLoading(false);
        return;
    }

    // Validate no duplicate days in reminder schedules
    if (formData.use_multi_schedule && formData.reminder_schedules.length > 0) {
      const primaryDay = typeof formData.days_before_due === 'string' 
        ? parseInt(formData.days_before_due, 10) 
        : formData.days_before_due;
      
      const allDays = [primaryDay, ...formData.reminder_schedules.map(s => s.days_before_due)];
      const uniqueDays = [...new Set(allDays)];
      
      if (allDays.length !== uniqueDays.length) {
        setError('Duplicate days before due are not allowed. Each reminder must have a unique number of days.');
        setIsLoading(false);
        return;
      }
    }

    const dataToSubmit = {
      client_id: currentClientId, // Use the determined client_id
      alert_type: formData.alert_type,
      alert_message: formData.body, // Map body to alert_message
      days_before_due: parseInt(formData.days_before_due as string, 10),
      is_active: formData.is_active,
      notification_preference: formData.notification_preference,
      source_task_id: formData.alert_type === 'CLIENT_TASK' && formData.source_task_id ? formData.source_task_id : null,
      use_multi_schedule: formData.use_multi_schedule,
      reminder_schedules: formData.reminder_schedules, // Ensure this is part of the submission if used
    };

    try {
      let response;
      let successMsg = '';

      if (alertToEdit && alertToEdit.id) {
        // Update existing alert
        response = await fetch(`${apiBaseUrl}/client-alerts/${alertToEdit.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(dataToSubmit), // Send full data, API will pick what it needs
        });
        successMsg = 'Client alert updated successfully!';
      } else {
        // Create new alert
        response = await fetch(`${apiBaseUrl}/client-alerts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(dataToSubmit),
        });
        successMsg = 'Client alert created successfully!';
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${alertToEdit ? 'update' : 'create'} alert. Status: ${response.status}`);
      }
      onSuccess(successMsg); // Call onSuccess with the message
      // Reset form only if it's a create operation and not an edit that might stay open
      if (!alertToEdit) {
         setFormData({ // Reset to initial or default state after successful creation
            client_id: initialData?.client_id || '', // Keep client_id if fixed
            alert_type: alertTypes[0]?.value || '',
            subject: '',
            body: '',
            days_before_due: getDefaultDaysBeforeDue(0),
            is_active: true,
            notification_preference: 'DRAFT_FOR_TEAM',
            source_task_id: '',
            use_multi_schedule: false,
            reminder_schedules: [],
        });
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const styles = {
    formGroup: { marginBottom: '15px' },
    label: { display: 'block', marginBottom: '5px', fontWeight: 'bold' },
    input: { width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' as const },
    select: { width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' as const },
    textarea: { width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' as const, minHeight: '80px' },
    button: { padding: '10px 15px', backgroundColor: '#0070f3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' },
    error: { color: 'red', marginBottom: '10px' },
    success: { color: 'green', marginBottom: '10px' },
    disabledLabel: { color: '#777' },
    scheduleContainer: { 
      border: '1px solid #e0e0e0', 
      borderRadius: '4px', 
      padding: '15px', 
      marginBottom: '15px', 
      backgroundColor: '#f9f9f9' 
    },
    scheduleHeader: { 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center', 
      marginBottom: '10px' 
    },
    scheduleFields: { 
      display: 'flex', 
      gap: '10px' 
    },
    scheduleInputGroup: { 
      flex: '1' 
    },
    removeButton: { 
      padding: '5px 10px', 
      backgroundColor: '#ff4d4f', 
      color: 'white', 
      border: 'none', 
      borderRadius: '4px', 
      cursor: 'pointer' 
    },
    addButton: { 
      padding: '8px 12px', 
      backgroundColor: '#52c41a', 
      color: 'white', 
      border: 'none', 
      borderRadius: '4px', 
      cursor: 'pointer', 
      marginTop: '5px' 
    },
    messageContainer: {
      border: '1px solid #d9d9d9',
      borderRadius: '4px',
      padding: '10px',
      backgroundColor: '#ffffff',
      marginTop: '10px'
    },
    messageHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '5px'
    },
    messageTemplateButton: {
      padding: '2px 8px',
      fontSize: '12px',
      backgroundColor: '#e6f7ff',
      border: '1px solid #91d5ff',
      borderRadius: '4px',
      cursor: 'pointer'
    }
  };

  // Add custom CSS styles to control paragraph spacing and list formatting
  useEffect(() => {
    // Add custom styles to the document head
    const styleId = 'email-editor-styles';
    if (!document.getElementById(styleId)) {
      const styleElement = document.createElement('style');
      styleElement.id = styleId;
      styleElement.textContent = `
        [data-email-editor] p {
          margin: 0 0 0.5em 0;
        }
        [data-email-editor] ul, [data-email-editor] ol {
          margin: 0.5em 0;
          padding-left: 20px;
        }
        [data-email-editor] li {
          margin: 0;
        }
        [data-email-editor] strong {
          font-weight: bold;
        }
        [data-email-editor] a {
          color: #0070f3;
          text-decoration: underline;
        }
      `;
      document.head.appendChild(styleElement);
    }

    return () => {
      // Clean up on unmount
      const styleElem = document.getElementById(styleId);
      if (styleElem) {
        styleElem.remove();
      }
    };
  }, []);

  return (
    <form onSubmit={handleSubmit}>
      {error && <p style={styles.error}>{error}</p>}

      <div style={styles.formGroup}>
        <label htmlFor="client_id" style={isClientFixed ? styles.disabledLabel : styles.label}>
          Client:
        </label>
        <select 
            id="client_id" 
            name="client_id" 
            value={formData.client_id} 
            onChange={handleChange} 
            required 
            style={styles.select}
            disabled={isClientFixed} // Disable if client_id is pre-filled via initialData
        >
          {!isClientFixed && <option value="">Select a client</option>} {/* Show only if not fixed */}
          {clients.map(client => (
            <option key={client.id} value={client.id}>
              {client.client_name}
            </option>
          ))}
        </select>
        {isClientFixed && <small>Client is set by the page context.</small>}
      </div>

      <div style={styles.formGroup}>
        <label htmlFor="alert_type" style={styles.label}>Alert Type:</label>
        <select 
            id="alert_type" 
            name="alert_type" 
            value={formData.alert_type} 
            onChange={handleChange} 
            required 
            style={styles.select}
        >
          {alertTypes.map(type => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>
      
      {formData.alert_type === 'CLIENT_TASK' && (
        <div style={styles.formGroup}>
          <label htmlFor="source_task_id" style={styles.label}>Source Task ID (Optional for CLIENT_TASK):</label>
          <input 
            type="text" 
            id="source_task_id" 
            name="source_task_id" 
            value={formData.source_task_id || ''} // Ensure controlled component
            onChange={handleChange}
            placeholder="Enter UUID of the client task if applicable"
            style={styles.input}
          />
          <small>If &apos;Specific Client Task&apos; is chosen, you can link it to a task by its ID.</small>
        </div>
      )}

      <div style={styles.formGroup}>
        <label htmlFor="subject" style={styles.label}>
          Alert Subject:
          <button 
            type="button" 
            onClick={setTemplateMessage} 
            style={styles.messageTemplateButton}
          >
            Use Default Template
          </button>
        </label>
        
        <TiptapEditor
          content={formData.body}
          onChange={(newContent: string) => setFormData(prev => ({ ...prev, body: newContent }))}
        />
        
        <small>
          {'Available placeholders: {{client_name}}, {{company_name}}, {{due_date}}, {{task_title}}, {{task_description}}, {{client_portal_link}}'}
        </small>
      </div>

      <div style={styles.formGroup}>
        <label htmlFor="days_before_due" style={styles.label}>Primary Reminder (Days Before Due):</label>
        <input 
            type="number" 
            id="days_before_due" 
            name="days_before_due" 
            value={formData.days_before_due}
            onChange={handleChange} 
            required 
            min="0"
            style={styles.input}
        />
        <small>This is the main reminder that will be sent before the deadline.</small>
      </div>

      <div style={styles.formGroup}>
        <label style={styles.label}>
          <input 
            type="checkbox" 
            name="use_multi_schedule" 
            checked={formData.use_multi_schedule}
            onChange={handleChange} 
            style={{ marginRight: '5px' }}
          />
          Enable Multiple Reminder Schedules
        </label>
        <small>When enabled, you can configure multiple reminders to be sent at different times before the deadline.</small>
      </div>

      {formData.use_multi_schedule && (
        <div style={styles.formGroup}>
          <label style={styles.label}>Additional Reminder Schedules:</label>
          
          {formData.reminder_schedules.length === 0 && (
            <p style={{ color: '#666', margin: '10px 0' }}>No additional reminders configured yet. Click &quot;Add Reminder&quot; to set up follow-up reminders.</p>
          )}
          
          {formData.reminder_schedules.map((schedule, index) => (
            <div key={index} style={styles.scheduleContainer}>
              <div style={styles.scheduleHeader}>
                <h4 style={{ margin: '0' }}>Follow-up Reminder #{index + 1}</h4>
                <button 
                  type="button" 
                  onClick={() => removeReminderSchedule(index)}
                  style={styles.removeButton}
                >
                  Remove
                </button>
              </div>
              
              <div style={styles.scheduleFields}>
                <div style={styles.scheduleInputGroup}>
                  <label htmlFor={`reminder-days-${index}`} style={{ display: 'block', marginBottom: '5px' }}>
                    Days Before Due:
                  </label>
                  <input 
                    type="number" 
                    id={`reminder-days-${index}`}
                    value={schedule.days_before_due}
                    onChange={(e) => updateReminderSchedule(index, 'days_before_due', e.target.value)}
                    required
                    min="0"
                    style={styles.input}
                  />
                </div>
                
                <div style={styles.scheduleInputGroup}>
                  <label style={{ display: 'block', marginBottom: '5px', marginTop: '25px' }}>
                    <input 
                      type="checkbox" 
                      checked={schedule.is_active !== false}
                      onChange={(e) => updateReminderSchedule(index, 'is_active', e.target.checked)}
                      style={{ marginRight: '5px' }}
                    />
                    Active
                  </label>
                </div>
              </div>
              
              <div style={{ marginTop: '15px' }}>
                <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold' }}>
                  <input 
                    type="checkbox" 
                    checked={schedule.use_custom_message === true}
                    onChange={() => toggleCustomMessage(index)}
                    style={{ marginRight: '5px' }}
                  />
                  Use Custom Follow-up Message
                </label>
                
                {schedule.use_custom_message && (
                  <div style={styles.messageContainer}>
                    <div style={styles.messageHeader}>
                      <label style={{ fontWeight: 'normal' }}>Follow-up Message Content:</label>
                      <button 
                        type="button" 
                        onClick={() => updateReminderSchedule(index, 'alert_message', getTemplateForType(formData.alert_type).body)}
                        style={styles.messageTemplateButton}
                      >
                        Reset to Default Template
                      </button>
                    </div>
                    <textarea 
                      value={schedule.alert_message || ''}
                      onChange={(e) => updateReminderSchedule(index, 'alert_message', e.target.value)}
                      style={{...styles.textarea, minHeight: '150px'}}
                      rows={6}
                    />
                    <small>
                      {'Available placeholders: {{client_name}}, {{company_name}}, {{due_date}}, {{task_title}}, {{task_description}}, {{client_portal_link}}'}
                    </small>
                  </div>
                )}
                
                {!schedule.use_custom_message && (
                  <div style={{ padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
                    <small>
                      This reminder will use the main message template. Enable custom message to create a follow-up specific message with more urgent tone.
                    </small>
                  </div>
                )}
              </div>
            </div>
          ))}
          
          <button 
            type="button" 
            onClick={addReminderSchedule}
            style={styles.addButton}
          >
            + Add Reminder
          </button>
        </div>
      )}

      <div style={styles.formGroup}>
        <label htmlFor="notification_preference" style={styles.label}>Notification Preference:</label>
        <select 
            id="notification_preference" 
            name="notification_preference" 
            value={formData.notification_preference}
            onChange={handleChange} 
            required 
            style={styles.select}
        >
          <option value="DRAFT_FOR_TEAM">Draft for Team Review</option>
          <option value="SEND_DIRECT_TO_CLIENT">Send Direct to Client</option>
        </select>
      </div>

      <div style={styles.formGroup}>
        <label htmlFor="is_active" style={{ ...styles.label, marginRight: '10px' }}>
          <input 
            type="checkbox" 
            id="is_active" 
            name="is_active" 
            checked={formData.is_active}
            onChange={handleChange} 
            style={{ marginRight: '5px' }}
          />
          Alert is Active
        </label>
      </div>

      <button type="submit" disabled={isLoading} style={styles.button}>
        {isLoading ? (alertToEdit ? 'Updating Alert...' : 'Creating Alert...') : (alertToEdit ? 'Update Alert' : 'Create Alert')}
      </button>
    </form>
  );
};

export default ClientAlertForm; 