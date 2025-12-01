-- ==============================================================================
-- CHECK COLUMNS
-- Description: 
-- Lists all columns in the 'indicacoes' table to verify schema against frontend queries.
-- ==============================================================================

SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'indicacoes'
ORDER BY ordinal_position;
