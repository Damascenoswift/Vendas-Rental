
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing env vars")
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkTasks() {
    console.log("Fetching last 5 tasks...")
    const { data, error } = await supabase
        .from('tasks')
        .select('id, title, brand, status, created_at')
        .order('created_at', { ascending: false })
        .limit(5)

    if (error) {
        console.error("Error fetching tasks:", error)
    } else {
        console.table(data)
    }
}

checkTasks()
