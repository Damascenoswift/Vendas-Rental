
-- Migration to grant "Full Access but Users" to 'funcionario_n1'

-- 1. INDICACOES (LEADS)
-- Allow viewing ALL leads
DROP POLICY IF EXISTS "Indicações visible to Admins/Mestres" ON indicacoes;
-- Recreate a broader policy or add a new one. Let's add specific one for N1 to keep it clean, or broaden the admin one.
-- Let's create a specific one for clarity: "Funcionario N1 sees all"
CREATE POLICY "Funcionario N1 sees all indicacoes" ON indicacoes
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'funcionario_n1'
        )
    );

-- Allow modifying leads
CREATE POLICY "Funcionario N1 can update leads" ON indicacoes
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'funcionario_n1'
        )
    );
  
CREATE POLICY "Funcionario N1 can insert leads" ON indicacoes
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'funcionario_n1'
        )
    );


-- 2. ENERGY MANAGER (Usinas, Alocacoes, Historico, Faturas)
-- We grant ALL access (Select, Insert, Update)

DO $$ 
DECLARE 
    tbl text; 
BEGIN 
    FOR tbl IN 
        SELECT unnest(ARRAY['usinas', 'alocacoes_clientes', 'historico_producao', 'faturas_conciliacao']) 
    LOOP 
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


-- 3. INVENTORY & PROPOSALS (Products, Proposals, Stock, Consumer Units, Pricing)
-- Grant ALL access

DO $$ 
DECLARE 
    tbl text; 
BEGIN 
    FOR tbl IN 
        SELECT unnest(ARRAY['products', 'proposals', 'proposal_items', 'stock_movements', 'consumer_units', 'pricing_rules', 'tasks']) 
    LOOP 
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
