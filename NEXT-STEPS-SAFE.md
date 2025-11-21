# 🛡️ Próximos Passos - Configuração Segura do Supabase

## ⚠️ Status Atual

**PARADO COM SEGURANÇA** - Não executei nenhuma migração para não danificar a aplicação.

## 🔑 O que Precisa Ser Feito ANTES de Continuar

### 1. **Configurar Credenciais Corretas**

Edite o arquivo `.env.local` e substitua `sua_chave_aqui` pela chave real:

```env
# Supabase Configuration  
NEXT_PUBLIC_SUPABASE_URL=https://zqilrsijdatoxesdryyt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxaWxyc2lqZGF0b3hlc2RyeXl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1MDAzOTMsImV4cCI6MjA3NjA3NjM5M30.4pVP51u1V2J_IKEm5w_xDaQyraWohb4hwWZ5x_ehDjo

# Supabase MCP Secret (for database operations via MCP)
SUPABASE_SECRET=sb_secret_-BBK0-mRSHBfeqbeTfceBg_gw_ooLRf

# Integrações graduais
ZAPIER_WEBHOOK_URL=sua_webhook_url

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 2. **Testar Conexão ANTES das Migrações**

```bash
# Testar se consegue conectar
node scripts/test-supabase-connection.js
```

**✅ SÓ CONTINUE se este comando mostrar "Conexão estabelecida com sucesso"**

### 3. **Executar Migrações com Segurança**

Depois de confirmar a conexão:

```bash
# Opção 1: Script completo (recomendado)
./scripts/run-migrations.sh

# Opção 2: Passo a passo (mais seguro)
npx supabase db query <<'SQL'
ALTER TABLE public.indicacoes
  ADD COLUMN IF NOT EXISTS marca text
    CHECK (marca IN ('rental', 'dorata'))
    DEFAULT 'rental';
SQL
```

## 🧪 **Arquivos Preparados e Prontos**

✅ **Migrações SQL Criadas:**
- `supabase/migrations/001_add_marca_column.sql`
- `supabase/migrations/002_update_existing_records.sql`
- `supabase/migrations/003_rls_policies_marca.sql`

✅ **Scripts de Segurança:**
- `scripts/test-supabase-connection.js` - Testa conexão
- `scripts/run-migrations.sh` - Executa todas as migrações

✅ **Código Atualizado:**
- Tipos TypeScript com coluna `marca`
- Schemas Zod com validação de marca
- Documentação completa

## 🔒 **Medidas de Segurança Implementadas**

1. **Migrações Idempotentes** - Podem ser executadas múltiplas vezes
2. **IF NOT EXISTS** - Não quebra se coluna já existir
3. **Valores Padrão** - Registros existentes ficam com 'rental'
4. **Constraints Válidos** - Apenas 'rental' ou 'dorata'
5. **Backup Automático** - Supabase faz backup automático

## ⚡ **Resumo dos Passos Seguros**

```bash
# 1. Configurar .env.local com chave real
# 2. Testar conexão
node scripts/test-supabase-connection.js

# 3. Se conexão OK, executar migrações
./scripts/run-migrations.sh

# 4. Configurar usuários
# npx supabase auth update USER_ID --user-metadata '{"allowed_brands": ["rental"]}'
```

## 🆘 **Em Caso de Problema**

Se algo der errado:

1. **Parar imediatamente**
2. **Verificar logs**: `npx supabase logs`
3. **Restaurar backup** (se necessário)
4. **Reportar o erro específico**

---

**🎯 TUDO PREPARADO - Aguardando credenciais corretas para prosseguir com segurança!**
