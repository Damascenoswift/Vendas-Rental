-- Migration 047: Fix permissions for products and stock_movements

BEGIN;

-- Ensure authenticated users have table privileges (RLS still applies)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.products TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stock_movements TO authenticated;

-- Expand write policy for inventory to include employee roles
DROP POLICY IF EXISTS "Enable write access for admins" ON public.products;
CREATE POLICY "Enable write access for admins"
ON public.products
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role IN ('adm_mestre', 'adm_dorata', 'supervisor', 'funcionario_n1', 'funcionario_n2')
  )
);

DROP POLICY IF EXISTS "Enable write access for admins" ON public.stock_movements;
CREATE POLICY "Enable write access for admins"
ON public.stock_movements
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role IN ('adm_mestre', 'adm_dorata', 'supervisor', 'funcionario_n1', 'funcionario_n2')
  )
);

COMMIT;
