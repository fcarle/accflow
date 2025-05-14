'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowRight, Trash2 as TrashIcon } from 'lucide-react';

// Interface for ClientTask (consider moving to a shared types file)
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

// Interface for Profile (consider moving to a shared types file)
interface Profile {
  id: string;
  email: string;
}

interface ClientTasksTabProps {
  clientTasks: ClientTask[];
  profiles: Profile[];
  workflowStages: string[];
  handleMoveToNextStage: (taskId: string) => Promise<void>;
  handleDeleteTask: (taskId: string) => Promise<void>;
  // Add updateTask handler if needed for inline stage/assignee changes
  // handleUpdateTask: (taskId: string, updates: Partial<ClientTask>) => Promise<void>; 
}

const ClientTasksTab: React.FC<ClientTasksTabProps> = ({
  clientTasks,
  profiles,
  workflowStages,
  handleMoveToNextStage,
  handleDeleteTask,
  // handleUpdateTask 
}) => {

  const getProfileEmail = (userId: string | null | undefined) => {
    if (!userId) return 'Unassigned';
    const profile = profiles.find(p => p.id === userId);
    return profile ? profile.email : 'Unknown User';
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return 'Invalid date';
    }
  };

  const getPriorityBadge = (priority: string | null | undefined) => {
    switch (priority?.toLowerCase()) {
      case 'high':
        return <Badge variant="destructive">High</Badge>;
      case 'medium':
        return <Badge variant="secondary" className="bg-amber-100 text-amber-800">Medium</Badge>;
      case 'low':
        return <Badge variant="outline" className="border-gray-300 text-gray-600">Low</Badge>;
      default:
        return <Badge variant="outline" className="border-gray-300 text-gray-600">{priority || 'N/A'}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl text-[#1a365d]">Client Tasks</CardTitle>
        {/* Maybe add a button here to open the AddTaskModal if that's desired from this view */}
      </CardHeader>
      <CardContent>
        {clientTasks.length > 0 ? (
          <div className="space-y-4">
            {clientTasks.map((task) => (
              <div key={task.id} className="p-4 border rounded-lg shadow-sm bg-white">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1 space-y-1">
                    <h4 className="font-semibold text-gray-800">{task.task_title}</h4>
                    {task.task_description && (
                      <p className="text-sm text-gray-600">{task.task_description}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-gray-500 pt-1">
                      <span>Assignee: {getProfileEmail(task.assigned_user_id)}</span>
                      <span>Due: {formatDate(task.due_date)}</span>
                      <span>Priority: {getPriorityBadge(task.priority)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <Select 
                      value={task.stage}
                      // onValueChange={(newStage) => handleUpdateTask(task.id, { stage: newStage })} // Add if inline update needed
                      disabled // Remove disabled if inline update needed
                    >
                      <SelectTrigger className="w-[200px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {workflowStages.map(stage => (
                          <SelectItem key={stage} value={stage} className="text-xs">{stage}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2 mt-1">
                      {workflowStages.indexOf(task.stage) < workflowStages.length - 1 && task.stage !== 'On Hold / Blocked' && (
                        <Button 
                          variant="outline"
                          size="sm"
                          onClick={() => handleMoveToNextStage(task.id)}
                          className="h-7 text-xs"
                          title={`Move to: ${workflowStages[workflowStages.indexOf(task.stage) + 1]}`}
                        >
                          Next Stage <ArrowRight className="ml-1 h-3 w-3" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteTask(task.id)}
                        className="h-7 w-7 text-red-500 hover:bg-red-50"
                        title="Delete Task"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center py-4">No tasks found for this client.</p>
        )}
      </CardContent>
    </Card>
  );
};

export default ClientTasksTab; 