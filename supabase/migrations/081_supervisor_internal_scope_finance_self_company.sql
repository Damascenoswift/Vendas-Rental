BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS supervised_company_name text;

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
        'funcionario_n2'
      )
  )
);

DROP POLICY IF EXISTS "Supervisores podem ver indicações de subordinados" ON public.indicacoes;
CREATE POLICY "Supervisores podem ver indicações de subordinados"
ON public.indicacoes
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.users subordinate
    WHERE subordinate.id = public.indicacoes.user_id
      AND subordinate.supervisor_id = auth.uid()
      AND subordinate.role = 'vendedor_interno'
  )
  AND EXISTS (
    SELECT 1
    FROM public.users actor
    WHERE actor.id = auth.uid()
      AND actor.role = 'supervisor'
  )
);

DROP POLICY IF EXISTS "Supervisores podem inserir para subordinados" ON public.indicacoes;
CREATE POLICY "Supervisores podem inserir para subordinados"
ON public.indicacoes
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.users subordinate
    WHERE subordinate.id = public.indicacoes.user_id
      AND subordinate.supervisor_id = auth.uid()
      AND subordinate.role = 'vendedor_interno'
  )
  AND EXISTS (
    SELECT 1
    FROM public.users actor
    WHERE actor.id = auth.uid()
      AND actor.role = 'supervisor'
  )
);

DROP POLICY IF EXISTS "Supervisores podem atualizar indicações de subordinados" ON public.indicacoes;
DROP POLICY IF EXISTS "Supervisores podem deletar indicações de subordinados" ON public.indicacoes;

COMMIT;
