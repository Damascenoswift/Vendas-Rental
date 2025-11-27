-- ==============================================================================
-- DEBUG: SIMPLIFY RLS
-- Description: 
-- Removes the complex "brand check" logic and reverts to simple ownership checks.
-- This helps us confirm if the issue is with the complex query or basic permissions.
-- ==============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Indicacoes própria + marca" ON public.indicacoes;
DROP POLICY IF EXISTS "Inserir indicacao marca permitida" ON public.indicacoes;
DROP POLICY IF EXISTS "Atualizar indicacao marca permitida" ON public.indicacoes;
DROP POLICY IF EXISTS "Deletar indicacao marca permitida" ON public.indicacoes;

-- Create SIMPLE policies (Ownership only)

-- SELECT: Users can see their own indications
CREATE POLICY "Debug: Select Own"
ON public.indicacoes
FOR SELECT
USING (
  auth.uid() = user_id
);

-- INSERT: Users can insert rows where they are the owner
CREATE POLICY "Debug: Insert Own"
ON public.indicacoes
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
);

-- UPDATE: Users can update their own indications
CREATE POLICY "Debug: Update Own"
ON public.indicacoes
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- DELETE: Users can delete their own indications
CREATE POLICY "Debug: Delete Own"
ON public.indicacoes
FOR DELETE
USING (auth.uid() = user_id);
