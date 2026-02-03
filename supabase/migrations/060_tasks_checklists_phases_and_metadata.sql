-- Migration 060: Add task checklist phases, completion metadata, and installation code on tasks
-- Description: Supports phase-based checklists, per-item deadlines, and Energisa activation tracking.

BEGIN;

-- Tasks: store installation code + Energisa activation timestamp
ALTER TABLE public.tasks
    ADD COLUMN IF NOT EXISTS codigo_instalacao TEXT,
    ADD COLUMN IF NOT EXISTS energisa_activated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tasks_codigo_instalacao
ON public.tasks (codigo_instalacao);

-- Task checklists: per-item deadlines + completion metadata + phase
ALTER TABLE public.task_checklists
    ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS phase TEXT;

CREATE INDEX IF NOT EXISTS idx_task_checklists_task_phase
ON public.task_checklists (task_id, phase);

CREATE INDEX IF NOT EXISTS idx_task_checklists_completed_by
ON public.task_checklists (completed_by);

COMMIT;
