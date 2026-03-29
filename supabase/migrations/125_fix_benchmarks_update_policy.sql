-- supabase/migrations/125_fix_benchmarks_update_policy.sql
-- Add WITH CHECK to benchmarks_update policy (was missing — only had USING)
BEGIN;

DROP POLICY IF EXISTS "benchmarks_update" ON public.task_time_benchmarks;

CREATE POLICY "benchmarks_update" ON public.task_time_benchmarks
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('adm_mestre', 'supervisor')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('adm_mestre', 'supervisor')
        )
    );

COMMIT;
