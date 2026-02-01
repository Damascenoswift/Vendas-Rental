-- Migration 052: Energy Manager - UC allocations and credit transfers
-- Description: Adds UC table, recurring allocations per UC, and credit transfer tracking.

BEGIN;

-- 1) Extend usinas with energy-specific configuration
ALTER TABLE public.usinas
    ADD COLUMN IF NOT EXISTS categoria_energia TEXT NOT NULL DEFAULT 'geradora'
        CHECK (categoria_energia IN ('geradora', 'acumuladora')),
    ADD COLUMN IF NOT EXISTS percentual_alocavel NUMERIC NOT NULL DEFAULT 90
        CHECK (percentual_alocavel > 0 AND percentual_alocavel <= 100),
    ADD COLUMN IF NOT EXISTS prazo_expiracao_credito_meses INTEGER NOT NULL DEFAULT 60
        CHECK (prazo_expiracao_credito_meses > 0);

-- 2) Unidades consumidoras (UC) por cliente
CREATE TABLE IF NOT EXISTS public.energia_ucs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    cliente_id UUID REFERENCES public.indicacoes(id) ON DELETE SET NULL,
    codigo_uc_fatura TEXT NOT NULL,
    tipo_uc TEXT NOT NULL DEFAULT 'normal' CHECK (tipo_uc IN ('normal', 'b_optante')),
    atendido_via_consorcio BOOLEAN NOT NULL DEFAULT false,
    transferida_para_consorcio BOOLEAN NOT NULL DEFAULT false,
    ativo BOOLEAN NOT NULL DEFAULT true,
    observacoes TEXT
);

CREATE INDEX IF NOT EXISTS idx_energia_ucs_cliente ON public.energia_ucs(cliente_id);
CREATE INDEX IF NOT EXISTS idx_energia_ucs_codigo ON public.energia_ucs(codigo_uc_fatura);

DROP TRIGGER IF EXISTS update_energia_ucs_modtime ON public.energia_ucs;
CREATE TRIGGER update_energia_ucs_modtime
    BEFORE UPDATE ON public.energia_ucs
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Alocacoes recorrentes por UC (percentual fixo)
CREATE TABLE IF NOT EXISTS public.energia_alocacoes_ucs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    usina_id UUID REFERENCES public.usinas(id) ON DELETE CASCADE NOT NULL,
    uc_id UUID REFERENCES public.energia_ucs(id) ON DELETE CASCADE NOT NULL,
    percentual_alocado NUMERIC,
    quantidade_kwh_alocado NUMERIC,
    data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
    data_fim DATE,
    status TEXT NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'INATIVO'))
);

CREATE INDEX IF NOT EXISTS idx_energia_alocacoes_usina ON public.energia_alocacoes_ucs(usina_id);
CREATE INDEX IF NOT EXISTS idx_energia_alocacoes_uc ON public.energia_alocacoes_ucs(uc_id);

DROP TRIGGER IF EXISTS update_energia_alocacoes_modtime ON public.energia_alocacoes_ucs;
CREATE TRIGGER update_energia_alocacoes_modtime
    BEFORE UPDATE ON public.energia_alocacoes_ucs
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Transferencias pontuais de credito acumulado
CREATE TABLE IF NOT EXISTS public.energia_credito_transferencias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    usina_id UUID REFERENCES public.usinas(id) ON DELETE CASCADE NOT NULL,
    uc_id UUID REFERENCES public.energia_ucs(id) ON DELETE CASCADE NOT NULL,
    kwh_enviado NUMERIC NOT NULL,
    data_envio DATE NOT NULL DEFAULT CURRENT_DATE,
    expires_at DATE,
    observacoes TEXT
);

CREATE INDEX IF NOT EXISTS idx_energia_credito_transferencias_usina ON public.energia_credito_transferencias(usina_id);
CREATE INDEX IF NOT EXISTS idx_energia_credito_transferencias_uc ON public.energia_credito_transferencias(uc_id);

DROP TRIGGER IF EXISTS update_energia_credito_transferencias_modtime ON public.energia_credito_transferencias;
CREATE TRIGGER update_energia_credito_transferencias_modtime
    BEFORE UPDATE ON public.energia_credito_transferencias
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-calc expiry based on usina configuration (default 60 months)
CREATE OR REPLACE FUNCTION public.set_credito_transferencia_expires_at()
RETURNS trigger AS $$
DECLARE
    meses INTEGER;
BEGIN
    IF NEW.expires_at IS NULL THEN
        SELECT prazo_expiracao_credito_meses
        INTO meses
        FROM public.usinas
        WHERE id = NEW.usina_id;

        IF meses IS NULL THEN
            meses := 60;
        END IF;

        NEW.expires_at := (NEW.data_envio + (meses || ' months')::interval)::date;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_credito_transferencia_expires_at ON public.energia_credito_transferencias;
CREATE TRIGGER set_credito_transferencia_expires_at
    BEFORE INSERT ON public.energia_credito_transferencias
    FOR EACH ROW
    EXECUTE FUNCTION public.set_credito_transferencia_expires_at();

-- 5) Consumo mensal do credito enviado
CREATE TABLE IF NOT EXISTS public.energia_credito_consumos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    transferencia_id UUID REFERENCES public.energia_credito_transferencias(id) ON DELETE CASCADE NOT NULL,
    competencia DATE NOT NULL,
    kwh_consumido NUMERIC NOT NULL DEFAULT 0,
    UNIQUE (transferencia_id, competencia)
);

CREATE INDEX IF NOT EXISTS idx_energia_credito_consumos_transferencia ON public.energia_credito_consumos(transferencia_id);
CREATE INDEX IF NOT EXISTS idx_energia_credito_consumos_competencia ON public.energia_credito_consumos(competencia);

-- 6) RLS
ALTER TABLE public.energia_ucs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.energia_alocacoes_ucs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.energia_credito_transferencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.energia_credito_consumos ENABLE ROW LEVEL SECURITY;

-- Admin/Support Full Access
DROP POLICY IF EXISTS "Admin/Support Full Access" ON public.energia_ucs;
CREATE POLICY "Admin/Support Full Access"
ON public.energia_ucs
FOR ALL
USING (
    auth.uid() IN (
        SELECT id FROM public.users
        WHERE role IN ('adm_mestre', 'adm_dorata', 'suporte_tecnico', 'suporte_limitado', 'supervisor')
    )
)
WITH CHECK (
    auth.uid() IN (
        SELECT id FROM public.users
        WHERE role IN ('adm_mestre', 'adm_dorata', 'suporte_tecnico', 'suporte_limitado', 'supervisor')
    )
);

DROP POLICY IF EXISTS "Admin/Support Full Access" ON public.energia_alocacoes_ucs;
CREATE POLICY "Admin/Support Full Access"
ON public.energia_alocacoes_ucs
FOR ALL
USING (
    auth.uid() IN (
        SELECT id FROM public.users
        WHERE role IN ('adm_mestre', 'adm_dorata', 'suporte_tecnico', 'suporte_limitado', 'supervisor')
    )
)
WITH CHECK (
    auth.uid() IN (
        SELECT id FROM public.users
        WHERE role IN ('adm_mestre', 'adm_dorata', 'suporte_tecnico', 'suporte_limitado', 'supervisor')
    )
);

DROP POLICY IF EXISTS "Admin/Support Full Access" ON public.energia_credito_transferencias;
CREATE POLICY "Admin/Support Full Access"
ON public.energia_credito_transferencias
FOR ALL
USING (
    auth.uid() IN (
        SELECT id FROM public.users
        WHERE role IN ('adm_mestre', 'adm_dorata', 'suporte_tecnico', 'suporte_limitado', 'supervisor')
    )
)
WITH CHECK (
    auth.uid() IN (
        SELECT id FROM public.users
        WHERE role IN ('adm_mestre', 'adm_dorata', 'suporte_tecnico', 'suporte_limitado', 'supervisor')
    )
);

DROP POLICY IF EXISTS "Admin/Support Full Access" ON public.energia_credito_consumos;
CREATE POLICY "Admin/Support Full Access"
ON public.energia_credito_consumos
FOR ALL
USING (
    auth.uid() IN (
        SELECT id FROM public.users
        WHERE role IN ('adm_mestre', 'adm_dorata', 'suporte_tecnico', 'suporte_limitado', 'supervisor')
    )
)
WITH CHECK (
    auth.uid() IN (
        SELECT id FROM public.users
        WHERE role IN ('adm_mestre', 'adm_dorata', 'suporte_tecnico', 'suporte_limitado', 'supervisor')
    )
);

-- 7) Grants
GRANT ALL ON TABLE public.energia_ucs TO authenticated;
GRANT ALL ON TABLE public.energia_alocacoes_ucs TO authenticated;
GRANT ALL ON TABLE public.energia_credito_transferencias TO authenticated;
GRANT ALL ON TABLE public.energia_credito_consumos TO authenticated;

COMMIT;
