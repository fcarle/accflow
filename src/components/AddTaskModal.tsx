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

interface AddTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (taskData: any) => Promise<void>; // Define a more specific type later
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
    } catch (err: any) {
      let displayError = 'Failed to create task. Please try again.';
      if (err.message && typeof err.message === 'string') {
        if (err.message.toLowerCase().includes('violates row-level security policy')) {
          displayError = 'Failed to create task due to a security policy. This can happen if the task is unassigned and your security rules require an assignee, or if you lack permission to insert tasks with these specific details. Please check the assignee or contact support.';
        } else {
          displayError = err.message; // Use the specific error from the backend if not RLS-related
        }
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
    <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex justify-center items-center p-4 transition-opacity duration-300 ease-in-out">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold text-gray-800">Add New Task</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition"
            aria-label="Close modal"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        {error && <p className="mb-4 text-red-600 bg-red-100 p-3 rounded-md text-sm">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="taskTitle" className="block text-sm font-medium text-gray-700 mb-1">Task Title <span className="text-red-500">*</span></label>
            <input
              type="text"
              id="taskTitle"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-primary focus:border-primary"
              required
            />
          </div>

          <div>
            <label htmlFor="client" className="block text-sm font-medium text-gray-700 mb-1">Client <span className="text-red-500">*</span></label>
            <select
              id="client"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-primary focus:border-primary"
              required
            >
              <option value="" disabled>Select a client</option>
              {clients.map(client => (
                <option key={client.id} value={client.id}>{client.client_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="stage" className="block text-sm font-medium text-gray-700 mb-1">Stage</label>
            <select
              id="stage"
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-primary focus:border-primary"
            >
              {workflowStages.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label htmlFor="assignedUser" className="block text-sm font-medium text-gray-700 mb-1">Assigned To</label>
            <select
              id="assignedUser"
              value={assignedUserId}
              onChange={(e) => setAssignedUserId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-primary focus:border-primary"
            >
              <option value="">Unassigned</option>
              {profiles.map(profile => (
                <option key={profile.id} value={profile.id}>{profile.email}</option> 
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              id="description"
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-primary focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="dueDate" className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
              <input
                type="date"
                id="dueDate"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-primary focus:border-primary"
              />
            </div>
            <div>
              <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                id="priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-primary focus:border-primary"
              >
                {priorityOptions.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50"
            >
              {isSubmitting ? 'Adding Task...' : 'Add Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddTaskModal; 