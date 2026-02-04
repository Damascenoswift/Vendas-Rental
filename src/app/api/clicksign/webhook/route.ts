import { NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

const statusMap: Record<string, 'EM_ANALISE' | 'AGUARDANDO_ASSINATURA' | 'REJEITADA'> = {
  sent: 'AGUARDANDO_ASSINATURA',
  requested: 'AGUARDANDO_ASSINATURA',
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

    // Signed/completed is now handled manually by task checklist commands.
    if (sourceStatus === 'signed' || sourceStatus === 'completed') {
      return NextResponse.json({ ok: true, ignored: true, reason: 'manual_contract_signed_control' })
    }

    const mapped = statusMap[sourceStatus] || 'EM_ANALISE'
    const supabase = createSupabaseServiceClient()

    const { data: indicacaoAtualData } = await supabase
      .from('indicacoes')
      .select('contrato_enviado_em, assinada_em')
      .eq('id', indicacaoId)
      .maybeSingle()

    const indicacaoAtual = indicacaoAtualData as {
      contrato_enviado_em: string | null
      assinada_em: string | null
    } | null

    const now = new Date().toISOString()
    const updates: Record<string, string> = {
      status: mapped,
    }

    if (['sent', 'requested'].includes(sourceStatus) && !indicacaoAtual?.contrato_enviado_em) {
      updates.contrato_enviado_em = now
    }

    const { error } = await supabase
      .from('indicacoes')
      .update(updates)
      .eq('id', indicacaoId)

    if (error) {
      return NextResponse.json({ error: 'update_failed', details: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, indicacao_id: indicacaoId, new_status: mapped })
  } catch (e) {
    return NextResponse.json({ error: 'unexpected' }, { status: 500 })
  }
}
