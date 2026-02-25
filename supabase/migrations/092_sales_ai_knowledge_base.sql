BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'knowledge_contract_type_enum'
          AND typnamespace = 'public'::regnamespace
    ) THEN
        CREATE TYPE public.knowledge_contract_type_enum AS ENUM (
            'GERAL',
            'RENTAL_PF',
            'RENTAL_PJ',
            'DORATA_PF',
            'DORATA_PJ'
        );
    END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.has_sales_access()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = auth.uid()
          AND u.sales_access = true
    );
$$;

GRANT EXECUTE ON FUNCTION public.has_sales_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_sales_access() TO service_role;

CREATE OR REPLACE FUNCTION public.can_read_sales_knowledge(
    p_allowed_roles public.user_role_enum[] DEFAULT '{}'::public.user_role_enum[],
    p_allowed_brands public.brand_enum[] DEFAULT '{}'::public.brand_enum[]
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = auth.uid()
          AND u.sales_access = true
          AND (
              COALESCE(array_length(p_allowed_roles, 1), 0) = 0
              OR u.role = ANY (p_allowed_roles)
          )
          AND (
              COALESCE(array_length(p_allowed_brands, 1), 0) = 0
              OR COALESCE(u.allowed_brands, '{}'::public.brand_enum[]) && p_allowed_brands
          )
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_read_sales_knowledge(public.user_role_enum[], public.brand_enum[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_sales_knowledge(public.user_role_enum[], public.brand_enum[]) TO service_role;

CREATE TABLE IF NOT EXISTS public.knowledge_tutorials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    summary TEXT,
    module TEXT NOT NULL DEFAULT 'geral',
    video_url TEXT NOT NULL,
    tags TEXT[] NOT NULL DEFAULT '{}'::text[],
    allowed_roles public.user_role_enum[] NOT NULL DEFAULT '{}'::public.user_role_enum[],
    allowed_brands public.brand_enum[] NOT NULL DEFAULT '{}'::public.brand_enum[],
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT knowledge_tutorials_title_not_empty CHECK (length(btrim(title)) > 0),
    CONSTRAINT knowledge_tutorials_module_not_empty CHECK (length(btrim(module)) > 0),
    CONSTRAINT knowledge_tutorials_video_url_check CHECK (video_url ~* '^https?://')
);

CREATE TABLE IF NOT EXISTS public.knowledge_faq (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module TEXT NOT NULL DEFAULT 'geral',
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    keywords TEXT[] NOT NULL DEFAULT '{}'::text[],
    related_tutorial_id UUID REFERENCES public.knowledge_tutorials(id) ON DELETE SET NULL,
    contract_types public.knowledge_contract_type_enum[] NOT NULL DEFAULT '{}'::public.knowledge_contract_type_enum[],
    allowed_roles public.user_role_enum[] NOT NULL DEFAULT '{}'::public.user_role_enum[],
    allowed_brands public.brand_enum[] NOT NULL DEFAULT '{}'::public.brand_enum[],
    priority INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT knowledge_faq_question_not_empty CHECK (length(btrim(question)) > 0),
    CONSTRAINT knowledge_faq_answer_not_empty CHECK (length(btrim(answer)) > 0),
    CONSTRAINT knowledge_faq_module_not_empty CHECK (length(btrim(module)) > 0)
);

CREATE TABLE IF NOT EXISTS public.knowledge_contract_clauses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_type public.knowledge_contract_type_enum NOT NULL DEFAULT 'GERAL',
    clause_code TEXT NOT NULL,
    clause_title TEXT NOT NULL,
    clause_text TEXT NOT NULL,
    plain_explanation TEXT,
    risks TEXT,
    keywords TEXT[] NOT NULL DEFAULT '{}'::text[],
    allowed_roles public.user_role_enum[] NOT NULL DEFAULT '{}'::public.user_role_enum[],
    allowed_brands public.brand_enum[] NOT NULL DEFAULT '{}'::public.brand_enum[],
    version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT knowledge_contract_clauses_code_not_empty CHECK (length(btrim(clause_code)) > 0),
    CONSTRAINT knowledge_contract_clauses_title_not_empty CHECK (length(btrim(clause_title)) > 0),
    CONSTRAINT knowledge_contract_clauses_text_not_empty CHECK (length(btrim(clause_text)) > 0),
    CONSTRAINT knowledge_contract_clauses_version_check CHECK (version > 0),
    CONSTRAINT knowledge_contract_clauses_unique_version UNIQUE (contract_type, clause_code, version)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_tutorials_active_module_sort
    ON public.knowledge_tutorials (is_active, module, sort_order, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_tutorials_tags_gin
    ON public.knowledge_tutorials
    USING gin (tags);

CREATE INDEX IF NOT EXISTS idx_knowledge_faq_active_module_priority
    ON public.knowledge_faq (is_active, module, priority DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_faq_keywords_gin
    ON public.knowledge_faq
    USING gin (keywords);

CREATE INDEX IF NOT EXISTS idx_knowledge_contract_clauses_active_contract
    ON public.knowledge_contract_clauses (is_active, contract_type, clause_code, version DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_contract_clauses_keywords_gin
    ON public.knowledge_contract_clauses
    USING gin (keywords);

DROP TRIGGER IF EXISTS update_knowledge_tutorials_modtime ON public.knowledge_tutorials;
CREATE TRIGGER update_knowledge_tutorials_modtime
    BEFORE UPDATE ON public.knowledge_tutorials
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_knowledge_faq_modtime ON public.knowledge_faq;
CREATE TRIGGER update_knowledge_faq_modtime
    BEFORE UPDATE ON public.knowledge_faq
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_knowledge_contract_clauses_modtime ON public.knowledge_contract_clauses;
CREATE TRIGGER update_knowledge_contract_clauses_modtime
    BEFORE UPDATE ON public.knowledge_contract_clauses
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.knowledge_tutorials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_faq ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_contract_clauses ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.knowledge_tutorials TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.knowledge_faq TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.knowledge_contract_clauses TO authenticated;

GRANT ALL ON TABLE public.knowledge_tutorials TO service_role;
GRANT ALL ON TABLE public.knowledge_faq TO service_role;
GRANT ALL ON TABLE public.knowledge_contract_clauses TO service_role;

DROP POLICY IF EXISTS "Sales knowledge read tutorials" ON public.knowledge_tutorials;
CREATE POLICY "Sales knowledge read tutorials"
ON public.knowledge_tutorials
FOR SELECT
TO authenticated
USING (
    is_active = true
    AND public.can_read_sales_knowledge(allowed_roles, allowed_brands)
);

DROP POLICY IF EXISTS "Sales knowledge read faq" ON public.knowledge_faq;
CREATE POLICY "Sales knowledge read faq"
ON public.knowledge_faq
FOR SELECT
TO authenticated
USING (
    is_active = true
    AND public.can_read_sales_knowledge(allowed_roles, allowed_brands)
);

DROP POLICY IF EXISTS "Sales knowledge read contract clauses" ON public.knowledge_contract_clauses;
CREATE POLICY "Sales knowledge read contract clauses"
ON public.knowledge_contract_clauses
FOR SELECT
TO authenticated
USING (
    is_active = true
    AND public.can_read_sales_knowledge(allowed_roles, allowed_brands)
);

DROP POLICY IF EXISTS "Full access manage tutorials" ON public.knowledge_tutorials;
CREATE POLICY "Full access manage tutorials"
ON public.knowledge_tutorials
FOR ALL
TO authenticated
USING (public.has_full_access())
WITH CHECK (public.has_full_access());

DROP POLICY IF EXISTS "Full access manage faq" ON public.knowledge_faq;
CREATE POLICY "Full access manage faq"
ON public.knowledge_faq
FOR ALL
TO authenticated
USING (public.has_full_access())
WITH CHECK (public.has_full_access());

DROP POLICY IF EXISTS "Full access manage contract clauses" ON public.knowledge_contract_clauses;
CREATE POLICY "Full access manage contract clauses"
ON public.knowledge_contract_clauses
FOR ALL
TO authenticated
USING (public.has_full_access())
WITH CHECK (public.has_full_access());

NOTIFY pgrst, 'reload schema';

COMMIT;
