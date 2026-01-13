
-- Safely create enums
DO $$ BEGIN
    CREATE TYPE product_type_enum AS ENUM ('module', 'inverter', 'structure', 'cable', 'transformer', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE proposal_status_enum AS ENUM ('draft', 'sent', 'accepted', 'rejected', 'expired');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create products table
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type product_type_enum NOT NULL,
    category TEXT,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0,
    cost NUMERIC(10, 2),
    manufacturer TEXT,
    model TEXT,
    specs JSONB DEFAULT '{}'::jsonb,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create proposals table
CREATE TABLE IF NOT EXISTS proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES indicacoes(id),
    seller_id UUID REFERENCES users(id),
    status proposal_status_enum DEFAULT 'draft',
    total_value NUMERIC(10, 2) DEFAULT 0,
    valid_until DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create proposal_items table
CREATE TABLE IF NOT EXISTS proposal_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID REFERENCES proposals(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(10, 2) NOT NULL,
    total_price NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS Policies
-- We drop existing policies to ensure clean recreation (idempotency)

-- Products
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON products;
CREATE POLICY "Enable read access for authenticated users" ON products
    FOR SELECT
    USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable write access for admins" ON products;
CREATE POLICY "Enable write access for admins" ON products
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('adm_mestre', 'adm_dorata')
        )
    );

-- Proposals
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own proposals or if admin" ON proposals;
CREATE POLICY "Users can view their own proposals or if admin" ON proposals
    FOR SELECT
    USING (
        seller_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('adm_mestre', 'adm_dorata', 'supervisor')
        )
    );

DROP POLICY IF EXISTS "Users can insert their own proposals" ON proposals;
CREATE POLICY "Users can insert their own proposals" ON proposals
    FOR INSERT
    WITH CHECK (
        seller_id = auth.uid()
    );

DROP POLICY IF EXISTS "Users can update their own proposals" ON proposals;
CREATE POLICY "Users can update their own proposals" ON proposals
    FOR UPDATE
    USING (
        seller_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('adm_mestre', 'adm_dorata')
        )
    );

-- Proposal Items
ALTER TABLE proposal_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Access items based on proposal access" ON proposal_items;
CREATE POLICY "Access items based on proposal access" ON proposal_items
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM proposals
            WHERE proposals.id = proposal_items.proposal_id
            AND (
                proposals.seller_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM users
                    WHERE users.id = auth.uid()
                    AND users.role IN ('adm_mestre', 'adm_dorata', 'supervisor')
                )
            )
        )
    );
