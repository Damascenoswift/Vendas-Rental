# 🚀 Instruções de Setup - Rental V2 Clean

## 📋 Resumo do que foi Implementado

✅ **Sistema de Roles e Marcas Configurado**
- Coluna `marca` adicionada à tabela `indicacoes`
- Policies RLS baseadas em marca autorizada
- Schemas Zod atualizados com validação de marca
- Tipos TypeScript sincronizados

✅ **Estrutura de Integrações Criada**
- Base para Clicksign e Zapier
- Configurações centralizadas
- Pronto para implementação das 2 APIs

## 🔧 Como Executar as Migrações

### Opção 1: Script Automático (Recomendado)
```bash
# Dar permissão de execução (já feito)
chmod +x scripts/run-migrations.sh

# Executar todas as migrações
./scripts/run-migrations.sh
```

### Opção 2: Comando por Comando
```bash
# 1. Login no Supabase (se necessário)
supabase login

# 2. Executar migrações na sequência
supabase db query < supabase/migrations/001_add_marca_column.sql
supabase db query < supabase/migrations/002_update_existing_records.sql
supabase db query < supabase/migrations/003_rls_policies_marca.sql
```

## 👤 Configurar Usuários

Após executar as migrações, configure o `user_metadata` dos usuários:

```bash
# Usuário apenas Rental
supabase auth update USER_ID \
  --user-metadata '{"role": "vendedor_interno", "company_name": "Rental Corp", "allowed_brands": ["rental"]}'

# Usuário apenas Dorata
supabase auth update USER_ID \
  --user-metadata '{"role": "vendedor_externo", "company_name": "Dorata Imóveis", "allowed_brands": ["dorata"]}'

# Usuário multi-marca (admin/supervisor)
supabase auth update USER_ID \
  --user-metadata '{"role": "supervisor", "company_name": "Grupo", "allowed_brands": ["rental", "dorata"]}'
```

## 🧪 Testar a Configuração

### 1. Verificar se a coluna foi criada
```sql
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'indicacoes' AND column_name = 'marca';
```

### 2. Verificar policies ativas
```sql
SELECT policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'indicacoes';
```

### 3. Testar inserção (deve funcionar)
```sql
INSERT INTO indicacoes (tipo, nome, email, telefone, marca, user_id)
VALUES ('PF', 'Teste', 'teste@email.com', '11999999999', 'rental', auth.uid());
```

## 📂 Arquivos Criados/Modificados

### ✅ Migrações SQL
- `supabase/migrations/001_add_marca_column.sql`
- `supabase/migrations/002_update_existing_records.sql` 
- `supabase/migrations/003_rls_policies_marca.sql`

### ✅ Scripts
- `scripts/run-migrations.sh` (executável)

### ✅ Documentação
- `docs/supabase-setup.md` (guia completo)
- `SETUP-INSTRUCTIONS.md` (este arquivo)

### ✅ Código Atualizado
- `src/types/database.ts` (coluna marca adicionada)
- `src/lib/validations/indicacao.ts` (schema com marca)
- `src/lib/integrations/index.ts` (estrutura APIs)
- `README.md` (documentação atualizada)

## 🔗 Próximos Passos - Integrações

### 1. **Clicksign (Assinatura Digital)**
```typescript
// Estrutura já criada em src/lib/integrations/
// Implementar: criação de documentos, envio para assinatura
```

### 2. **Zapier (Automações)**  
```typescript
// Webhook endpoints para disparar automações
// Integração com mudanças de status das indicações
```

## 📊 Pontos de Implementação das APIs

### **Semana 4: Integrações** (conforme roadmap)

1. **Formulário de Indicação** (`src/app/indicacoes/nova/page.tsx`)
   - Validar CPF/CNPJ via API externa

2. **Mudança de Status** (`src/app/indicacoes/[id]/page.tsx`)
   - Disparar webhook Zapier quando status muda
   - Criar documento Clicksign quando aprovada

3. **Dashboard** (`src/app/dashboard/page.tsx`)
   - Métricas por marca
   - Relatórios de conversão

## ⚠️ Importante

- ✅ Todas as migrações são **idempotentes** (podem ser executadas várias vezes)
- ✅ Backup automático do Supabase protege os dados
- ✅ Policies RLS garantem segurança por marca
- ✅ Valores padrão evitam quebras no sistema

## 🆘 Troubleshooting

Se algo der errado:

1. **Ver logs**: `supabase logs --project-ref YOUR_REF`
2. **Verificar status**: `supabase status`  
3. **Resetar (cuidado!)**: `supabase db reset`

---

**🎯 Tudo pronto para executar! As migrações vão implementar o sistema de marcas completo.**
