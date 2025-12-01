-- ==============================================================================
-- FIX: RENAME COLUMN
-- Description: 
-- The database has 'salesperson_id' but the application expects 'user_id'.
-- This script renames the column to match the code.
-- ==============================================================================

DO $$
BEGIN
    -- Check if 'salesperson_id' exists and 'user_id' does NOT exist
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'indicacoes' AND column_name = 'salesperson_id') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'indicacoes' AND column_name = 'user_id') THEN
        
        ALTER TABLE public.indicacoes RENAME COLUMN salesperson_id TO user_id;
        
    -- If 'user_id' doesn't exist and 'salesperson_id' also doesn't exist, create 'user_id'
    ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'indicacoes' AND column_name = 'user_id') THEN
        
        ALTER TABLE public.indicacoes ADD COLUMN user_id UUID REFERENCES auth.users(id);
        
    END IF;
END $$;

-- Verify the change
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'indicacoes' 
AND column_name IN ('user_id', 'salesperson_id');
