
-- Create consumer_units table for Excel Import
CREATE TABLE IF NOT EXISTS consumer_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id TEXT, -- ID from Excel
    status TEXT DEFAULT 'Ativo',
    active_from DATE,
    active_to DATE,
    is_active_infinite BOOLEAN DEFAULT false,
    
    code TEXT, -- Unidade / Instalação
    unit_name TEXT,
    company_name TEXT,
    client_number TEXT,
    
    type TEXT, -- Consumidor/Gerador
    is_generator BOOLEAN DEFAULT false,
    
    uf TEXT,
    distributor TEXT,
    modality TEXT,
    emission_day INTEGER,
    
    faturamento_cnpj TEXT,
    address TEXT,
    number TEXT,
    complement TEXT,
    city TEXT,
    neighborhood TEXT,
    zip_code TEXT,
    
    faturamento_emails TEXT[], -- Array of emails
    
    sales_type TEXT,
    phone TEXT,
    power_generator NUMERIC(15, 5), -- Allow precision
    connection_type TEXT,
    is_rural BOOLEAN DEFAULT false,
    association_type TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS
ALTER TABLE consumer_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON consumer_units;
CREATE POLICY "Enable read access for authenticated users" ON consumer_units
    FOR SELECT
    USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable write access for admins" ON consumer_units;
CREATE POLICY "Enable write access for admins" ON consumer_units
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('adm_mestre', 'adm_dorata')
        )
    );
