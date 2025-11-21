import { NextResponse } from 'next/server'

import { formatPhone, onlyDigits } from '@/lib/formatters'
import { createSupabaseServiceClient, getUserFromAuthorizationHeader } from '@/lib/supabase-server'
import { indicacaoSchema } from '@/lib/validations/indicacao'
import { getProfile } from '@/lib/auth'
import type { Database } from '@/types/database'

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

export async function GET(request: Request) {
  const authResult = await getUserFromAuthorizationHeader(request)

  if ('error' in authResult) {
    return NextResponse.json(
      {
        error: 'Não autorizado',
        message: authResult.error,
      },
      { status: 401 }
    )
  }

  const { user, token } = authResult

  // Criar cliente com o token do usuário para respeitar RLS
  const supabase = createSupabaseServiceClient({ accessToken: token })

  // Buscar perfil na tabela public.users (Fonte da verdade)
  const profile = await getProfile(supabase, user.id)

  if (!profile) {
    return NextResponse.json(
      {
        error: 'Perfil não encontrado',
        message: 'Não foi possível recuperar os dados do usuário. Contate o suporte.',
      },
      { status: 403 }
    )
  }

  const { searchParams } = new URL(request.url)

  const pageParam = Number.parseInt(searchParams.get('page') ?? '1', 10)
  const limitParam = Number.parseInt(
    searchParams.get('limit') ?? `${DEFAULT_PAGE_SIZE}`,
    10
  )
  const statusParam = searchParams.get('status')

  const page = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam
  const limit = Number.isNaN(limitParam)
    ? DEFAULT_PAGE_SIZE
    : Math.min(Math.max(limitParam, 1), MAX_PAGE_SIZE)
  const offset = (page - 1) * limit

  let query = supabase
    .from('indicacoes')
    .select('id, tipo, nome, email, telefone, status, created_at, updated_at, marca', {
      count: 'estimated',
    })
    // RLS já filtra por user_id e marca permitida, mas mantemos user_id por clareza se necessário
    // .eq('user_id', user.id) // RLS já garante isso
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  // Filtros adicionais (Opcionais, pois RLS já restringe o que não pode ver)
  if (statusParam) {
    query = query.eq('status', statusParam as 'EM_ANALISE' | 'APROVADA' | 'REJEITADA' | 'CONCLUIDA')
  }

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json(
      {
        error: 'Falha ao buscar indicações',
        message: error.message,
      },
      { status: 500 }
    )
  }

  const formatted = (data ?? []).map((indicacao) => ({
    ...(indicacao as Record<string, unknown>),
    telefone: formatPhone((indicacao as Record<string, unknown>).telefone as string ?? ''),
  }))

  return NextResponse.json({
    data: formatted,
    pagination: {
      page,
      limit,
      total: count ?? formatted.length,
    },
  })
}

export async function POST(request: Request) {
  const authResult = await getUserFromAuthorizationHeader(request)

  if ('error' in authResult) {
    return NextResponse.json(
      {
        error: 'Não autorizado',
        message: authResult.error,
      },
      { status: 401 }
    )
  }

  const { user, token } = authResult
  const supabase = createSupabaseServiceClient({ accessToken: token })

  const profile = await getProfile(supabase, user.id)

  if (!profile) {
    return NextResponse.json(
      {
        error: 'Perfil não encontrado',
        message: 'Não foi possível recuperar os dados do usuário.',
      },
      { status: 403 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      {
        error: 'Payload inválido',
        message: 'Não foi possível ler o corpo da requisição',
      },
      { status: 400 }
    )
  }

  const parsed = indicacaoSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Validação falhou',
        details: parsed.error.flatten(),
      },
      { status: 422 }
    )
  }

  const payload = parsed.data

  // Validação de negócio ( redundante com RLS, mas bom para UX imediata)
  if (!profile.allowedBrands.includes(payload.marca)) {
    return NextResponse.json(
      {
        error: 'Marca não permitida',
        message: 'Você não possui acesso para registrar indicações nesta marca',
      },
      { status: 403 }
    )
  }

  const newRow: Database['public']['Tables']['indicacoes']['Insert'] = {
    tipo: payload.tipo,
    nome: payload.nome.trim(),
    email: payload.email.trim().toLowerCase(),
    telefone: onlyDigits(payload.telefone),
    status: 'EM_ANALISE',
    user_id: user.id,
    marca: payload.marca,
  }

  const { data, error } = await supabase
    .from('indicacoes')
    .insert(newRow)
    .select('id, created_at')
    .single()

  if (error) {
    return NextResponse.json(
      {
        error: 'Falha ao criar indicação',
        message: error.message,
      },
      { status: 500 }
    )
  }

  return NextResponse.json(
    {
      data,
      message: 'Indicação registrada com sucesso',
    },
    { status: 201 }
  )
}
