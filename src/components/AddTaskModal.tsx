'use client';

import React, { useState, useEffect } from 'react';

interface Client {
  id: string;
  client_name: string;
}

interface Profile {
  id: string;
  email: string; // Or another display name field like full_name
}

// Type for the data passed to the onSubmit function
interface TaskSubmitData {
  task_title: string;
  client_id: string;
  stage: string;
  assigned_user_id: string | null;
  task_description: string | null;
  due_date: string | null;
  priority: string | null;
}

interface AddTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (taskData: TaskSubmitData) => Promise<void>; // Changed any to TaskSubmitData
  clients: Client[];
  profiles: Profile[];
  workflowStages: string[];
}

const priorityOptions = ['Low', 'Medium', 'High'];

const AddTaskModal: React.FC<AddTaskModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  clients,
  profiles,
  workflowStages,
}) => {
  const [taskTitle, setTaskTitle] = useState('');
  const [clientId, setClientId] = useState('');
  const [stage, setStage] = useState(workflowStages.length > 0 ? workflowStages[0] : '');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState(priorityOptions[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Reset form when modal is reopened or client/profile data changes
    if (isOpen) {
      setTaskTitle('');
      setClientId(clients.length > 0 ? clients[0].id : '');
      setStage(workflowStages.length > 0 ? workflowStages[0] : '');
      setAssignedUserId(''); // Default to unassigned or first profile
      setTaskDescription('');
      setDueDate('');
      setPriority(priorityOptions[0]);
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, clients, profiles, workflowStages]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!taskTitle.trim()) {
      setError('Task title is required.');
      return;
    }
    if (!clientId) {
      setError('Client is required.');
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit({
        task_title: taskTitle,
        client_id: clientId,
        stage,
        assigned_user_id: assignedUserId || null,
        task_description: taskDescription || null,
        due_date: dueDate || null,
        priority: priority || null,
      });
      // If onSubmit is successful and doesn't throw, the parent (TasksPage) will close the modal.
    } catch (err: unknown) { // Changed any to unknown
      let displayError = 'Failed to create task. Please try again.';
      if (err instanceof Error && err.message && typeof err.message === 'string') {
        if (err.message.toLowerCase().includes('violates row-level security policy')) {
          displayError = 'Failed to create task due to a security policy. This can happen if the task is unassigned and your security rules require an assignee, or if you lack permission to insert tasks with these specific details. Please check the assignee or contact support.';
        } else {
          displayError = err.message; // Use the specific error from the backend if not RLS-related
        }
      } else if (typeof err === 'string') {
        displayError = err;
      }
      setError(displayError);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 flex justify-center items-center p-4 transition-opacity duration-300 ease-in-out">
      <div className="bg-white p-6 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-gray-100">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <span className="w-1 h-6 bg-primary rounded-full"></span>
            Add New Task
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition rounded-full p-1 hover:bg-gray-100"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        {error && (
          <div className="mb-5 text-red-600 bg-red-50 p-3 rounded-lg text-sm border border-red-100 flex items-start gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 text-red-500"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="taskTitle" className="block text-sm font-medium text-gray-700 mb-1.5">
              Task Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="taskTitle"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg shadow-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
              placeholder="Enter task title"
              required
            />
          </div>

          <div>
            <label htmlFor="client" className="block text-sm font-medium text-gray-700 mb-1.5">
              Client <span className="text-red-500">*</span>
            </label>
            <select
              id="client"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg shadow-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition bg-white"
              required
            >
              <option value="" disabled>Select a client</option>
              {clients.map(client => (
                <option key={client.id} value={client.id}>{client.client_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="stage" className="block text-sm font-medium text-gray-700 mb-1.5">
              Stage
            </label>
            <select
              id="stage"
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg shadow-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition bg-white"
            >
              {workflowStages.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label htmlFor="assignedUser" className="block text-sm font-medium text-gray-700 mb-1.5">
              Assigned To
            </label>
            <select
              id="assignedUser"
              value={assignedUserId}
              onChange={(e) => setAssignedUserId(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg shadow-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition bg-white"
            >
              <option value="">Unassigned</option>
              {profiles.map(profile => (
                <option key={profile.id} value={profile.id}>{profile.email}</option> 
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1.5">
              Description
            </label>
            <textarea
              id="description"
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              rows={3}
              placeholder="Enter task details"
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg shadow-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label htmlFor="dueDate" className="block text-sm font-medium text-gray-700 mb-1.5">
                Due Date
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500"><rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" /></svg>
                </div>
                <input
                  type="date"
                  id="dueDate"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 border border-gray-200 rounded-lg shadow-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
                />
              </div>
            </div>
            <div>
              <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-1.5">
                Priority
              </label>
              <div className="relative">
                <select
                  id="priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg shadow-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition bg-white"
                >
                  {priorityOptions.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-3 mt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition disabled:opacity-50 flex items-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition disabled:opacity-50 flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Adding Task...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                  Add Task
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddTaskModal; 