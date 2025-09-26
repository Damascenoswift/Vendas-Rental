# 🛠️ Executar Migrações Manualmente no Dashboard Supabase

## ⚠️ Por que Manual?
O Supabase CLI precisa de configuração adicional para executar DDL (ALTER TABLE). A forma mais segura é executar via dashboard.

## 📋 Passo a Passo Seguro

### **1. Abrir SQL Editor**
1. Vá para o dashboard do Supabase: https://supabase.com/dashboard
2. Selecione seu projeto: **Rental indicações**
3. No menu lateral, clique em **"SQL Editor"**
4. Clique em **"New Query"**

### **2. Executar Migração 1: Adicionar Coluna Marca**

Cole este SQL no editor e clique **"Run"**:

```sql
-- Migração: Adicionar coluna marca à tabela indicacoes
-- Data: 2025-01-23
-- Descrição: Implementa sistema de marcas (rental/dorata) para indicações

-- 1. Adicionar coluna marca com constraint e valor padrão
ALTER TABLE public.indicacoes
  ADD COLUMN IF NOT EXISTS marca text
    CHECK (marca IN ('rental', 'dorata'))
    DEFAULT 'rental';

-- 2. Comentário para documentação
COMMENT ON COLUMN public.indicacoes.marca IS 'Marca da indicação: rental ou dorata';

-- 3. Criar índice para melhor performance nas consultas por marca
CREATE INDEX IF NOT EXISTS idx_indicacoes_marca ON public.indicacoes(marca);

-- 4. Criar índice composto para consultas por usuário e marca
CREATE INDEX IF NOT EXISTS idx_indicacoes_user_marca ON public.indicacoes(user_id, marca);
```

**✅ Resultado esperado:** "Success. No rows returned"

### **3. Executar Migração 2: Atualizar Registros Existentes**

Nova query com este SQL:

```sql
-- Migração: Atualizar registros existentes sem marca
-- Data: 2025-01-23
-- Descrição: Define marca padrão para registros existentes

-- Atualizar registros existentes sem marca para 'rental'
UPDATE public.indicacoes
SET marca = 'rental'
WHERE marca IS NULL;
```

**✅ Resultado esperado:** "Success. X rows affected" (onde X = número de registros atualizados)

### **4. Executar Migração 3: Configurar Policies RLS**

Nova query com este SQL:

```sql
-- Migração: Policies RLS para sistema de marcas
-- Data: 2025-01-23
-- Descrição: Implementa Row Level Security baseado em usuário e marca autorizada

-- Remover policies existentes se houver conflito
DROP POLICY IF EXISTS "Indicacoes própria + marca" ON public.indicacoes;
DROP POLICY IF EXISTS "Inserir indicacao marca permitida" ON public.indicacoes;

-- Policy para leitura: usuário vê apenas as próprias indicações nas marcas autorizadas
CREATE POLICY "Indicacoes própria + marca"
  ON public.indicacoes
  FOR SELECT
  USING (
    auth.uid() = user_id
    AND marca = ANY (COALESCE(
      (auth.jwt()->'user_metadata'->>'allowed_brands')::text[],
      ARRAY['rental']::text[]
    ))
  );

-- Policy para inserção: usuário só cadastra indicações nas marcas autorizadas
CREATE POLICY "Inserir indicacao marca permitida"
  ON public.indicacoes
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND marca = ANY (COALESCE(
      (auth.jwt()->'user_metadata'->>'allowed_brands')::text[],
      ARRAY['rental']::text[]
    ))
  );

-- Policy para atualização: usuário só atualiza próprias indicações nas marcas autorizadas
CREATE POLICY "Atualizar indicacao marca permitida"
  ON public.indicacoes
  FOR UPDATE
  USING (
    auth.uid() = user_id
    AND marca = ANY (COALESCE(
      (auth.jwt()->'user_metadata'->>'allowed_brands')::text[],
      ARRAY['rental']::text[]
    ))
  )
  WITH CHECK (
    auth.uid() = user_id
    AND marca = ANY (COALESCE(
      (auth.jwt()->'user_metadata'->>'allowed_brands')::text[],
      ARRAY['rental']::text[]
    ))
  );

-- Policy para deleção: usuário só deleta próprias indicações nas marcas autorizadas
CREATE POLICY "Deletar indicacao marca permitida"
  ON public.indicacoes
  FOR DELETE
  USING (
    auth.uid() = user_id
    AND marca = ANY (COALESCE(
      (auth.jwt()->'user_metadata'->>'allowed_brands')::text[],
      ARRAY['rental']::text[]
    ))
  );

-- Garantir que RLS está habilitado
ALTER TABLE public.indicacoes ENABLE ROW LEVEL SECURITY;
```

**✅ Resultado esperado:** "Success. No rows returned"

## 🧪 **Verificar se Funcionou**

Depois de executar as 3 migrações, execute esta query para verificar:

```sql
-- Verificar estrutura da tabela
SELECT column_name, data_type, column_default, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'indicacoes' 
ORDER BY ordinal_position;
```

**✅ Deve mostrar a coluna `marca` com:**
- `data_type`: text
- `column_default`: 'rental'::text
- `is_nullable`: NO

## 🎯 **Após Executar as Migrações**

Execute este comando no terminal para testar:

```bash
node scripts/test-basic-connection.js
```

**✅ Deve mostrar:** "Tabela indicacoes acessível!" (sem erro de permission denied)

## 🆘 **Se Algo Der Errado**

1. **Erro "column already exists"** → Normal, significa que já foi executado
2. **Erro "permission denied"** → Verificar se está usando a conexão correta
3. **Erro de syntax** → Copiar exatamente como está acima

---

**🚀 Execute uma migração por vez e verifique se cada uma funciona antes de prosseguir!**
