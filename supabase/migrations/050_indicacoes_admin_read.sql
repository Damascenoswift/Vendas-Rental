-- Migration 050: Allow admins/support to read all indicacoes (leads)

DROP POLICY IF EXISTS "Admins can view all indicacoes" ON public.indicacoes;

CREATE POLICY "Admins can view all indicacoes"
ON public.indicacoes
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.users
    WHERE users.id = auth.uid()
      AND users.role IN (
        'adm_mestre',
        'adm_dorata',
        'suporte_tecnico',
        'suporte_limitado',
        'funcionario_n1',
        'funcionario_n2',
        'supervisor'
      )
  )
);
