'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface Profile {
  id: string;
  email: string;
  company_name: string;
  role: string;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          router.push('/login');
          return;
        }

        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (profileError) {
          setError('Error loading profile data');
          return;
        }

        setProfile(profileData);
      } catch (error) {
        setError('An error occurred while loading the dashboard');
      } finally {
        setLoading(false);
      }
    };

    checkUser();
  }, [router]);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      router.push('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
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
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600">No profile data found</p>
          <button
            onClick={handleSignOut}
            className="mt-4 px-4 py-2 bg-primary text-white rounded hover:bg-primary/90"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col py-8 px-4 min-h-screen shadow-sm">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-primary tracking-tight">AccFlow</h1>
        </div>
        <nav className="flex-1">
          <ul className="space-y-2">
            <li>
              <Link href="/dashboard" className="flex items-center px-3 py-2 rounded-md text-gray-900 font-medium hover:bg-primary/10 transition">
                <span className="material-icons mr-2 text-primary">dashboard</span>
                Dashboard
              </Link>
            </li>
            <li>
              <Link href="/dashboard/clients" className="flex items-center px-3 py-2 rounded-md text-gray-900 font-medium hover:bg-primary/10 transition">
                <span className="material-icons mr-2 text-primary">groups</span>
                Clients
              </Link>
            </li>
            <li>
              <Link href="/dashboard/new-leads" className="flex items-center px-3 py-2 rounded-md text-gray-900 font-medium hover:bg-primary/10 transition">
                <span className="material-icons mr-2 text-primary">person_add</span>
                New Leads
              </Link>
            </li>
            <li>
              <Link href="/dashboard/tasks" className="flex items-center px-3 py-2 rounded-md text-gray-900 font-medium hover:bg-primary/10 transition">
                <span className="material-icons mr-2 text-primary">checklist</span>
                Tasks
              </Link>
            </li>
            <li>
              <Link href="/dashboard/settings" className="flex items-center px-3 py-2 rounded-md text-gray-900 font-medium hover:bg-primary/10 transition">
                <span className="material-icons mr-2 text-primary">settings</span>
                Settings
              </Link>
            </li>
          </ul>
        </nav>
        <div className="mt-auto">
          <button
            onClick={handleSignOut}
            className="w-full px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary hover:bg-primary/90 transition"
          >
            Sign out
          </button>
        </div>
      </aside>
      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <nav className="bg-white shadow px-8 py-4 flex items-center justify-between">
          <div></div>
        </nav>
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
} 