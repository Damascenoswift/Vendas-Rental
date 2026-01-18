-- Create contracts table
CREATE TABLE IF NOT EXISTS public.contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (type IN ('RENTAL_PF', 'RENTAL_PJ', 'DORATA_PF', 'DORATA_PJ')),
    brand TEXT NOT NULL CHECK (brand IN ('RENTAL', 'DORATA')),
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'APPROVED', 'EXPIRED')),
    
    -- Client and Calculation Data stored as JSONB for flexibility and snapshotting
    client_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    calculation_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Document content
    html_content TEXT, -- The draft content for the editor
    docx_url TEXT, -- Path to the final generated file in storage
    
    version INTEGER NOT NULL DEFAULT 1,
    
    -- Metadata
    created_by UUID REFERENCES auth.users(id),
    approved_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create contract_units table (1 contract -> N units)
CREATE TABLE IF NOT EXISTS public.contract_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    unit_name TEXT NOT NULL,
    consumption_avg NUMERIC,
    consumptions JSONB -- Array of monthly values
);

-- RLS Policies
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_units ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone (authenticated) can view contracts (or restrict to sellers/admins if needed, but per requirements sellers edit draft)
CREATE POLICY "Enable read access for authenticated users" ON public.contracts
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users" ON public.contracts
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users" ON public.contracts
    FOR UPDATE USING (auth.role() = 'authenticated');

-- Same for units
CREATE POLICY "Enable read access for authenticated users" ON public.contract_units
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users" ON public.contract_units
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users" ON public.contract_units
    FOR UPDATE USING (auth.role() = 'authenticated');
