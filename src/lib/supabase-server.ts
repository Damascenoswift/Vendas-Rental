import { createClient } from '@supabase/supabase-js'

type ServiceClientOptions = {
  accessToken?: string
}

function getJwtRole(token?: string | null) {
  if (!token) return null

  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const decoded = Buffer.from(payload, 'base64url').toString('utf8')
    const parsed = JSON.parse(decoded) as { role?: string }
    return parsed.role ?? null
  } catch {
    return null
  }
}

export function createSupabaseServiceClient({
  accessToken,
}: ServiceClientOptions = {}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET

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

  const role = getJwtRole(serviceKey)
  const isSupabaseSecretKey = serviceKey.startsWith('sb_secret_')
  if (!isSupabaseSecretKey && role !== 'service_role') {
    throw new Error('Chave Supabase inválida para cliente admin: configure SUPABASE_SERVICE_ROLE_KEY com role=service_role')
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
