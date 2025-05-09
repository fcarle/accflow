import { createClient } from '@supabase/supabase-js'

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_URL')
}
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'accflow-auth-token',
      storage: {
        getItem: (key) => {
          if (typeof window === 'undefined') return null
          return window.localStorage.getItem(key)
        },
        setItem: (key, value) => {
          if (typeof window === 'undefined') return
          window.localStorage.setItem(key, value)
        },
        removeItem: (key) => {
          if (typeof window === 'undefined') return
          window.localStorage.removeItem(key)
        },
      },
    },
  }
) 