'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface Profile {
  id: string
  email: string
  company_name: string
  role: string
}

interface Task {
  id: string
  task_title: string
  stage: string
  due_date: string | null
  priority: string | null
}

interface Client {
  id: string
  clientName: string
  companyName: string
}

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recentTasks, setRecentTasks] = useState<Task[]>([])
  const [recentClients, setRecentClients] = useState<Client[]>([])
  const [counts, setCounts] = useState({
    clients: 0,
    tasks: 0,
    pendingTasks: 0
  })
  const router = useRouter()

  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        
        if (!session) {
          router.push('/login')
          return
        }

        // Fetch user profile
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()

        if (profileError) {
          setError('Error loading profile data')
          return
        }

        setProfile(profileData)

        // Fetch recent tasks for the current user's clients
        // First, get the user's clients
        const { data: userClientsForRecentTasks, error: userClientsErrorForRecentTasks } = await supabase
          .from('clients')
          .select('id')
          .eq('created_by', session.user.id);

        if (userClientsErrorForRecentTasks) {
          console.error("Error fetching user's clients for recent tasks:", userClientsErrorForRecentTasks);
          // Handle error appropriately, maybe set recentTasks to [] or show a message
        }

        let tasksData = null;
        if (userClientsForRecentTasks && userClientsForRecentTasks.length > 0) {
          const clientIdsForRecentTasks = userClientsForRecentTasks.map(c => c.id);
          const { data: recentTasksData } = await supabase
            .from('client_tasks')
            .select('*')
            .in('client_id', clientIdsForRecentTasks)
            .order('created_at', { ascending: false })
            .limit(5);
          tasksData = recentTasksData;
        }
        
        if (tasksData) {
          setRecentTasks(tasksData)
        } else {
          setRecentTasks([]); // Ensure it's an empty array if no tasks or no clients
        }

        // Fetch recent clients created by the user
        const { data: clientsData } = await supabase
          .from('clients')
          .select('id, clientName, companyName')
          .eq('created_by', session.user.id) // Filter by user
          .order('created_at', { ascending: false })
          .limit(5)

        if (clientsData) {
          setRecentClients(clientsData)
        }

        // Get counts for the current user
        const { count: clientsCount, error: clientsCountError } = await supabase
          .from('clients')
          .select('*', { count: 'exact', head: true })
          .eq('created_by', session.user.id); // Filter by user

        if (clientsCountError) {
          console.error("Error fetching clients count:", clientsCountError);
          // Handle error, maybe set counts.clients to 0 or show an error
        }
        
        // For tasksCount and pendingTasks, we should also filter by user's clients
        let tasksCount = 0;
        let pendingTasksCount = 0;

        const { data: userClientIdsForCounts, error: clientIdsErrorForCounts } = await supabase
          .from('clients')
          .select('id')
          .eq('created_by', session.user.id);

        if (clientIdsErrorForCounts) {
          console.error("Error fetching client IDs for task counts:", clientIdsErrorForCounts);
        } else if (userClientIdsForCounts && userClientIdsForCounts.length > 0) {
          const clientIds = userClientIdsForCounts.map(c => c.id);

          const { count: totalTasksForUser, error: tasksCountError } = await supabase
            .from('client_tasks')
            .select('*', { count: 'exact', head: true })
            .in('client_id', clientIds);
          
          if (tasksCountError) console.error("Error fetching total tasks count:", tasksCountError);
          else tasksCount = totalTasksForUser || 0;

          const { count: pendingTasksForUser, error: pendingTasksCountError } = await supabase
            .from('client_tasks')
            .select('*', { count: 'exact', head: true })
            .in('client_id', clientIds)
            .not('stage', 'in', '(\'Completed / Filed\', \'On Hold / Blocked\')'); // Filter out completed/on-hold

          if (pendingTasksCountError) console.error("Error fetching pending tasks count:", pendingTasksCountError);
          else pendingTasksCount = pendingTasksForUser || 0;
        }
        
        setCounts({
          clients: clientsCount || 0,
          tasks: tasksCount,
          pendingTasks: pendingTasksCount
        })

      } catch (e: unknown) {
        console.error('Error in checkUser:', e)
        setError('An error occurred while loading the dashboard')
      } finally {
        setLoading(false)
      }
    }

    checkUser()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-red-600">{error}</p>
          <button
            onClick={() => router.push('/login')}
            className="mt-4 px-4 py-2 bg-primary text-white rounded hover:bg-primary/90"
          >
            Return to Login
          </button>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600">No profile data found</p>
          <button
            onClick={() => router.push('/login')}
            className="mt-4 px-4 py-2 bg-primary text-white rounded hover:bg-primary/90"
          >
            Sign Out
          </button>
        </div>
      </div>
    )
  }

  // Helper function to format date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString()
  }

  // Helper to determine badge color for task priority
  const getPriorityColor = (priority: string | null) => {
    if (!priority) return 'bg-gray-100 text-gray-800'
    switch (priority.toLowerCase()) {
      case 'high': return 'bg-red-100 text-red-800'
      case 'medium': return 'bg-yellow-100 text-yellow-800'
      case 'low': return 'bg-green-100 text-green-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6">
      {/* Welcome section */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Welcome back, {profile.company_name}</h1>
        <p className="mt-2 text-gray-600">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      {/* Stats overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Total Clients</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{counts.clients}</div>
          </CardContent>
          <CardFooter>
            <Link href="/dashboard/clients" className="text-sm text-primary hover:text-primary/80">
              View all clients →
            </Link>
          </CardFooter>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Total Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{counts.tasks}</div>
          </CardContent>
          <CardFooter>
            <Link href="/dashboard/tasks" className="text-sm text-primary hover:text-primary/80">
              View all tasks →
            </Link>
          </CardFooter>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Pending Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{counts.pendingTasks}</div>
          </CardContent>
          <CardFooter>
            <Link href="/dashboard/tasks" className="text-sm text-primary hover:text-primary/80">
              View pending tasks →
            </Link>
          </CardFooter>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/dashboard/clients">
            <Button variant="outline" className="border-primary text-primary hover:bg-primary/5">
              Add Client
            </Button>
          </Link>
          <Link href="/dashboard/tasks">
            <Button variant="outline" className="border-primary text-primary hover:bg-primary/5">
              Create Task
            </Button>
          </Link>
          <Link href="/dashboard/new-leads">
            <Button variant="outline" className="border-primary text-primary hover:bg-primary/5">
              View Leads
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Tasks */}
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Recent Tasks</CardTitle>
            <CardDescription>Your 5 most recent tasks</CardDescription>
          </CardHeader>
          <CardContent>
            {recentTasks.length > 0 ? (
              <div className="space-y-4">
                {recentTasks.map(task => (
                  <div key={task.id} className="p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium text-gray-900">{task.task_title}</h4>
                        <div className="mt-1 flex items-center space-x-2">
                          <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">{task.stage}</Badge>
                          {task.priority && (
                            <Badge className={getPriorityColor(task.priority)}>{task.priority}</Badge>
                          )}
                        </div>
                      </div>
                      {task.due_date && (
                        <span className="text-sm text-gray-500">Due: {formatDate(task.due_date)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-gray-500">
                <p>No tasks found</p>
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Link href="/dashboard/tasks" className="text-primary hover:text-primary/80 text-sm">
              View all tasks →
            </Link>
          </CardFooter>
        </Card>

        {/* Recent Clients */}
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Recent Clients</CardTitle>
            <CardDescription>Your 5 most recently added clients</CardDescription>
          </CardHeader>
          <CardContent>
            {recentClients.length > 0 ? (
              <div className="space-y-4">
                {recentClients.map(client => (
                  <div key={client.id} className="p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="font-medium text-gray-900">{client.clientName}</h4>
                        <p className="text-sm text-gray-600">{client.companyName}</p>
                      </div>
                      <Link href={`/dashboard/clients/${client.id}`} className="text-primary hover:text-primary/80">
                        View →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-gray-500">
                <p>No clients found</p>
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Link href="/dashboard/clients" className="text-primary hover:text-primary/80 text-sm">
              View all clients →
            </Link>
          </CardFooter>
        </Card>
      </div>

      {/* User info card */}
      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Your Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center border-b border-gray-100 pb-2">
                <span className="font-medium w-32 text-gray-500">Email:</span>
                <span className="text-gray-900">{profile.email}</span>
              </div>
              <div className="flex items-center border-b border-gray-100 pb-2">
                <span className="font-medium w-32 text-gray-500">Company:</span>
                <span className="text-gray-900">{profile.company_name}</span>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Link href="/dashboard/settings">
              <Button variant="outline" size="sm">Edit Profile</Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
} 