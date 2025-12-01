-- Migração: Campos para controle manual de assinatura e compensação
-- Data: 2025-02-xx
-- Objetivo: Permitir ao admin registrar quando a indicação foi assinada e compensada

ALTER TABLE public.indicacoes
  ADD COLUMN IF NOT EXISTS assinada_em timestamptz,
  ADD COLUMN IF NOT EXISTS compensada_em timestamptz;

-- Índices simples para consultas por data
CREATE INDEX IF NOT EXISTS idx_indicacoes_assinada_em ON public.indicacoes(assinada_em DESC);
CREATE INDEX IF NOT EXISTS idx_indicacoes_compensada_em ON public.indicacoes(compensada_em DESC);
