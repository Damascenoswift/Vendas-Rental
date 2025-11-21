import { NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

const statusMap: Record<string, 'EM_ANALISE' | 'CONCLUIDA' | 'REJEITADA'> = {
  sent: 'EM_ANALISE',
  requested: 'EM_ANALISE',
  signed: 'CONCLUIDA',
  completed: 'CONCLUIDA',
  cancelled: 'REJEITADA',
  error: 'REJEITADA',
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
    }

    const indicacaoId: string | undefined = body?.indicacao_id || body?.data?.indicacao_id
    const sourceStatus: string | undefined = body?.status || body?.data?.status

    if (!indicacaoId || !sourceStatus) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
    }

    const mapped = statusMap[sourceStatus] || 'EM_ANALISE'
    const supabase = createSupabaseServiceClient()

    const { error } = await supabase
      .from('indicacoes')
      .update({ status: mapped })
      .eq('id', indicacaoId)

    if (error) {
      return NextResponse.json({ error: 'update_failed', details: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, indicacao_id: indicacaoId, new_status: mapped })
  } catch (e) {
    return NextResponse.json({ error: 'unexpected' }, { status: 500 })
  }
}
