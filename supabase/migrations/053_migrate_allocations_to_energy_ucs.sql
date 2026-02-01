-- Migration 053: Migrate legacy allocations to UC-based model
-- Description: Creates energia_ucs from indicacoes used in alocacoes_clientes
--              and migrates allocations into energia_alocacoes_ucs.

BEGIN;

-- 1) Create missing UCs for allocations
INSERT INTO public.energia_ucs (
    cliente_id,
    codigo_uc_fatura,
    tipo_uc,
    atendido_via_consorcio,
    transferida_para_consorcio,
    ativo
)
SELECT DISTINCT
    i.id AS cliente_id,
    COALESCE(i.codigo_cliente, i.unidade_consumidora, i.id::text) AS codigo_uc_fatura,
    'normal' AS tipo_uc,
    false AS atendido_via_consorcio,
    false AS transferida_para_consorcio,
    true AS ativo
FROM public.alocacoes_clientes a
JOIN public.indicacoes i ON i.id = a.cliente_id
LEFT JOIN public.energia_ucs u
  ON u.cliente_id = i.id
 AND u.codigo_uc_fatura = COALESCE(i.codigo_cliente, i.unidade_consumidora, i.id::text)
WHERE u.id IS NULL;

-- 2) Migrate allocations into UC-based table
INSERT INTO public.energia_alocacoes_ucs (
    usina_id,
    uc_id,
    percentual_alocado,
    quantidade_kwh_alocado,
    data_inicio,
    data_fim,
    status,
    created_at,
    updated_at
)
SELECT
    a.usina_id,
    u.id AS uc_id,
    a.percentual_alocado,
    a.quantidade_kwh_alocado,
    a.data_inicio,
    a.data_fim,
    a.status,
    a.created_at,
    now()
FROM public.alocacoes_clientes a
JOIN public.indicacoes i ON i.id = a.cliente_id
JOIN public.energia_ucs u
  ON u.cliente_id = i.id
 AND u.codigo_uc_fatura = COALESCE(i.codigo_cliente, i.unidade_consumidora, i.id::text)
LEFT JOIN public.energia_alocacoes_ucs e
  ON e.usina_id = a.usina_id
 AND e.uc_id = u.id
 AND COALESCE(e.percentual_alocado, -1) = COALESCE(a.percentual_alocado, -1)
 AND COALESCE(e.quantidade_kwh_alocado, -1) = COALESCE(a.quantidade_kwh_alocado, -1)
 AND e.data_inicio = a.data_inicio
 AND COALESCE(e.data_fim, DATE '1900-01-01') = COALESCE(a.data_fim, DATE '1900-01-01')
 AND e.status = a.status
WHERE e.id IS NULL;

COMMIT;
