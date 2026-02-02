-- Migration 057: Seed CRM Rental pipeline and stages
-- Description: Creates the default Rental CRM pipeline and stages.

BEGIN;

ALTER TABLE IF EXISTS public.crm_pipelines
    ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS public.crm_stages
    ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

WITH pipeline AS (
    INSERT INTO public.crm_pipelines (brand, name, description, sort_order, is_active)
    SELECT 'rental', 'CRM Rental', 'Pipeline padrao Rental', 0, true
    WHERE NOT EXISTS (
        SELECT 1 FROM public.crm_pipelines WHERE brand = 'rental'
    )
    RETURNING id
), pipeline_id AS (
    SELECT id FROM pipeline
    UNION ALL
    SELECT id FROM public.crm_pipelines
    WHERE brand = 'rental'
    ORDER BY id ASC
    LIMIT 1
)
INSERT INTO public.crm_stages (pipeline_id, name, sort_order, is_closed)
SELECT pipeline_id.id, stage.name, stage.sort_order, stage.is_closed
FROM pipeline_id,
LATERAL (
    VALUES
        ('Coleta de Dados', 1, false),
        ('Formulario enviado [ADV]', 2, false),
        ('Formulario Enviado', 3, false),
        ('Aguardando | ASS', 4, false),
        ('Aguardando PG - Transferir', 5, false),
        ('B-Obitante [cadastro]', 6, false),
        ('Processo Energisa', 7, false),
        ('Cadastrado', 8, false),
        ('Credito recebido', 9, false),
        ('Pos venda inicial', 10, false),
        ('Gestao de Usinas | Terceiros', 11, true)
) AS stage(name, sort_order, is_closed)
WHERE NOT EXISTS (
    SELECT 1 FROM public.crm_stages s
    WHERE s.pipeline_id = pipeline_id.id
      AND s.name = stage.name
);

COMMIT;
