'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase'; // Assuming your supabase client is here
import AddTaskModal from '@/components/AddTaskModal'; // Import the modal
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';

interface ClientTask {
  id: string;
  client_id: string; // In a real app, you'd want to fetch client details to show name
  task_title: string;
  task_description?: string | null;
  stage: string;
  assigned_user_id?: string | null; // Fetch user details too
  due_date?: string | null;
  priority?: string | null;
  created_at: string;
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
  const [clients, setClients] = useState<Client[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  const fetchTasksAndRelatedData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch Tasks
      const { data: tasksData, error: tasksError } = await supabase
        .from('client_tasks')
        .select('*')
        // If you add item_order, sort by it: .order('item_order', { ascending: true });
        .order('created_at', { ascending: false });
      if (tasksError) throw tasksError;
      setTasks(tasksData || []);

      // Fetch Clients for the modal dropdown
      const { data: clientsData, error: clientsError } = await supabase
        .from('clients')
        .select('id, client_name')
        .order('client_name', { ascending: true });
      if (clientsError) throw clientsError;
      setClients(clientsData || []);

      // Fetch Profiles (users) for the modal dropdown
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email') // Adjust if you have a better display name field like 'full_name' or 'company_name'
        .order('email', { ascending: true });
      if (profilesError) throw profilesError;
      setProfiles(profilesData || []);

    } catch (err: any) {
      console.error('Error fetching data:', err);
      let friendlyMessage = 'Failed to fetch data.';
      if (err.message.includes('client_tasks')) {
        friendlyMessage = 'Failed to fetch tasks. Check RLS policies for client_tasks.';
      } else if (err.message.includes('clients')) {
        friendlyMessage = 'Failed to fetch clients. Check RLS policies for clients.';
      } else if (err.message.includes('profiles')) {
        friendlyMessage = 'Failed to fetch users/profiles. Check RLS policies for profiles.';
      }
      setError(friendlyMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasksAndRelatedData();
  }, []);

  const handleAddTask = async (newTaskData: Omit<ClientTask, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const { data, error: insertError } = await supabase
        .from('client_tasks')
        .insert([newTaskData])
        .select()
        .single(); // Assuming we expect a single row back

      if (insertError) throw insertError;

      if (data) {
        // setTasks(prevTasks => [data as ClientTask, ...prevTasks]); // Optimistic update
         fetchTasksAndRelatedData(); // Or refetch all for simplicity and to get correct order if item_order is used
      }
      setIsModalOpen(false);
    } catch (err: any) {
      console.error('Error adding task:', err);
      throw new Error(err.message || 'Could not add the task. Check RLS policies for insert on client_tasks.');
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
      // Optionally refetch or rely on optimistic update.
      // If refetching, be careful about state updates during drag.
      // fetchTasksAndRelatedData(); // This might cause a flicker, optimistic is usually better.
    } catch (err: any) {
      console.error('Failed to update task stage:', err);
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
    } catch (err: any) {
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

    } catch (err: any) {
      console.error('Failed to delete task:', err);
      setError('Failed to clear task. Please try again. Ensure RLS allows delete.');
      // Note: If optimistic update was done, we might need to re-add the task here or refetch.
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

  return (
    <DragDropContext onDragEnd={handleOnDragEnd}>
      <div className="p-4 md:p-8 flex flex-col h-full">
        <div className="mb-6 flex justify-between items-center">
          <h1 className="text-3xl font-semibold text-gray-900">Client Tasks</h1>
          <button onClick={() => setIsModalOpen(true)} className="bg-primary text-white px-4 py-2 rounded-md hover:bg-primary/90 transition">
            + Add New Task
          </button>
        </div>

        {tasks.length === 0 && !loading && (
          <div className="text-center text-gray-500 py-10">
            <p className="text-xl">No tasks found.</p>
            <p>Click "+ Add New Task" to get started.</p>
          </div>
        )}

        {tasks.length > 0 && (
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 overflow-x-auto pb-4">
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
                    className={`bg-gray-100 rounded-lg p-4 flex flex-col min-w-[300px] transition-colors duration-200 ease-in-out
                                ${snapshot.isDraggingOver ? 'bg-primary/10' : ''}`}
                  >
                    <h2 className="text-lg font-semibold text-gray-800 mb-4 capitalize">
                      {stageName.toLowerCase()}
                      <span className="ml-2 text-sm font-normal text-gray-500">
                        ({tasks.filter(task => task.stage === stageName).length})
                      </span>
                    </h2>
                    <div className="flex-1 space-y-3 overflow-y-auto min-h-[100px]"> {/* min-h to ensure drop target is there */}
                      {tasks
                        .filter(task => task.stage === stageName)
                        // .sort((a, b) => a.item_order - b.item_order) // If using item_order
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
                                className={`bg-white p-4 rounded-lg shadow hover:shadow-xl transition-all duration-200 ease-in-out flex flex-col justify-between min-h-[150px] 
                                            ${snapshotDraggable.isDragging ? 'shadow-2xl ring-2 ring-primary scale-105' : ''}`}
                                style={{ ...providedDraggable.draggableProps.style }}
                              >
                                <div className="flex-grow"> {/* Content part of the card */}
                                  <h3 className="font-semibold text-lg text-gray-800 break-words mb-1">{task.task_title}</h3>
                                  {client && <p className="text-sm text-gray-600 mb-1">Client: {client.client_name}</p>}
                                  {!client && task.client_id && <p className="text-sm text-gray-500 mb-1">Client ID: {task.client_id} (Name not found)</p>}
                                  
                                  {task.task_description && (
                                    <p className="text-xs text-gray-500 mt-1 mb-2 break-words whitespace-pre-wrap">
                                      {task.task_description}
                                    </p>
                                  )}

                                  <div className="space-y-1 mt-2 text-xs">
                                    {task.due_date && <p className="text-gray-500">Due: {new Date(task.due_date).toLocaleDateString()}</p>}
                                    {assignedUser && <p className="text-gray-500">Assigned: {assignedUser.email}</p>}
                                    {task.priority && 
                                      <p className="flex items-center">
                                        <span className="text-gray-500 mr-1">Priority:</span> 
                                        <span className={`px-2 py-0.5 rounded-full font-medium 
                                            ${task.priority === 'High' ? 'bg-red-100 text-red-700' : 
                                              task.priority === 'Medium' ? 'bg-yellow-100 text-yellow-700' : 
                                              'bg-green-100 text-green-700'}`}>
                                            {task.priority}
                                        </span>
                                      </p>
                                    }
                                  </div>
                                </div>
                                
                                <div className="mt-3 pt-3 border-t border-gray-200 flex flex-col space-y-2"> {/* Button Area */}
                                  {task.stage === 'On Hold / Blocked' && (
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }}
                                      className="w-full px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
                                      title="Clear this task permanently"
                                    >
                                      Clear Task
                                    </button>
                                  )}
                                  {!isLastStageForNextButton && task.stage !== 'Completed / Filed' && task.stage !== 'On Hold / Blocked' && (
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); handleMoveToNextStage(task.id); }}
                                      className="w-full px-3 py-1.5 text-xs font-medium text-white bg-primary rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-50"
                                      title={`Move to: ${workflowStages[currentStageIndex + 1]}`}
                                    >
                                      Next: {workflowStages[currentStageIndex + 1]}
                                    </button>
                                  )}
                                   {task.stage === 'Completed / Filed' && (
                                     <span className="w-full text-center text-xs text-green-600 font-semibold py-1.5">Completed</span>
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