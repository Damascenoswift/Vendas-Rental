-- Migration: Update RLS policies for Supervisor Hierarchy
-- Data: 2026-01-19
-- Descrição: Permite que supervisores vejam e gerenciem indicações de seus subordinados

-- 1. Policy de Leitura para Supervisores
CREATE POLICY "Supervisores podem ver indicações de subordinados"
ON public.indicacoes
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = public.indicacoes.user_id
    AND users.supervisor_id = auth.uid()
  )
);

-- 2. Policy de Inserção (Supervisor criando para subordinado)
-- Já permitimos isso via createIndicationAction (Server Action), 
-- mas se quisermos via RLS:
CREATE POLICY "Supervisores podem inserir para subordinados"
ON public.indicacoes
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = public.indicacoes.user_id
    AND users.supervisor_id = auth.uid()
  )
);

-- 3. Policy de Atualização
CREATE POLICY "Supervisores podem atualizar indicações de subordinados"
ON public.indicacoes
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = public.indicacoes.user_id
    AND users.supervisor_id = auth.uid()
  )
);

-- 4. Policy de Deleção
CREATE POLICY "Supervisores podem deletar indicações de subordinados"
ON public.indicacoes
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = public.indicacoes.user_id
    AND users.supervisor_id = auth.uid()
  )
);
