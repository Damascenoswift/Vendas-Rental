
-- Migration: Force Unlock Permissions for 'funcionario_n1'
-- This migration ensures that 'funcionario_n1' has access to EVERYTHING except 'users' table.
-- It works by explicitly creating policies for all tables.

-- PART 1: ENSURE PRICING RULES TABLE EXISTS (Idempotent Fix)
CREATE TABLE IF NOT EXISTS pricing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    key TEXT NOT NULL UNIQUE,
    value NUMERIC(10, 2) NOT NULL DEFAULT 0,
    unit TEXT,
    description TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure RLS is enabled on it
ALTER TABLE pricing_rules ENABLE ROW LEVEL SECURITY;

-- PART 2: GRANT LEADS (INDICACOES) ACCESS
-- Drop previous attempts to avoid conflicts
DROP POLICY IF EXISTS "Funcionario N1 sees all indicacoes" ON indicacoes;
DROP POLICY IF EXISTS "Funcionario N1 can update leads" ON indicacoes;
DROP POLICY IF EXISTS "Funcionario N1 can insert leads" ON indicacoes;

-- Create comprehensive policies
CREATE POLICY "Funcionario N1 sees all indicacoes" ON indicacoes
    FOR SELECT
    USING (
        (auth.uid() = user_id) OR -- Own leads
        (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'funcionario_n1'))
    );

CREATE POLICY "Funcionario N1 can insert leads" ON indicacoes
    FOR INSERT
    WITH CHECK (
        (auth.uid() = user_id) OR
        (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'funcionario_n1'))
    );

CREATE POLICY "Funcionario N1 can update leads" ON indicacoes
    FOR UPDATE
    USING (
        (auth.uid() = user_id) OR
        (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'funcionario_n1'))
    );


-- PART 3: GRANT FULL ACCESS TO OTHER TABLES
-- Loop through all operational tables and grant FULL permissions
DO $$ 
DECLARE 
    tbl text; 
BEGIN 
    -- List of tables to unlock
    FOR tbl IN 
        SELECT unnest(ARRAY[
            'usinas', 
            'alocacoes_clientes', 
            'historico_producao', 
            'faturas_conciliacao', 
            'products', 
            'proposals', 
            'proposal_items', 
            'stock_movements', 
            'consumer_units', 
            'pricing_rules', 
            'tasks'
        ]) 
    LOOP 
        -- Drop if exists (clean slate)
        EXECUTE format('DROP POLICY IF EXISTS "Funcionario N1 full access" ON %I;', tbl);
        
        -- Create permissive policy
        EXECUTE format('
            CREATE POLICY "Funcionario N1 full access" ON %I
            FOR ALL
            USING (
                EXISTS (
                    SELECT 1 FROM users
                    WHERE users.id = auth.uid()
                    AND users.role = ''funcionario_n1''
                )
            );
        ', tbl); 
    END LOOP; 
END $$;
