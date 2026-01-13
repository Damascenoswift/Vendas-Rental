
-- Create enums
CREATE TYPE product_type_enum AS ENUM ('module', 'inverter', 'structure', 'cable', 'transformer', 'other');
CREATE TYPE proposal_status_enum AS ENUM ('draft', 'sent', 'accepted', 'rejected', 'expired');

-- Create products table
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type product_type_enum NOT NULL,
    category TEXT, -- Optional secondary grouping
    price NUMERIC(10, 2) NOT NULL DEFAULT 0,
    cost NUMERIC(10, 2), -- Internal cost for margin calculation
    manufacturer TEXT,
    model TEXT,
    specs JSONB DEFAULT '{}'::jsonb, -- Store wattage, dimensions, efficiency etc
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create proposals table
CREATE TABLE proposals (
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
CREATE TABLE proposal_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID REFERENCES proposals(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(10, 2) NOT NULL, -- Snapshot of price at time of proposal
    total_price NUMERIC(10, 2) NOT NULL, -- quantity * unit_price
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS Policies

-- Products:
-- Admins and employees can view (read)
-- Only admins can modify (insert, update, delete)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for authenticated users" ON products
    FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Enable write access for admins" ON products
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('adm_mestre', 'adm_dorata')
        )
    );

-- Proposals:
-- Users can view/edit their own proposals OR if they are admins/managers
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY "Users can insert their own proposals" ON proposals
    FOR INSERT
    WITH CHECK (
        seller_id = auth.uid()
    );

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

-- Proposal Items:
-- Inherit access from proposal
ALTER TABLE proposal_items ENABLE ROW LEVEL SECURITY;

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
