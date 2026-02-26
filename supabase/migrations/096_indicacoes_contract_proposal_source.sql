BEGIN;

ALTER TABLE public.indicacoes
    ADD COLUMN IF NOT EXISTS contract_proposal_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'indicacoes_contract_proposal_id_fkey'
          AND conrelid = 'public.indicacoes'::regclass
    ) THEN
        ALTER TABLE public.indicacoes
            ADD CONSTRAINT indicacoes_contract_proposal_id_fkey
            FOREIGN KEY (contract_proposal_id)
            REFERENCES public.proposals(id)
            ON DELETE SET NULL;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_indicacoes_contract_proposal_id
    ON public.indicacoes (contract_proposal_id);

UPDATE public.indicacoes AS i
SET contract_proposal_id = NULL
WHERE i.contract_proposal_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM public.proposals AS p
      WHERE p.id = i.contract_proposal_id
        AND p.client_id = i.id
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
