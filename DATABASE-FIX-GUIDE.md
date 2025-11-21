# 🔧 Guia Completo de Correção do Banco de Dados

## 📋 Resumo dos Problemas Identificados

1. **Configuração MCP incorreta** - ✅ CORRIGIDO
2. **Inconsistências de valores** - Status, marca e tipo com valores em formatos diferentes
3. **Constraints faltando** - Falta validação adequada em várias colunas
4. **RLS policies** - Políticas de segurança podem estar desatualizadas
5. **Índices** - Faltam índices importantes para performance
6. **Coluna allowed_brands** - Pode estar com valores inconsistentes

## 🎯 Status Atual

- ✅ **MCP Configurado**: Arquivo `/Users/guilhermedamasceno/.cursor/mcp.json` atualizado
- ⚠️ **AÇÃO NECESSÁRIA**: Reinicie o Cursor completamente

## 📝 Plano de Execução (Após Reiniciar o Cursor)

### Passo 1: Diagnóstico Completo

Execute o diagnóstico para coletar todas as informações do banco:

```bash
# No Cursor, use o MCP para executar:
cat sql/diagnostic-complete.sql
```

Ou peça para a IA executar:
> "Execute o arquivo sql/diagnostic-complete.sql e me mostre os resultados"

**O que o diagnóstico vai mostrar:**
- ✅ Versão do PostgreSQL
- ✅ Todos os enums existentes
- ✅ Estrutura das tabelas
- ✅ Valores distintos em cada coluna crítica
- ✅ Valores inválidos que precisam correção
- ✅ Constraints, índices, RLS policies
- ✅ Funções e triggers relacionados

### Passo 2: Análise dos Resultados

Revise os resultados do diagnóstico procurando por:

1. **Valores inválidos em marca**: Devem ser apenas `rental` ou `dorata` (minúsculas)
2. **Valores inválidos em status**: Devem ser `EM_ANALISE`, `APROVADA`, `REJEITADA`, `CONCLUIDA` (MAIÚSCULAS)
3. **Valores inválidos em tipo**: Devem ser apenas `PF` ou `PJ` (MAIÚSCULAS)
4. **Valores inválidos em role**: Devem ser `vendedor_externo`, `vendedor_interno`, `supervisor`, `adm_mestre`, `adm_dorata` (minúsculas)
5. **Arrays vazios em allowed_brands**: Devem ter ao menos `['rental']`

### Passo 3: Backup (IMPORTANTE!)

Antes de aplicar correções, faça backup:

```bash
# Se tiver acesso direto ao PostgreSQL:
pg_dump -U postgres -d sua_base > backup_antes_correcao_$(date +%Y%m%d_%H%M%S).sql
```

Ou use o painel do Supabase para criar um snapshot.

### Passo 4: Aplicar Correções

Execute o script de correção completo:

```bash
# No Cursor, peça para a IA:
# "Execute o arquivo sql/fix-schema-complete.sql"
```

**O que o script faz:**
1. ✅ Normaliza todos os valores de marca para minúsculas
2. ✅ Normaliza todos os valores de status para MAIÚSCULAS
3. ✅ Normaliza todos os valores de tipo para MAIÚSCULAS
4. ✅ Normaliza todos os valores de role para minúsculas com underscore
5. ✅ Adiciona/atualiza coluna `allowed_brands` em users
6. ✅ Cria constraints adequadas em todas as colunas
7. ✅ Cria índices para performance
8. ✅ Atualiza RLS policies
9. ✅ Executa verificação final

### Passo 5: Verificação Pós-Correção

Após executar as correções, verifique:

```sql
-- 1. Verificar contagens
SELECT 
  (SELECT COUNT(*) FROM public.indicacoes) as total_indicacoes,
  (SELECT COUNT(*) FROM public.users) as total_users;

-- 2. Verificar marcas
SELECT marca, COUNT(*) 
FROM public.indicacoes 
GROUP BY marca;

-- 3. Verificar status
SELECT status, COUNT(*) 
FROM public.indicacoes 
GROUP BY status;

-- 4. Verificar tipos
SELECT tipo, COUNT(*) 
FROM public.indicacoes 
GROUP BY tipo;

-- 5. Verificar roles
SELECT role, COUNT(*) 
FROM public.users 
GROUP BY role;

-- 6. Verificar allowed_brands
SELECT allowed_brands, COUNT(*) 
FROM public.users 
GROUP BY allowed_brands;
```

### Passo 6: Testar a Aplicação

1. **Reinicie o servidor de desenvolvimento**:
   ```bash
   npm run dev
   ```

2. **Teste funcionalidades críticas**:
   - ✅ Login de usuários
   - ✅ Listagem de indicações
   - ✅ Criação de novas indicações
   - ✅ Filtro por marca (rental/dorata)
   - ✅ Filtro por status
   - ✅ Dashboard com métricas

3. **Verifique os logs do browser** para erros de API

4. **Verifique os logs do Supabase**:
   ```bash
   # No Cursor, peça:
   # "Mostre os logs do Supabase para API e Postgres"
   ```

## 🚨 Problemas Comuns e Soluções

### Erro: "lower(marca) não existe"
**Causa**: Tentando usar `lower()` diretamente em enum
**Solução**: Usar `lower(marca::text)` ou, melhor, nosso script já converte tudo para text com constraints

### Erro: "violação de constraint"
**Causa**: Valores inválidos no banco
**Solução**: O script `fix-schema-complete.sql` normaliza ANTES de aplicar constraints

### Erro: "RLS bloqueia acesso"
**Causa**: Policies muito restritivas ou user sem allowed_brands
**Solução**: Verificar se o usuário tem `allowed_brands` correto

### Erro: "Não consegue conectar ao banco"
**Causa**: Credenciais inválidas ou MCP mal configurado
**Solução**: Já corrigimos o MCP, mas confira as variáveis de ambiente

## 📊 Padrões Estabelecidos

### Valores Esperados por Coluna

| Coluna | Tabela | Tipo | Valores Válidos | Case | Default |
|--------|--------|------|----------------|------|---------|
| `marca` | indicacoes | text | rental, dorata | minúsculas | rental |
| `status` | indicacoes | text | EM_ANALISE, APROVADA, REJEITADA, CONCLUIDA | MAIÚSCULAS | EM_ANALISE |
| `tipo` | indicacoes | text | PF, PJ | MAIÚSCULAS | - |
| `role` | users | text | vendedor_externo, vendedor_interno, supervisor, adm_mestre, adm_dorata | minúsculas | vendedor_externo |
| `allowed_brands` | users | text[] | ['rental'], ['dorata'], ['rental','dorata'] | minúsculas | ['rental'] |

### Correspondência com TypeScript

Os tipos em `src/types/database.ts` estão alinhados:

```typescript
marca: 'dorata' | 'rental'  // ✅ minúsculas
status: 'EM_ANALISE' | 'APROVADA' | 'REJEITADA' | 'CONCLUIDA'  // ✅ MAIÚSCULAS
tipo: 'PF' | 'PJ'  // ✅ MAIÚSCULAS
role: 'vendedor_externo' | 'vendedor_interno' | 'supervisor' | 'adm_mestre' | 'adm_dorata'  // ✅ minúsculas
```

## 🔒 Segurança (RLS)

### Policies Implementadas

1. **SELECT**: Usuário vê apenas suas próprias indicações nas marcas autorizadas
2. **INSERT**: Usuário só cria indicações nas marcas autorizadas
3. **UPDATE**: Usuário só atualiza suas próprias indicações nas marcas autorizadas
4. **DELETE**: Usuário só deleta suas próprias indicações nas marcas autorizadas

### Testando RLS

```sql
-- Como usuário autenticado, deve retornar apenas suas indicações
SELECT * FROM public.indicacoes;

-- Como service_role, deve retornar todas
-- (use apenas em queries administrativas)
```

## 📈 Índices para Performance

Os seguintes índices foram criados/atualizados:

1. `idx_indicacoes_marca` - Busca por marca
2. `idx_indicacoes_user_marca` - Busca composta user + marca
3. `idx_indicacoes_status` - Busca por status
4. `idx_indicacoes_status_created` - Busca composta status + data
5. `idx_users_allowed_brands` - Busca GIN para array de marcas

## 🎓 Comandos Úteis (Via MCP)

Após reiniciar o Cursor, você pode pedir:

```
"Liste todas as tabelas do banco"
"Execute uma query para mostrar todas as indicacoes"
"Mostre os logs da API do Supabase"
"Execute o diagnostic-complete.sql"
"Execute o fix-schema-complete.sql"
"Gere os tipos TypeScript do banco"
```

## 📞 Próximos Passos

Depois que tudo estiver funcionando:

1. ✅ Commit das mudanças de configuração
2. ✅ Deploy para produção (se aplicável)
3. ✅ Documentar quaisquer customizações específicas
4. ✅ Configurar monitoramento/alertas

## ⚠️ LEMBRE-SE

**REINICIE O CURSOR AGORA** para que a configuração do MCP seja carregada!

Após reiniciar, diga: "Execute o diagnostic-complete.sql e me mostre os resultados"

