-- Update admin name manually
UPDATE public.users
SET name = 'Guilherme Damasceno'
WHERE role = 'adm_mestre' AND name = 'Novo Usuário';
