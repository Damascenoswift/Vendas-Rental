BEGIN;

ALTER TABLE public.task_checklists
ADD COLUMN IF NOT EXISTS event_key TEXT;

ALTER TABLE public.task_checklists
DROP CONSTRAINT IF EXISTS task_checklists_event_key_check;

ALTER TABLE public.task_checklists
ADD CONSTRAINT task_checklists_event_key_check
CHECK (
  event_key IS NULL OR event_key IN (
    'DOCS_APPROVED',
    'DOCS_INCOMPLETE',
    'DOCS_REJECTED',
    'CONTRACT_SENT',
    'CONTRACT_SIGNED'
  )
);

CREATE INDEX IF NOT EXISTS idx_task_checklists_event_key
ON public.task_checklists (event_key);

-- Backfill event keys for existing checklist items
UPDATE public.task_checklists
SET event_key = 'DOCS_APPROVED'
WHERE event_key IS NULL
  AND lower(title) LIKE '%document%'
  AND lower(title) LIKE '%aprov%';

UPDATE public.task_checklists
SET event_key = 'DOCS_INCOMPLETE'
WHERE event_key IS NULL
  AND lower(title) LIKE '%document%'
  AND (lower(title) LIKE '%incomplet%' OR lower(title) LIKE '%penden%');

UPDATE public.task_checklists
SET event_key = 'DOCS_REJECTED'
WHERE event_key IS NULL
  AND lower(title) LIKE '%document%'
  AND (lower(title) LIKE '%rejeit%' OR lower(title) LIKE '%reprov%');

UPDATE public.task_checklists
SET event_key = 'CONTRACT_SENT'
WHERE event_key IS NULL
  AND (lower(title) LIKE '%enviar contrato%' OR lower(title) LIKE '%contrato enviado%');

UPDATE public.task_checklists
SET event_key = 'CONTRACT_SIGNED'
WHERE event_key IS NULL
  AND lower(title) LIKE '%contrato assinado%';

-- Ensure all rental cadastro tasks have command items for docs + contract milestones
WITH target_tasks AS (
  SELECT t.id AS task_id
  FROM public.tasks t
  WHERE t.brand = 'rental'
    AND t.department IN ('cadastro', 'CADASTRO')
),
template AS (
  SELECT *
  FROM (
    VALUES
      ('Documentação aprovada', 'DOCS_APPROVED', 1, 0),
      ('Documentação incompleta', 'DOCS_INCOMPLETE', 2, 0),
      ('Documentação rejeitada', 'DOCS_REJECTED', 3, 0),
      ('Concluir contrato', NULL, 4, 1),
      ('Enviar contrato', 'CONTRACT_SENT', 5, 1),
      ('Contrato assinado', 'CONTRACT_SIGNED', 6, 4)
  ) AS v(title, event_key, sort_order, due_days)
)
INSERT INTO public.task_checklists (
  task_id,
  title,
  event_key,
  phase,
  sort_order,
  due_date
)
SELECT
  tt.task_id,
  tpl.title,
  tpl.event_key,
  'cadastro',
  tpl.sort_order,
  now() + make_interval(days => tpl.due_days)
FROM target_tasks tt
CROSS JOIN template tpl
WHERE NOT EXISTS (
  SELECT 1
  FROM public.task_checklists tc
  WHERE tc.task_id = tt.task_id
    AND lower(tc.title) = lower(tpl.title)
);

NOTIFY pgrst, 'reload schema';

COMMIT;
