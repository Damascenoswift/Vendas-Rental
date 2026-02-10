BEGIN;

ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;

-- Table privileges are required in addition to RLS policies.
GRANT SELECT, INSERT, UPDATE ON TABLE public.pricing_rules TO authenticated;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.pricing_rules;
DROP POLICY IF EXISTS "Enable write access for admins" ON public.pricing_rules;
DROP POLICY IF EXISTS "Pricing rules read authenticated" ON public.pricing_rules;
DROP POLICY IF EXISTS "Pricing rules insert financial managers" ON public.pricing_rules;
DROP POLICY IF EXISTS "Pricing rules update financial managers" ON public.pricing_rules;

CREATE POLICY "Pricing rules read authenticated"
ON public.pricing_rules
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Pricing rules insert financial managers"
ON public.pricing_rules
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = auth.uid()
          AND u.role IN ('adm_mestre', 'adm_dorata', 'funcionario_n1', 'funcionario_n2')
    )
);

CREATE POLICY "Pricing rules update financial managers"
ON public.pricing_rules
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = auth.uid()
          AND u.role IN ('adm_mestre', 'adm_dorata', 'funcionario_n1', 'funcionario_n2')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = auth.uid()
          AND u.role IN ('adm_mestre', 'adm_dorata', 'funcionario_n1', 'funcionario_n2')
    )
);

COMMIT;

