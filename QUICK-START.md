# 🚀 Quick Start - Correção do Banco de Dados

## ⚠️ IMPORTANTE: VOCÊ ESTÁ AQUI!

**PASSO 1: REINICIE O CURSOR AGORA** 

O arquivo de configuração do MCP foi atualizado. Você DEVE reiniciar o Cursor completamente para que as mudanças tenham efeito.

Após reiniciar, volte aqui e continue com o Passo 2.

---

## 📋 Status das Correções

### ✅ Concluído
- [x] Configuração MCP atualizada (`.cursor/mcp.json`)
- [x] Correções de código TypeScript aplicadas
  - [x] `src/components/forms/indicacao-form.tsx` - status corrigido para `EM_ANALISE`
  - [x] `src/lib/integrations/clicksign.ts` - status corrigido para `EM_ANALISE`
- [x] Arquivos SQL de diagnóstico e correção criados
- [x] Script de teste de conexão criado
- [x] Documentação completa criada

### ⏳ Pendente (APÓS REINICIAR O CURSOR)
- [ ] Reiniciar o Cursor ← **VOCÊ ESTÁ AQUI**
- [ ] Executar diagnóstico do banco de dados
- [ ] Aplicar correções no banco
- [ ] Testar a aplicação

---

## 🔄 PASSO 2: Depois de Reiniciar o Cursor

Após reiniciar o Cursor, execute os comandos abaixo ou peça para a IA:

### 2.1 Diagnosticar o Banco de Dados

Diga para a IA:
```
Execute o arquivo sql/diagnostic-complete.sql e me mostre os resultados
```

Ou execute manualmente via MCP.

### 2.2 Analisar Resultados

Procure por:
- ❌ Valores inválidos em `marca` (devem ser: `rental`, `dorata`)
- ❌ Valores inválidos em `status` (devem ser: `EM_ANALISE`, `APROVADA`, `REJEITADA`, `CONCLUIDA`)
- ❌ Valores inválidos em `tipo` (devem ser: `PF`, `PJ`)
- ❌ Valores inválidos em `role` (devem ser: `vendedor_externo`, `vendedor_interno`, `supervisor`, `adm_mestre`, `adm_dorata`)

### 2.3 Aplicar Correções

**IMPORTANTE: Faça backup antes!**

Diga para a IA:
```
Execute o arquivo sql/fix-schema-complete.sql
```

Ou execute manualmente via MCP.

### 2.4 Verificar Correções

Diga para a IA:
```
Verifique se o banco está correto executando queries de validação
```

### 2.5 Testar a Aplicação

```bash
npm run dev
```

Teste:
1. ✅ Login
2. ✅ Listagem de indicações
3. ✅ Criação de nova indicação
4. ✅ Filtros por marca
5. ✅ Dashboard com métricas

---

## 🔍 Verificação Rápida (Opcional)

Se quiser testar a conexão com o banco antes de tudo:

```bash
node scripts/test-database-connection.js
```

---

## 📚 Documentação Completa

Para entender todos os detalhes, leia:
- **`DATABASE-FIX-GUIDE.md`** - Guia completo com explicações detalhadas
- **`sql/diagnostic-complete.sql`** - Query de diagnóstico completa
- **`sql/fix-schema-complete.sql`** - Script de correção completa

---

## 🆘 Problemas Comuns

### "Project reference in URL is not valid"
**Solução**: Você ainda não reiniciou o Cursor. Feche completamente e abra novamente.

### "Não consigo executar SQL"
**Solução**: Após reiniciar, verifique se o MCP está conectado. Diga: "Liste as tabelas do banco"

### "Valores inválidos no banco"
**Solução**: Execute o `sql/fix-schema-complete.sql` - ele normaliza automaticamente todos os valores

### "RLS bloqueia acesso"
**Solução**: Verifique se o usuário tem `allowed_brands` configurado corretamente

---

## 📞 Próximos Passos

1. **AGORA**: Reinicie o Cursor
2. **Depois**: Execute diagnóstico
3. **Depois**: Aplique correções
4. **Depois**: Teste a aplicação
5. **Sucesso**: Commit e deploy!

---

## 💡 Comandos Úteis (Após Reiniciar)

Peça para a IA:

```
"Liste todas as tabelas do banco"
"Mostre os logs da API do Supabase"
"Execute o diagnostic-complete.sql"
"Execute o fix-schema-complete.sql"
"Gere os tipos TypeScript do banco"
"Mostre os advisors de segurança do Supabase"
```

---

## ✅ Checklist Rápido

- [ ] Cursor reiniciado
- [ ] Diagnóstico executado
- [ ] Backup criado
- [ ] Correções aplicadas
- [ ] Aplicação testada
- [ ] Tudo funcionando!

---

**🎉 Boa sorte! Em poucos minutos tudo estará funcionando perfeitamente.**

