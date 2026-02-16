-- Incident helper: indicacao sumiu de /admin/indicacoes e /admin/crm/rental,
-- mas a tarefa ainda aparece em /admin/tarefas.
--
-- Causa mais comum neste projeto:
-- - indicacao foi excluida;
-- - card do CRM foi removido junto;
-- - tarefas foram mantidas com indicacao_id = null (orfas), mas com nome/codigo no texto.
--
-- Execute no SQL Editor do Supabase (perfil admin/service role).
-- Fluxo recomendado:
-- 1) Rodar secoes 1-4 (diagnostico e preview).
-- 2) Se estiver correto, rodar secao 5 (relink tarefas).
-- 3) Rodar secao 6 (garantir card no CRM Rental).
-- 4) Rodar secao 7 (validacao final).
--
-- Parametros do caso atual:
-- - codigo_instalacao: 00003065907
-- - nome_busca: FLAVIO PEREIRA RAMOS
-- - marca: rental

-- =========================================================
-- 1) DIAGNOSTICO: INDICACOES CANDIDATAS
-- =========================================================
WITH params AS (
    SELECT
        '00003065907'::text AS codigo_instalacao,
        'FLAVIO PEREIRA RAMOS'::text AS nome_busca,
        'rental'::text AS marca
)
SELECT
    i.id,
    i.nome,
    i.status,
    i.marca,
    i.user_id,
    i.codigo_instalacao,
    i.created_at,
    i.updated_at
FROM public.indicacoes i, params p
WHERE lower(i.marca) = lower(p.marca)
  AND (
      (nullif(p.codigo_instalacao, '') IS NOT NULL AND trim(coalesce(i.codigo_instalacao, '')) = p.codigo_instalacao)
      OR
      (nullif(p.nome_busca, '') IS NOT NULL AND i.nome ILIKE '%' || p.nome_busca || '%')
  )
ORDER BY
    CASE WHEN trim(coalesce(i.codigo_instalacao, '')) = (SELECT codigo_instalacao FROM params) THEN 0 ELSE 1 END,
    i.created_at DESC;

-- =========================================================
-- 2) DIAGNOSTICO: TAREFAS RELACIONADAS (inclui orfas)
-- =========================================================
WITH params AS (
    SELECT
        '00003065907'::text AS codigo_instalacao,
        'FLAVIO PEREIRA RAMOS'::text AS nome_busca,
        'rental'::text AS marca
)
SELECT
    t.id,
    t.title,
    t.status,
    t.priority,
    t.department,
    t.brand,
    t.client_name,
    t.codigo_instalacao,
    t.indicacao_id,
    CASE WHEN t.indicacao_id IS NULL THEN 'ORFA' ELSE 'VINCULADA' END AS vinculo,
    t.created_at,
    t.updated_at
FROM public.tasks t, params p
WHERE lower(coalesce(t.brand, 'rental')) = lower(p.marca)
  AND (
      (nullif(p.codigo_instalacao, '') IS NOT NULL AND trim(coalesce(t.codigo_instalacao, '')) = p.codigo_instalacao)
      OR
      (nullif(p.nome_busca, '') IS NOT NULL AND (
          coalesce(t.client_name, '') ILIKE '%' || p.nome_busca || '%'
          OR coalesce(t.title, '') ILIKE '%' || p.nome_busca || '%'
      ))
  )
ORDER BY t.created_at DESC;

-- =========================================================
-- 3) DIAGNOSTICO: CARDS DE CRM RELACIONADOS
-- =========================================================
WITH params AS (
    SELECT
        '00003065907'::text AS codigo_instalacao,
        'FLAVIO PEREIRA RAMOS'::text AS nome_busca,
        'rental'::text AS marca
),
indicacao_ids AS (
    SELECT i.id
    FROM public.indicacoes i, params p
    WHERE lower(i.marca) = lower(p.marca)
      AND (
          (nullif(p.codigo_instalacao, '') IS NOT NULL AND trim(coalesce(i.codigo_instalacao, '')) = p.codigo_instalacao)
          OR
          (nullif(p.nome_busca, '') IS NOT NULL AND i.nome ILIKE '%' || p.nome_busca || '%')
      )
    UNION
    SELECT t.indicacao_id
    FROM public.tasks t, params p
    WHERE t.indicacao_id IS NOT NULL
      AND lower(coalesce(t.brand, 'rental')) = lower(p.marca)
      AND (
          (nullif(p.codigo_instalacao, '') IS NOT NULL AND trim(coalesce(t.codigo_instalacao, '')) = p.codigo_instalacao)
          OR
          (nullif(p.nome_busca, '') IS NOT NULL AND (
              coalesce(t.client_name, '') ILIKE '%' || p.nome_busca || '%'
              OR coalesce(t.title, '') ILIKE '%' || p.nome_busca || '%'
          ))
      )
)
SELECT
    c.id AS card_id,
    c.indicacao_id,
    cp.brand,
    cp.name AS pipeline_name,
    cs.name AS stage_name,
    c.created_at,
    c.updated_at
FROM public.crm_cards c
JOIN public.crm_pipelines cp ON cp.id = c.pipeline_id
JOIN public.crm_stages cs ON cs.id = c.stage_id
WHERE c.indicacao_id IN (SELECT id FROM indicacao_ids)
ORDER BY c.created_at DESC;

-- =========================================================
-- 4) PREVIEW: ALVO DE RELINK + TAREFAS ORFAS QUE SERAO ATUALIZADAS
-- =========================================================
WITH params AS (
    SELECT
        '00003065907'::text AS codigo_instalacao,
        'FLAVIO PEREIRA RAMOS'::text AS nome_busca,
        'rental'::text AS marca
),
target_candidates AS (
    SELECT
        i.*,
        CASE
            WHEN trim(coalesce(i.codigo_instalacao, '')) = (SELECT codigo_instalacao FROM params) THEN 0
            ELSE 1
        END AS score
    FROM public.indicacoes i, params p
    WHERE lower(i.marca) = lower(p.marca)
      AND (
          (nullif(p.codigo_instalacao, '') IS NOT NULL AND trim(coalesce(i.codigo_instalacao, '')) = p.codigo_instalacao)
          OR
          (nullif(p.nome_busca, '') IS NOT NULL AND i.nome ILIKE '%' || p.nome_busca || '%')
      )
),
target_indicacao AS (
    SELECT *
    FROM target_candidates
    ORDER BY score ASC, created_at DESC
    LIMIT 1
),
orphan_tasks AS (
    SELECT t.*
    FROM public.tasks t, params p
    WHERE t.indicacao_id IS NULL
      AND lower(coalesce(t.brand, 'rental')) = lower(p.marca)
      AND (
          (nullif(p.codigo_instalacao, '') IS NOT NULL AND trim(coalesce(t.codigo_instalacao, '')) = p.codigo_instalacao)
          OR
          (nullif(p.nome_busca, '') IS NOT NULL AND (
              coalesce(t.client_name, '') ILIKE '%' || p.nome_busca || '%'
              OR coalesce(t.title, '') ILIKE '%' || p.nome_busca || '%'
          ))
      )
)
SELECT
    ot.id AS task_id,
    ot.title AS task_title,
    ot.codigo_instalacao AS task_codigo_instalacao,
    ot.client_name AS task_client_name,
    ti.id AS target_indicacao_id,
    ti.nome AS target_indicacao_nome,
    ti.codigo_instalacao AS target_codigo_instalacao
FROM orphan_tasks ot
CROSS JOIN target_indicacao ti
ORDER BY ot.created_at DESC;

-- =========================================================
-- 5) APPLY: RELINK DAS TAREFAS ORFAS PARA A INDICACAO ALVO
-- =========================================================
-- ATENCAO:
-- - Rode somente depois de conferir a secao 4.
-- - Mantem historico natural das tarefas; apenas restaura o vinculo indicacao_id.
BEGIN;

WITH params AS (
    SELECT
        '00003065907'::text AS codigo_instalacao,
        'FLAVIO PEREIRA RAMOS'::text AS nome_busca,
        'rental'::text AS marca
),
target_candidates AS (
    SELECT
        i.*,
        CASE
            WHEN trim(coalesce(i.codigo_instalacao, '')) = (SELECT codigo_instalacao FROM params) THEN 0
            ELSE 1
        END AS score
    FROM public.indicacoes i, params p
    WHERE lower(i.marca) = lower(p.marca)
      AND (
          (nullif(p.codigo_instalacao, '') IS NOT NULL AND trim(coalesce(i.codigo_instalacao, '')) = p.codigo_instalacao)
          OR
          (nullif(p.nome_busca, '') IS NOT NULL AND i.nome ILIKE '%' || p.nome_busca || '%')
      )
),
target_indicacao AS (
    SELECT *
    FROM target_candidates
    ORDER BY score ASC, created_at DESC
    LIMIT 1
),
orphan_tasks AS (
    SELECT t.id
    FROM public.tasks t, params p
    WHERE t.indicacao_id IS NULL
      AND lower(coalesce(t.brand, 'rental')) = lower(p.marca)
      AND (
          (nullif(p.codigo_instalacao, '') IS NOT NULL AND trim(coalesce(t.codigo_instalacao, '')) = p.codigo_instalacao)
          OR
          (nullif(p.nome_busca, '') IS NOT NULL AND (
              coalesce(t.client_name, '') ILIKE '%' || p.nome_busca || '%'
              OR coalesce(t.title, '') ILIKE '%' || p.nome_busca || '%'
          ))
      )
),
updated_tasks AS (
    UPDATE public.tasks t
    SET
        indicacao_id = ti.id,
        updated_at = now()
    FROM target_indicacao ti
    WHERE t.id IN (SELECT id FROM orphan_tasks)
    RETURNING
        t.id,
        t.title,
        t.indicacao_id,
        t.codigo_instalacao,
        t.updated_at
)
SELECT *
FROM updated_tasks
ORDER BY updated_at DESC;

COMMIT;

-- =========================================================
-- 6) GARANTIR CARD NO CRM RENTAL PARA A INDICACAO ALVO
-- =========================================================
-- Se o card ja existir, nao insere duplicado.
WITH params AS (
    SELECT
        '00003065907'::text AS codigo_instalacao,
        'FLAVIO PEREIRA RAMOS'::text AS nome_busca,
        'rental'::text AS marca
),
target_candidates AS (
    SELECT
        i.*,
        CASE
            WHEN trim(coalesce(i.codigo_instalacao, '')) = (SELECT codigo_instalacao FROM params) THEN 0
            ELSE 1
        END AS score
    FROM public.indicacoes i, params p
    WHERE lower(i.marca) = lower(p.marca)
      AND (
          (nullif(p.codigo_instalacao, '') IS NOT NULL AND trim(coalesce(i.codigo_instalacao, '')) = p.codigo_instalacao)
          OR
          (nullif(p.nome_busca, '') IS NOT NULL AND i.nome ILIKE '%' || p.nome_busca || '%')
      )
),
target_indicacao AS (
    SELECT *
    FROM target_candidates
    ORDER BY score ASC, created_at DESC
    LIMIT 1
),
target_pipeline AS (
    SELECT cp.id
    FROM public.crm_pipelines cp, params p
    WHERE cp.is_active = true
      AND lower(cp.brand) = lower(p.marca)
    ORDER BY cp.sort_order ASC, cp.created_at ASC
    LIMIT 1
),
target_stage AS (
    SELECT cs.id
    FROM public.crm_stages cs
    JOIN target_pipeline tp ON tp.id = cs.pipeline_id
    ORDER BY
        CASE
            WHEN cs.name = 'Formulario Enviado' THEN 0
            ELSE 1
        END,
        cs.sort_order ASC,
        cs.created_at ASC
    LIMIT 1
),
inserted_cards AS (
    INSERT INTO public.crm_cards (
        pipeline_id,
        stage_id,
        indicacao_id,
        title,
        assignee_id,
        created_by
    )
    SELECT
        tp.id,
        ts.id,
        ti.id,
        ti.nome,
        ti.user_id,
        NULL
    FROM target_pipeline tp
    JOIN target_stage ts ON TRUE
    JOIN target_indicacao ti ON TRUE
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.crm_cards c
        WHERE c.pipeline_id = tp.id
          AND c.indicacao_id = ti.id
    )
    RETURNING id, stage_id, indicacao_id, created_at
),
inserted_history AS (
    INSERT INTO public.crm_stage_history (
        card_id,
        from_stage_id,
        to_stage_id,
        changed_by
    )
    SELECT
        ic.id,
        NULL,
        ic.stage_id,
        NULL
    FROM inserted_cards ic
    RETURNING id
)
SELECT
    (SELECT count(*) FROM inserted_cards) AS cards_criados,
    (SELECT count(*) FROM inserted_history) AS historicos_criados;

-- =========================================================
-- 7) VALIDACAO FINAL (estado esperado)
-- =========================================================
WITH params AS (
    SELECT
        '00003065907'::text AS codigo_instalacao,
        'FLAVIO PEREIRA RAMOS'::text AS nome_busca,
        'rental'::text AS marca
)
SELECT
    t.id AS task_id,
    t.title AS task_title,
    t.indicacao_id,
    i.nome AS indicacao_nome,
    i.status AS indicacao_status,
    c.id AS crm_card_id,
    cs.name AS crm_stage,
    t.updated_at AS task_updated_at
FROM public.tasks t
LEFT JOIN public.indicacoes i ON i.id = t.indicacao_id
LEFT JOIN public.crm_cards c ON c.indicacao_id = t.indicacao_id
LEFT JOIN public.crm_stages cs ON cs.id = c.stage_id
, params p
WHERE lower(coalesce(t.brand, 'rental')) = lower(p.marca)
  AND (
      (nullif(p.codigo_instalacao, '') IS NOT NULL AND trim(coalesce(t.codigo_instalacao, '')) = p.codigo_instalacao)
      OR
      (nullif(p.nome_busca, '') IS NOT NULL AND (
          coalesce(t.client_name, '') ILIKE '%' || p.nome_busca || '%'
          OR coalesce(t.title, '') ILIKE '%' || p.nome_busca || '%'
      ))
  )
ORDER BY t.created_at DESC;
