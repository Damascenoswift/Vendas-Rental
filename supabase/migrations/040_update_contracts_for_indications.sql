-- Link contracts to indicacoes
ALTER TABLE public.contracts 
ADD COLUMN indicacao_id UUID REFERENCES public.indicacoes(id) ON DELETE CASCADE;

-- Remove editor fields
ALTER TABLE public.contracts 
DROP COLUMN html_content;

-- Add RLS to allow Admins and Employees to manage contracts
-- (Assuming policies in 039 allowed authenticated, we can refine here if needed, but 'authenticated' is a good baseline for internal tools)
