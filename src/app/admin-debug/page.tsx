import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function AdminDebugPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL

    const mask = (str?: string) => str ? `${str.slice(0, 5)}...${str.slice(-5)}` : 'UNDEFINED'

    return (
        <div className="p-10 font-mono space-y-4">
            <h1 className="text-2xl font-bold">Debug Environment</h1>

            <div className="bg-gray-100 p-4 rounded">
                <h2 className="font-bold">Environment Variables</h2>
                <p>URL: {url}</p>
                <p>Anon Key: {mask(anonKey)}</p>
                <p>Service Key: {mask(serviceKey)}</p>
            </div>

            <div className="bg-gray-100 p-4 rounded">
                <h2 className="font-bold">Auth Status</h2>
                <p>User ID: {user?.id ?? 'Not Logged In'}</p>
                <p>Email: {user?.email ?? 'N/A'}</p>
                <p>Role (Metadata): {user?.user_metadata?.role ?? 'N/A'}</p>
            </div>
        </div>
    )
}
