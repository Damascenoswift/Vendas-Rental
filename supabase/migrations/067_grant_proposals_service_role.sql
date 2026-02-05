BEGIN;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposals TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_items TO service_role;

COMMIT;
