-- Migration 046: Align tasks.department values with app enums

BEGIN;

ALTER TABLE public.tasks
    DROP CONSTRAINT IF EXISTS tasks_department_check;

UPDATE public.tasks
SET department = lower(department)
WHERE department IS NOT NULL;

ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_department_check
    CHECK (department IN ('vendas', 'cadastro', 'energia', 'juridico', 'financeiro', 'ti', 'diretoria', 'outro'));

COMMIT;
