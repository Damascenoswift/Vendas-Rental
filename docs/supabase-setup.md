# 🔧 Configuração Supabase – Sistema de Roles e Marcas

## 📋 Visão Geral

Este documento descreve como configurar o sistema de roles e marcas no Supabase para o projeto Rental V2.

## 🚀 Execução das Migrações

### Opção 1: Script Automático (Recomendado)
```bash
# Executar todas as migrações de uma vez
./scripts/run-migrations.sh
```

### Opção 2: Execução Manual
```bash
# 1. Fazer login no Supabase (se necessário)
supabase login

# 2. Executar cada migração individualmente
supabase db query < supabase/migrations/001_add_marca_column.sql
supabase db query < supabase/migrations/002_update_existing_records.sql  
supabase db query < supabase/migrations/003_rls_policies_marca.sql
```

## 🏗️ O que as Migrações Fazem

### 1. **001_add_marca_column.sql**
- ✅ Adiciona coluna `marca` na tabela `indicacoes`
- ✅ Constraint: apenas valores 'rental' ou 'dorata'
- ✅ Valor padrão: 'rental'
- ✅ Índices para performance
- ✅ Comentários de documentação

### 2. **002_update_existing_records.sql**
- ✅ Atualiza registros existentes sem marca para 'rental'
- ✅ Queries de verificação incluídas

### 3. **003_rls_policies_marca.sql**
- ✅ Remove policies conflitantes
- ✅ Policy de leitura baseada em marca autorizada
- ✅ Policy de inserção com validação de marca
- ✅ Policy de atualização com dupla validação
- ✅ Policy de deleção com controle de marca
- ✅ Habilita Row Level Security

## 👤 Configuração de Usuários

### Estrutura do user_metadata
```json
{
  "role": "vendedor_interno",
  "company_name": "Empresa X", 
  "allowed_brands": ["rental"]
}
```

### Exemplos de Configuração
```bash
# Usuário apenas Rental
supabase auth update USER_ID \
  --user-metadata '{"role": "vendedor_interno", "company_name": "Rental Corp", "allowed_brands": ["rental"]}'

# Usuário apenas Dorata  
supabase auth update USER_ID \
  --user-metadata '{"role": "vendedor_externo", "company_name": "Dorata Imóveis", "allowed_brands": ["dorata"]}'

# Usuário multi-marca (supervisor/admin)
supabase auth update USER_ID \
  --user-metadata '{"role": "supervisor", "company_name": "Grupo Empresarial", "allowed_brands": ["rental", "dorata"]}'
```

## 🔒 Como Funcionam as Policies RLS

### Lógica de Autorização
1. **Usuário deve ser o dono** da indicação (`auth.uid() = user_id`)
2. **Marca deve estar autorizada** no `user_metadata.allowed_brands`
3. **Fallback padrão**: se não houver `allowed_brands`, assume apenas `["rental"]`

### Exemplos de Comportamento
- ✅ Usuário com `["rental"]` vê apenas indicações marca 'rental'
- ✅ Usuário com `["dorata"]` vê apenas indicações marca 'dorata'  
- ✅ Usuário com `["rental", "dorata"]` vê indicações de ambas
- ❌ Usuário não consegue inserir indicação de marca não autorizada

## 🧪 Testando a Configuração

### 1. Verificar Estrutura da Tabela
```sql
SELECT column_name, data_type, column_default, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'indicacoes' AND column_name = 'marca';
```

### 2. Verificar Policies Ativas
```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'indicacoes';
```

### 3. Testar Inserção
```sql
-- Deve funcionar para marca autorizada
INSERT INTO indicacoes (tipo, nome, email, telefone, marca, user_id)
VALUES ('PF', 'Teste', 'teste@email.com', '11999999999', 'rental', auth.uid());

-- Deve falhar para marca não autorizada
INSERT INTO indicacoes (tipo, nome, email, telefone, marca, user_id)  
VALUES ('PF', 'Teste', 'teste@email.com', '11999999999', 'dorata', auth.uid());
```

## 📊 Monitoramento

### Queries Úteis para Análise
```sql
-- Distribuição por marca
SELECT marca, COUNT(*) as total 
FROM indicacoes 
GROUP BY marca;

-- Indicações por usuário e marca
SELECT u.nome, u.email, i.marca, COUNT(*) as total
FROM indicacoes i
JOIN users u ON i.user_id = u.id
GROUP BY u.nome, u.email, i.marca
ORDER BY total DESC;

-- Verificar usuários sem allowed_brands configurado
SELECT id, email, raw_user_meta_data
FROM auth.users 
WHERE raw_user_meta_data->>'allowed_brands' IS NULL;
```

## 🔧 Troubleshooting

### Problemas Comuns

1. **"permission denied for table indicacoes"**
   - Verificar se RLS está habilitado
   - Verificar se policies estão ativas
   - Verificar user_metadata do usuário

2. **Usuário não vê indicações**
   - Verificar `allowed_brands` no user_metadata
   - Verificar se é dono das indicações
   - Verificar se a marca da indicação está autorizada

3. **Não consegue inserir indicação**
   - Verificar se a marca está em `allowed_brands`
   - Verificar se `user_id` é o próprio usuário
   - Verificar constraint da coluna marca

### Comandos de Debug
```bash
# Ver logs em tempo real
supabase logs --project-ref YOUR_PROJECT_REF

# Verificar configuração do projeto
supabase status

# Resetar policies (cuidado!)
supabase db reset
```

## 🎯 Próximos Passos

Após executar as migrações:

1. ✅ Atualizar user_metadata de todos os usuários
2. ✅ Testar login e visualização no dashboard  
3. ✅ Implementar seletor de marca no frontend
4. ✅ Adicionar filtros por marca nas listagens
5. ✅ Implementar relatórios por marca
6. ✅ Configurar webhooks por marca (Zapier)

---

**⚠️ Importante**: Sempre teste em ambiente de desenvolvimento antes de aplicar em produção!
