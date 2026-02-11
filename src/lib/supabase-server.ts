import { createClient } from '@supabase/supabase-js'

type ServiceClientOptions = {
  accessToken?: string
}

export function createSupabaseServiceClient({
  accessToken,
}: ServiceClientOptions = {}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL não está configurada')
  }

  // Se tem token de usuário, usa a chave ANON para respeitar o RLS
  if (accessToken) {
    if (!anonKey) {
      throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY não está configurada')
    }
    return createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        persistSession: false,
      },
    })
  }

  // Se não tem token, usa a Service Key (Admin/Cron jobs)
  if (!serviceKey) {
    throw new Error('SUPABASE_SECRET ou SUPABASE_SERVICE_ROLE_KEY não está configurada')
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
    },
  })
}

export async function getUserFromAuthorizationHeader(request: Request) {
  const authHeader = request.headers.get('authorization') ?? request.headers.get('Authorization')
  if (!authHeader) {
    return {
      error: 'Token ausente',
    } as const
  }

  const token = authHeader.replace('Bearer ', '').trim()

  if (!token) {
    return {
      error: 'Token inválido',
    } as const
  }

  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase.auth.getUser(token)

  if (error || !data.user) {
    return {
      error: error?.message ?? 'Usuário não autorizado',
    } as const
  }

  return {
    user: data.user,
    token,
  } as const
}
