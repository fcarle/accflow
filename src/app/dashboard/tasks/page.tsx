'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase'; // Assuming your supabase client is here
import AddTaskModal from '@/components/AddTaskModal'; // Import the modal
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import { toast } from 'sonner'; // Import toast for notifications
import { Button } from '@/components/ui/button'; // Assuming you have a Button component

interface ClientTask {
  id: string;
  client_id: string;
  task_title: string;
  task_description?: string | null;
  stage: string;
  assigned_user_id?: string | null; // For who the task is assigned to
  due_date?: string | null;
  priority?: string | null;
  created_at: string;
  action_needed?: string | null; // New field
  action_details?: { // More specific type for action_details
    alert_type: string;
    due_date_field_name: string;
    due_date_value: string;
    client_name: string;
    client_id: string;
  } | null;
  // No user_id here as per schema, filtering is via client's user_id
}

// Define interfaces for Client and Profile if not already globally available
// We need these for the dropdowns in the modal
interface Client {
  id: string;
  client_name: string;
  // Add other client fields if needed by other parts of your app
}

interface Profile {
  id: string;
  email: string; // Assuming email is used as a display name, or use another field like company_name from your profiles table
  // Add other profile fields if needed
}

// The stages we defined earlier
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

// Helper function to reorder (if needed, for now just focusing on stage change)
// const reorder = (list: any[], startIndex: number, endIndex: number) => {
//   const result = Array.from(list);
//   const [removed] = result.splice(startIndex, 1);
//   result.splice(endIndex, 0, removed);
//   return result;
// };

const TasksPage = () => {
  const [tasks, setTasks] = useState<ClientTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [clients, setClients] = useState<Client[]>([]); // Will hold clients created by the current user
  const [profiles, setProfiles] = useState<Profile[]>([]); // Still needed for 'assigned_user_id' dropdown
  const [isCreatingAlertForTaskId, setIsCreatingAlertForTaskId] = useState<string | null>(null); // For button loading state
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const fetchTasksAndRelatedData = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        console.error('Error fetching user or user not authenticated:', userError);
        setError('User not authenticated. Please log in.');
        setTasks([]);
        setClients([]);
        setProfiles([]); // Clear profiles too if no user
        setLoading(false);
        return;
      }

      // 1. Fetch Clients created by the current user
      // ASSUMPTION: Your 'clients' table has a 'user_id' column linking to the creator.
      const { data: userClientsData, error: clientsError } = await supabase
        .from('clients')
        .select('id, client_name')
        .eq('created_by', user.id) // Filter clients by the current user's ID
        .order('client_name', { ascending: true });

      if (clientsError) {
        console.error('Error fetching clients:', clientsError);
        throw new Error(`Failed to fetch clients. Ensure 'clients' table has 'user_id' and RLS allows select. Details: ${clientsError.message}`);
      }
      setClients(userClientsData || []);

      if (!userClientsData || userClientsData.length === 0) {
        // If the user has no clients, they have no tasks to see
        setTasks([]);
        setLoading(false);
        // Fetch profiles anyway for the modal, though client dropdown will be empty
        const { data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            .select('id, email')
            .order('email', { ascending: true });
        if (profilesError) throw profilesError; // Propagate error if profiles fetch fails
        setProfiles(profilesData || []);
        return;
      }

      const clientIds = userClientsData.map(client => client.id);

      // 2. Fetch Tasks for those clients
      const { data: tasksData, error: tasksError } = await supabase
        .from('client_tasks')
        .select('*')
        .in('client_id', clientIds) // Filter tasks by the fetched client IDs
        .order('created_at', { ascending: false });

      if (tasksError) {
        console.error('Error fetching tasks:', tasksError);
        throw new Error(`Failed to fetch tasks. Check RLS policies for client_tasks. Details: ${tasksError.message}`);
      }
      setTasks(tasksData || []);

      // 3. Fetch Profiles (users) for the 'assigned_user_id' dropdown in the modal
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email')
        .order('email', { ascending: true });
      if (profilesError) {
        console.error('Error fetching profiles:', profilesError);
        throw new Error(`Failed to fetch profiles. Check RLS. Details: ${profilesError.message}`);
      }
      setProfiles(profilesData || []);

    } catch (err: unknown) {
      console.error('Error in fetchTasksAndRelatedData:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage || 'An unexpected error occurred while fetching data.');
      setTasks([]); // Clear tasks on error
      setClients([]); // Clear clients on error
      setProfiles([]); // Clear profiles on error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasksAndRelatedData();
  }, []);

  const handleAddTask = async (newTaskData: Omit<ClientTask, 'id' | 'created_at' | 'action_needed' | 'action_details'>) => {
    try {
      const taskPayload: Partial<ClientTask> = { ...newTaskData };
      // Ensure action_needed and action_details are not part of the payload for general task creation
      // unless the AddTaskModal is updated to handle them.
      // For now, assume they are null or undefined for tasks created via AddTaskModal.
      if (!taskPayload.action_needed) taskPayload.action_needed = null;
      if (!taskPayload.action_details) taskPayload.action_details = null;

      const { data, error: insertError } = await supabase
        .from('client_tasks')
        .insert([taskPayload])
        .select()
        .single(); 

      if (insertError) {
        console.error("Supabase insert error:", insertError);
        if (insertError.message.includes("violates row-level security policy")) {
            throw new Error("Task creation failed due to security policy. Ensure you are allowed to add tasks for this client.");
        }
        throw insertError;
      }

      if (data) {
         fetchTasksAndRelatedData(); 
      }
      setIsModalOpen(false);
    } catch (err: unknown) {
      console.error('Error adding task:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      throw new Error(errorMessage || 'Could not add the task. Check RLS policies for insert on client_tasks.');
    }
  };

  const handleOnDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;

    // Dropped outside the list
    if (!destination) {
      return;
    }

    // Dropped in the same place
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) {
      return;
    }

    const taskToMove = tasks.find(task => task.id === draggableId);
    if (!taskToMove) {
      console.error('Task not found for dragging:', draggableId);
      return;
    }

    const newStage = destination.droppableId;
    const originalStage = taskToMove.stage;

    // Optimistic UI Update
    setTasks(prevTasks =>
      prevTasks.map(task =>
        task.id === draggableId ? { ...task, stage: newStage } : task
      )
    );
    
    // For reordering within the same column (more complex, handle later if needed)
    // if (source.droppableId === destination.droppableId) {
    //   const items = tasks.filter(task => task.stage === source.droppableId);
    //   // Potentially sort items by an 'item_order' field if you have one
    //   const reorderedItems = reorder(items, source.index, destination.index);
    //   // Update 'item_order' for these items and then update state & DB
    // }

    // Update in Supabase
    try {
      const { error: updateError } = await supabase
        .from('client_tasks')
        .update({ stage: newStage })
        .eq('id', draggableId);

      if (updateError) {
        throw updateError;
      }
      // fetchTasksAndRelatedData(); // This might cause a flicker, optimistic is usually better.
    } catch (_err: unknown) {
      console.error('Failed to update task stage:', _err);
      // Revert optimistic update if DB update fails
      setTasks(prevTasks =>
        prevTasks.map(task =>
          task.id === draggableId ? { ...task, stage: originalStage } : task // Revert to original stage
        )
      );
      setError('Failed to move task. Please try again.');
    }
  };

  const handleMoveToNextStage = async (taskId: string) => {
    const taskToMove = tasks.find(task => task.id === taskId);
    if (!taskToMove) return;

    const currentStageIndex = workflowStages.indexOf(taskToMove.stage);
    if (currentStageIndex === -1 || currentStageIndex >= workflowStages.length - 1) {
      // Task is in an unknown stage or the last stage, cannot move further
      // Or if the last stage is 'On Hold / Blocked', it has no logical single "next"
      if (taskToMove.stage === 'On Hold / Blocked') {
        // Potentially move 'On Hold / Blocked' to 'New Request / To Do' or allow user to pick
        // For now, we just don't move it if it's the last item in the array
         console.log('Task is in the last configured stage or On Hold/Blocked, cannot move further automatically.');
         return;
      }
      return;
    }

    const nextStage = workflowStages[currentStageIndex + 1];
    const originalStage = taskToMove.stage;

    // Optimistic UI Update
    setTasks(prevTasks =>
      prevTasks.map(task =>
        task.id === taskId ? { ...task, stage: nextStage } : task
      )
    );

    // Update in Supabase
    try {
      const { error: updateError } = await supabase
        .from('client_tasks')
        .update({ stage: nextStage })
        .eq('id', taskId);

      if (updateError) {
        throw updateError;
      }
      // fetchTasksAndRelatedData();
    } catch (err: unknown) {
      console.error('Failed to update task stage via button:', err);
      // Revert optimistic update
      setTasks(prevTasks =>
        prevTasks.map(task =>
          task.id === taskId ? { ...task, stage: originalStage } : task
        )
      );
      setError('Failed to move task. Please try again.');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!window.confirm("Are you sure you want to clear this task? This action cannot be undone.")) {
      return;
    }

    // Optimistically remove from UI, or remove after successful DB operation for more safety
    // For simplicity here, we'll update UI after successful deletion.

    try {
      const { error: deleteError } = await supabase
        .from('client_tasks')
        .delete()
        .eq('id', taskId);

      if (deleteError) {
        throw deleteError;
      }

      // Update local state
      setTasks(prevTasks => prevTasks.filter(task => task.id !== taskId));

    } catch (err: unknown) {
      console.error('Failed to delete task:', err);
      setError('Failed to clear task. Please try again. Ensure RLS allows delete.');
      // Note: If optimistic update was done, we might need to re-add the task here or refetch.
    }
  };

  const handleCreateAlertFromTask = async (task: ClientTask) => {
    if (!task.action_details || task.action_needed !== 'CREATE_ALERT') {
      toast.error("Task is missing necessary details to create an alert.");
      return;
    }
    setIsCreatingAlertForTaskId(task.id);
    try {
      const { client_id, alert_type, due_date_value, client_name } = task.action_details;

      const response = await fetch('/api/create-alert-from-task', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id,
          alert_type,
          due_date: due_date_value, // The API will expect the actual due date
          client_name // For placeholder replacement in alert message
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create alert.');
      }

      const result = await response.json();
      toast.success(result.message || `Alert for ${client_name} (${alert_type}) created successfully!`);

      // Option 1: Update task stage to 'Completed / Filed' (Optimistic UI + DB update)
      setTasks(prevTasks =>
        prevTasks.map(t => 
          t.id === task.id ? { ...t, stage: 'Completed / Filed', action_needed: null, action_details: null } : t
        )
      );
      // Update in Supabase
      const { error: updateError } = await supabase
        .from('client_tasks')
        .update({ stage: 'Completed / Filed', action_needed: null, action_details: null })
        .eq('id', task.id);

      if (updateError) {
        toast.error(`Failed to update task stage: ${updateError.message}`);
        // Optionally refetch or revert optimistic update
        fetchTasksAndRelatedData(); 
      }

      // Option 2: Refetch all tasks (simpler but might cause a flicker)
      // fetchTasksAndRelatedData();

    } catch (err: unknown) {
      console.error("Error creating alert from task:", err);
      toast.error(err instanceof Error ? err.message : String(err) || "An unexpected error occurred while creating the alert.");
    } finally {
      setIsCreatingAlertForTaskId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-gray-600">Loading tasks...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-600">
        <p>{error}</p>
        <p className="mt-2 text-sm text-gray-500">
          Please check your RLS policies and network connection.
        </p>
      </div>
    );
  }

  if (!isClient) {
    // You can return a loader here if you prefer, or null to render nothing until client-side mount.
    // For a Kanban board, showing a loader until dnd is ready is often better.
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-gray-600">Initializing board...</p>
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={handleOnDragEnd}>
      <div className="p-4 md:p-8 flex flex-col h-full max-w-[1800px] mx-auto">
        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 flex items-center gap-2">
            <span className="inline-block w-1 h-8 bg-primary rounded-full"></span>
            Client Tasks
          </h1>
          <button 
            onClick={() => setIsModalOpen(true)} 
            className="bg-primary text-white px-5 py-2.5 rounded-lg font-medium hover:bg-primary/90 transition shadow-sm hover:shadow-md flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-plus"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
            Add New Task
          </button>
        </div>

        {tasks.length === 0 && !loading && (
          <div className="text-center p-10 bg-gray-50 rounded-xl border border-gray-100 shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-4 text-gray-400"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 14h6" /><path d="M9 10h6" /></svg>
            <p className="text-xl font-medium mb-2">No tasks found</p>
            <p className="text-gray-500 mb-4">Get started by creating your first task</p>
            <button 
              onClick={() => setIsModalOpen(true)} 
              className="bg-primary text-white px-5 py-2 rounded-lg font-medium hover:bg-primary/90 transition inline-flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-plus"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
              Add New Task
            </button>
          </div>
        )}

        {tasks.length > 0 && (
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4 overflow-auto">
            {workflowStages.map((stageName) => (
              <Droppable 
                droppableId={stageName} 
                key={stageName} 
                isDropDisabled={false} 
                isCombineEnabled={false}
                ignoreContainerClipping={false}
              >
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`bg-gray-50 rounded-xl p-4 flex flex-col shadow-sm border border-gray-100 transition-all duration-200 ease-in-out min-w-[280px]
                              ${snapshot.isDraggingOver ? 'bg-primary/5 ring-2 ring-primary/20' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="font-medium text-base text-gray-900 flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${
                          stageName.includes('New') ? 'bg-blue-500' :
                          stageName.includes('Information') ? 'bg-orange-500' :
                          stageName.includes('Progress') ? 'bg-indigo-500' :
                          stageName.includes('Internal') ? 'bg-purple-500' :
                          stageName.includes('Pending') ? 'bg-yellow-500' :
                          stageName.includes('Ready') ? 'bg-emerald-500' :
                          stageName.includes('Completed') ? 'bg-green-500' :
                          'bg-gray-500'
                        }`}></div>
                        {stageName}
                      </h2>
                      <span className="px-2 py-1 bg-gray-200 text-gray-700 text-xs font-medium rounded-full">
                        {tasks.filter(task => task.stage === stageName).length}
                      </span>
                    </div>
                    <div className="flex-1 space-y-3 overflow-y-auto min-h-[100px]">
                      {tasks
                        .filter(task => task.stage === stageName)
                        .map((task, index) => {
                          const client = clients.find(c => c.id === task.client_id);
                          const assignedUser = profiles.find(p => p.id === task.assigned_user_id);
                          const currentStageIndex = workflowStages.indexOf(task.stage);
                          const isLastStageForNextButton = currentStageIndex === workflowStages.length - 1 || task.stage === 'On Hold / Blocked';

                          return (
                          <Draggable key={task.id} draggableId={task.id} index={index}>
                            {(providedDraggable, snapshotDraggable) => (
                              <div
                                ref={providedDraggable.innerRef}
                                {...providedDraggable.draggableProps}
                                {...providedDraggable.dragHandleProps}
                                className={`bg-white p-4 rounded-lg border border-gray-100 hover:border-primary/20 transition-all duration-200 flex flex-col min-h-[150px] gap-3
                                          ${snapshotDraggable.isDragging ? 'shadow-lg ring-2 ring-primary/30 scale-[1.02]' : 'shadow-sm hover:shadow-md'}`}
                                style={{ ...providedDraggable.draggableProps.style }}
                              >
                                <div className="flex-grow">
                                  <div className="flex items-start justify-between gap-2 mb-2">
                                    <h3 className="font-medium text-gray-900 break-words line-clamp-2">{task.task_title}</h3>
                                    {task.priority && (
                                      <span className={`shrink-0 w-2 h-2 rounded-full mt-1.5 
                                        ${task.priority === 'High' ? 'bg-red-500' : 
                                          task.priority === 'Medium' ? 'bg-yellow-500' : 
                                          'bg-green-500'}`}
                                        title={`Priority: ${task.priority}`}
                                      ></span>
                                    )}
                                  </div>
                                  
                                  {client && (
                                    <div className="flex items-center gap-2 text-sm text-gray-700 mb-1.5">
                                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                                      <span className="truncate">{client.client_name}</span>
                                    </div>
                                  )}
                                  
                                  {task.task_description && (
                                    <p className="text-sm text-gray-600 mb-2 line-clamp-2 break-words">
                                      {task.task_description}
                                    </p>
                                  )}

                                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 text-xs">
                                    {task.due_date && (
                                      <div className="flex items-center gap-1 text-gray-600">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500"><rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" /></svg>
                                        {new Date(task.due_date).toLocaleDateString()}
                                      </div>
                                    )}
                                    
                                    {assignedUser && (
                                      <div className="flex items-center gap-1 text-gray-600">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                                        <span className="truncate max-w-[120px]" title={assignedUser.email}>{assignedUser.email}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                
                                <div className="pt-2 border-t border-gray-100 flex flex-col space-y-2">
                                  {task.stage === 'On Hold / Blocked' && (
                                    <Button 
                                      variant="destructive"
                                      size="sm"
                                      onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }}
                                      className="w-full flex items-center justify-center gap-1.5"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                      <span>Clear Task</span>
                                    </Button>
                                  )}
                                  
                                  {!isLastStageForNextButton && task.stage !== 'Completed / Filed' && task.stage !== 'On Hold / Blocked' && (
                                    <Button 
                                      variant="default"
                                      size="sm"
                                      onClick={(e) => { e.stopPropagation(); handleMoveToNextStage(task.id); }}
                                      className="w-full bg-primary text-white hover:bg-primary/90 flex items-center justify-center gap-1.5"
                                    >
                                      <span>Next:</span> <span className="truncate">{workflowStages[currentStageIndex + 1]}</span>
                                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="ml-auto shrink-0"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                                    </Button>
                                  )}

                                  {/* New Button for "Create Alert" */}
                                  {task.action_needed === 'CREATE_ALERT' && task.stage !== 'Completed / Filed' && task.stage !== 'On Hold / Blocked' && (
                                    <Button
                                      variant="outline" 
                                      size="sm"
                                      onClick={(e) => { e.stopPropagation(); handleCreateAlertFromTask(task); }}
                                      disabled={isCreatingAlertForTaskId === task.id}
                                      className="w-full border-primary text-primary hover:bg-primary/5 flex items-center justify-center gap-1.5"
                                    >
                                      {isCreatingAlertForTaskId === task.id ? (
                                        <>
                                          <svg className="animate-spin h-4 w-4 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                          </svg>
                                          <span>Creating...</span>
                                        </>
                                      ) : (
                                        <>
                                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-bell-plus"><path d="M19.4 14.9C20.2 16.4 21 17 21 17H3s3-2 3-9c0-3.3 2.7-6 6-6 1.8 0 3.4.8 4.5 2"/><path d="M10.3 21c.6-1.5 2.8-1.5 3.4 0"/><path d="M18 8h-3a3 3 0 0 0-3 3v3"/><path d="M15 6v6"/></svg>
                                          <span>Create Alert Now</span>
                                        </>
                                      )}
                                    </Button>
                                  )}
                                  
                                  {task.stage === 'Completed / Filed' && (
                                    <div className="w-full text-center text-xs text-green-600 font-medium py-1.5 flex items-center justify-center gap-1.5 bg-green-50 rounded-md">
                                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>
                                      Completed
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </Draggable>
                        );})}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            ))}
          </div>
        )}
        <AddTaskModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleAddTask} clients={clients} profiles={profiles} workflowStages={workflowStages} />
      </div>
    </DragDropContext>
  );
};

export default TasksPage; 