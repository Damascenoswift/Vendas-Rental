import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
    const errorMessage =
        "Supabase environment variables are missing. Please check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    console.error(errorMessage)
    throw new Error(errorMessage)
}

// Temporary loose typing while database.ts is being regenerated.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)
