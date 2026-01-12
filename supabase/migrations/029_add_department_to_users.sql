
-- 1. Create Department Enum
DO $$ BEGIN
    CREATE TYPE department_enum AS ENUM ('vendas', 'cadastro', 'energia', 'juridico', 'financeiro', 'ti', 'diretoria', 'outro');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Add department column to users table
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "department" department_enum;

-- 3. Set default department for existing users (optional, setting to 'outro' to be safe)
UPDATE "public"."users" SET "department" = 'outro' WHERE "department" IS NULL;
