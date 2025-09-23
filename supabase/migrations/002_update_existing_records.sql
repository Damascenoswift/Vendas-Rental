-- Migração: Atualizar registros existentes sem marca
-- Data: 2025-01-23
-- Descrição: Define marca padrão para registros existentes

-- Atualizar registros existentes sem marca para 'rental'
UPDATE public.indicacoes
SET marca = 'rental'
WHERE marca IS NULL;

-- Verificar se a atualização foi bem-sucedida
-- Esta query não será executada, é apenas para referência
-- SELECT COUNT(*) as total_rental FROM public.indicacoes WHERE marca = 'rental';
-- SELECT COUNT(*) as total_dorata FROM public.indicacoes WHERE marca = 'dorata';
-- SELECT COUNT(*) as total_null FROM public.indicacoes WHERE marca IS NULL;
