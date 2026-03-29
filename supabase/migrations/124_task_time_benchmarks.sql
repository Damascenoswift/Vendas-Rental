-- supabase/migrations/124_task_time_benchmarks.sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.task_time_benchmarks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    department text NOT NULL,
    label text NOT NULL,
    expected_business_days integer NOT NULL CHECK (expected_business_days > 0),
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.task_personal_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    benchmark_id uuid NOT NULL REFERENCES public.task_time_benchmarks(id) ON DELETE CASCADE,
    best_business_days integer NOT NULL CHECK (best_business_days > 0),
    achieved_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, benchmark_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_task_time_benchmarks_department
    ON public.task_time_benchmarks (department)
    WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_task_personal_records_user_id
    ON public.task_personal_records (user_id);

-- RLS
ALTER TABLE public.task_time_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_personal_records ENABLE ROW LEVEL SECURITY;

-- Benchmarks: leitura pública para autenticados, escrita apenas admin
CREATE POLICY "benchmarks_select" ON public.task_time_benchmarks
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "benchmarks_insert" ON public.task_time_benchmarks
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('adm_mestre', 'supervisor')
        )
    );

CREATE POLICY "benchmarks_update" ON public.task_time_benchmarks
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('adm_mestre', 'supervisor')
        )
    );

-- Personal records: cada usuário vê e escreve apenas os seus
CREATE POLICY "personal_records_select" ON public.task_personal_records
    FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "personal_records_upsert" ON public.task_personal_records
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "personal_records_update" ON public.task_personal_records
    FOR UPDATE TO authenticated USING (user_id = auth.uid());

COMMIT;
