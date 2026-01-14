import { supabaseAdmin } from "../supabase/admin"

// --- Tools Schema (for Gemini) ---
export const tools = [
    {
        name: "check_client_status",
        description: "Search for a client and show their basic info (status, units, recent activity). Use this when user asks 'Who is client X?' or 'Status of client Y'.",
        parameters: {
            type: "OBJECT",
            properties: {
                search_term: {
                    type: "STRING",
                    description: "The name or CPF of the client to search for."
                }
            },
            required: ["search_term"]
        }
    },
    {
        name: "get_daily_sales",
        description: "Get the total sales/indications count for today. Use this when user asks 'How are sales today?' or 'Daily stats'.",
        parameters: {
            type: "OBJECT",
            properties: {},
        }
    }
]

// --- Tools Implementation (Typescript functions) ---

async function checkClientStatus(searchTerm: string) {
    // 1. Search in 'users' or 'profiles' table. 
    // Assuming 'public.users' stores client data based on previous conversations.
    // We will search by 'nome' or 'cpf'.

    // Cleaning the search term
    const term = searchTerm.trim()

    // Try to find by CPF match or Name ILIKE
    const { data: clients, error } = await supabaseAdmin
        .from('users') // Adjust if your table is named differently (e.g. 'clientes' or 'profiles')
        .select('*')
        .or(`nome.ilike.%${term}%,cpf.eq.${term}`)
        .limit(3)

    if (error) {
        return `Error searching client: ${error.message}`
    }

    if (!clients || clients.length === 0) {
        return `No client found matching '${term}'.`
    }

    // Format the result for the AI
    return clients.map(c => `
    - Name: ${c.nome}
    - CPF: ${c.cpf}
    - Status: ${c.status || 'Active'}
    - Email: ${c.email}
    `).join("\n")
}

async function getDailySales() {
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD

    // Assuming 'indications' or 'sales' table
    const { count, error } = await supabaseAdmin
        .from('indicacoes') // Adjust to your actual sales/leads table
        .select('*', { count: 'exact', head: true })
        .gte('created_at', `${today}T00:00:00`)

    if (error) {
        return `Error getting stats: ${error.message}`
    }

    return `Total indications/sales today (${today}): ${count || 0}`
}

// --- Tools Dispatcher ---
export async function runTool(toolName: string, args: any) {
    switch (toolName) {
        case "check_client_status":
            return await checkClientStatus(args.search_term)
        case "get_daily_sales":
            return await getDailySales()
        default:
            return `Tool ${toolName} not found.`
    }
}
