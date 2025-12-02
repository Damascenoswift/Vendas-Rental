-- Update status check constraint to include new statuses
ALTER TABLE public.indicacoes
DROP CONSTRAINT IF EXISTS indicacoes_status_check;

ALTER TABLE public.indicacoes
ADD CONSTRAINT indicacoes_status_check 
CHECK (status IN ('EM_ANALISE', 'APROVADA', 'REJEITADA', 'CONCLUIDA', 'AGUARDANDO_ASSINATURA', 'FALTANDO_DOCUMENTACAO'));
