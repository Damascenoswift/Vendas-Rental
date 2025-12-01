-- ==============================================================================
-- TEST: MANUAL INSERT
-- Description: 
-- Tries to insert a record directly into 'indicacoes' to see if the DB accepts it.
-- If this fails, the error message will tell us EXACTLY what is wrong (column, type, constraint).
-- ==============================================================================

DO $$
DECLARE
    test_user_id UUID;
BEGIN
    -- 1. Get a valid user ID from auth.users (so we don't break Foreign Key)
    SELECT id INTO test_user_id FROM auth.users LIMIT 1;

    IF test_user_id IS NULL THEN
        RAISE EXCEPTION 'No users found in auth.users. Cannot test insert.';
    END IF;

    RAISE NOTICE 'Testing insert with user_id: %', test_user_id;

    -- 2. Try to insert
    INSERT INTO public.indicacoes (
        tipo, 
        nome, 
        email, 
        telefone, 
        status, 
        marca, 
        user_id
    ) VALUES (
        'PF', 
        'Teste Manual SQL', 
        'teste@manual.com', 
        '11999999999', 
        'EM_ANALISE', 
        'rental', 
        test_user_id
    );
    
    RAISE NOTICE 'SUCCESS! Insert worked correctly.';

EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FAILURE! Insert failed. Error: %', SQLERRM;
    RAISE NOTICE 'Detail: %', SQLSTATE;
END $$;
