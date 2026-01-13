
-- Create pricing_rules table
CREATE TABLE IF NOT EXISTS pricing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    key TEXT NOT NULL UNIQUE, -- internal key for lookups e.g., 'labor_per_panel'
    value NUMERIC(10, 2) NOT NULL DEFAULT 0,
    unit TEXT, -- e.g., 'R$/panel', 'R$/watt', '%'
    description TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS for pricing_rules
ALTER TABLE pricing_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON pricing_rules;
CREATE POLICY "Enable read access for authenticated users" ON pricing_rules
    FOR SELECT
    USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable write access for admins" ON pricing_rules;
CREATE POLICY "Enable write access for admins" ON pricing_rules
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('adm_mestre', 'adm_dorata')
        )
    );

-- Add calculation columns to proposals
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS labor_cost NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS equipment_cost NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS additional_cost NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS profit_margin NUMERIC(10, 2) DEFAULT 0; -- Value or Percentage, maybe store value here
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS total_power NUMERIC(10, 2) DEFAULT 0; -- In Watts

-- Seed default rules if they don't exist
INSERT INTO pricing_rules (name, key, value, unit, description)
VALUES 
    ('Mão de Obra por Placa', 'labor_per_panel', 50.00, 'R$/placa', 'Custo de instalação por módulo'),
    ('Mão de Obra por Watt (Alternativo)', 'labor_per_watt', 0.15, 'R$/W', 'Custo de instalação por Watt-pico'),
    ('Margem Padrão', 'default_margin', 20.00, '%', 'Margem de lucro sugerida')
ON CONFLICT (key) DO NOTHING;
