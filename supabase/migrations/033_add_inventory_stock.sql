-- Add stock tracking columns to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS power NUMERIC(10, 2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS technology TEXT; 
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_total INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_reserved INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_withdrawn INTEGER DEFAULT 0;

-- Create stock_movement_type enum
DO $$ BEGIN
    CREATE TYPE stock_movement_type AS ENUM ('IN', 'OUT', 'RESERVE', 'RELEASE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create stock_movements table
CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id),
    type stock_movement_type NOT NULL,
    quantity INTEGER NOT NULL,
    reference_id UUID, -- Can link to proposal or generic ID
    entity_name TEXT, -- Supplier or Client name
    date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS for stock_movements
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON stock_movements;
CREATE POLICY "Enable read access for authenticated users" ON stock_movements
    FOR SELECT
    USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable write access for admins" ON stock_movements;
CREATE POLICY "Enable write access for admins" ON stock_movements
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('adm_mestre', 'adm_dorata')
        )
    );
