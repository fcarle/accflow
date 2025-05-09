'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Profile {
  id: string;
  email: string;
  company_name: string;
  role: string;
  clientCount?: number;
}

interface Client {
  id: string;
  created_by: string;
}

export default function AdminDashboardPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, email, company_name, role');

        if (profilesError) {
          console.error('Error fetching profiles:', profilesError);
          setError('Failed to load user profiles. ' + profilesError.message);
          setLoading(false);
          return;
        }

        if (!profilesData) {
          setError('No profiles data returned.');
          setProfiles([]);
          setLoading(false);
          return;
        }

        const { data: clientsData, error: clientsError } = await supabase
          .from('clients')
          .select('id, created_by');

        if (clientsError) {
          console.error('Error fetching clients:', clientsError);
          setError('Failed to load client counts. ' + clientsError.message);
        }

        const profilesWithCounts: Profile[] = profilesData.map(profile => {
          const count = clientsData?.filter(client => client.created_by === profile.id).length || 0;
          return { ...profile, clientCount: count };
        });

        setProfiles(profilesWithCounts);

      } catch (err: any) {
        console.error('Unexpected error fetching admin data:', err);
        setError('An unexpected error occurred. ' + err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-800">Admin Dashboard</h1>
        <p className="text-gray-600 mt-1">Overview of users and system data.</p>
      </div>

      {loading && (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="ml-4 text-gray-600">Loading data...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6" role="alert">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="mb-8 p-6 bg-white shadow rounded-lg border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-700">User Statistics</h2>
            <p className="mt-2 text-gray-600">Total users (profiles): <span className="font-bold text-primary">{profiles.length}</span></p>
          </div>

          <div className="bg-white shadow rounded-lg border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-700">User Details</h2>
              <p className="text-sm text-gray-500">List of all users and their client counts.</p>
            </div>
            <div className="overflow-x-auto">
              {profiles.length > 0 ? (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Company Name
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Role
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Client Count
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {profiles.map((profile) => (
                      <tr key={profile.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {profile.company_name || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {profile.email}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {profile.role}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-center">
                          {profile.clientCount ?? 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="px-6 py-4 text-gray-500">No user profiles found.</p>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
} 