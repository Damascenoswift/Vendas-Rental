# 🎯 Como Executar o Diagnóstico (Via Supabase Dashboard)

## Por que usar o Dashboard?

As ferramentas MCP do Supabase ainda não estão funcionando corretamente no Cursor. A forma mais confiável é executar via Dashboard do Supabase.

---

## 📝 PASSO A PASSO

### 1️⃣ Acesse o SQL Editor

Abra este link no seu navegador:

```
https://supabase.com/dashboard/project/zqilrsijdatoxesdryyt/sql
```

### 2️⃣ Criar Nova Query

1. Clique em **"New Query"** (botão verde no canto superior direito)
2. Ou use o atalho: **Cmd+Enter** (Mac) ou **Ctrl+Enter** (Windows)

### 3️⃣ Cole o SQL de Diagnóstico

Copie todo o conteúdo do arquivo:
```
sql/diagnostic-simple.sql
```

Ou copie este SQL direto:

```sql
-- DIAGNÓSTICO RÁPIDO

-- 1. Tabelas existentes
SELECT tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('indicacoes', 'users');

-- 2. Estrutura da tabela indicacoes
SELECT column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'indicacoes' 
ORDER BY ordinal_position;

-- 3. Contagem
SELECT COUNT(*) as total FROM public.indicacoes;

-- 4. Valores de marca
SELECT marca, COUNT(*) as count
FROM public.indicacoes 
GROUP BY marca;

-- 5. Valores de status
SELECT status, COUNT(*) as count
FROM public.indicacoes 
GROUP BY status;

-- 6. Valores de tipo
SELECT tipo, COUNT(*) as count
FROM public.indicacoes 
GROUP BY tipo;

-- 7. Amostras
SELECT id, marca, status, tipo, created_at
FROM public.indicacoes 
ORDER BY created_at DESC 
LIMIT 5;
```

### 4️⃣ Execute

Clique em **"Run"** ou pressione **Cmd+Enter** (Mac) / **Ctrl+Enter** (Windows)

---

## 🔍 O QUE VERIFICAR NOS RESULTADOS

### ✅ Se tudo estiver OK:
- Tabela `indicacoes` existe
- Coluna `marca` existe
- Valores de `marca`: apenas 'rental', 'dorata' (minúsculas)
- Valores de `status`: apenas 'EM_ANALISE', 'APROVADA', 'REJEITADA', 'CONCLUIDA' (MAIÚSCULAS)
- Valores de `tipo`: apenas 'PF', 'PJ' (MAIÚSCULAS)

### ❌ Se houver problemas:

| Problema | Solução |
|----------|---------|
| Tabela `indicacoes` não existe | Você precisa criar o schema do banco primeiro |
| Coluna `marca` não existe | Execute `sql/fix-schema-complete.sql` |
| Valores de marca inválidos (ex: Dorata, RENTAL) | Execute `sql/fix-schema-complete.sql` |
| Valores de status inválidos (ex: nova, pendente) | Execute `sql/fix-schema-complete.sql` |
| Valores de tipo inválidos (ex: pf, pessoa_fisica) | Execute `sql/fix-schema-complete.sql` |

---

## 🚀 PRÓXIMO PASSO

### Se encontrou problemas:

Execute o script de correção completo:

1. Ainda no SQL Editor do Supabase
2. Abra uma **New Query**
3. Copie todo o conteúdo de: `sql/fix-schema-complete.sql`
4. Clique em **Run**
5. Aguarde a execução (pode levar alguns segundos)
6. Verifique se aparece a mensagem: "✅ Schema corrigido com sucesso!"

### Se está tudo OK:

Teste a aplicação:

```bash
npm run dev
```

E acesse: `http://localhost:3000`

---

## ℹ️  DICA

Se você está vendo este guia, é porque:
- ✅ O código TypeScript já foi corrigido
- ✅ Os scripts SQL já foram criados
- ⚠️  As ferramentas MCP ainda não estão funcionando no Cursor

**Use o Supabase Dashboard** - é a forma mais confiável e rápida!

---

## 📞 Problemas?

Se encontrar erros ao executar SQL:
1. Verifique se está logado no Supabase
2. Verifique se está no projeto correto (zqilrsijdatoxesdryyt)
3. Tente executar uma query de cada vez
4. Cole os erros aqui para análise
