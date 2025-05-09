'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Profile {
  id: string
  email: string
  company_name: string
  role: string
}

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    const checkUser = async () => {
      try {
        console.log('Checking user session...')
        const { data: { session } } = await supabase.auth.getSession()
        
        if (!session) {
          console.log('No session found, redirecting to login')
          router.push('/login')
          return
        }

        console.log('Session found, fetching profile...')
        // Fetch user profile
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()

        if (profileError) {
          console.error('Error fetching profile:', profileError)
          setError('Error loading profile data')
          return
        }

        console.log('Profile data:', profileData)
        setProfile(profileData)
      } catch (error) {
        console.error('Error in checkUser:', error)
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
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
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
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
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            Sign Out
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-2xl font-bold mb-4 text-gray-900">Welcome to AccFlow</h2>
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Your Profile</h3>
            <p className="mt-1 text-gray-800"><span className="font-medium">Email:</span> {profile.email}</p>
            <p className="mt-1 text-gray-800"><span className="font-medium">Company:</span> {profile.company_name}</p>
            <p className="mt-1 text-gray-800"><span className="font-medium">Role:</span> {profile.role}</p>
          </div>
        </div>
      </div>
    </div>
  )
} 