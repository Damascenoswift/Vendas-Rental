
-- Drop existing policy to update it
DROP POLICY IF EXISTS "Admins Full Access Tasks" ON public.tasks;

-- Recreate policy with new roles
CREATE POLICY "Admins Full Access Tasks"
ON public.tasks
FOR ALL
USING (
    auth.uid() IN (
        SELECT id FROM public.users 
        WHERE role IN ('adm_mestre', 'adm_dorata', 'suporte_tecnico', 'supervisor', 'funcionario_n1', 'funcionario_n2')
    )
);
