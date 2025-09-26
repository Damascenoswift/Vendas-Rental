# 🚀 Configuração do Deploy no Vercel

## 🔧 Problema Identificado

Você está certo! O problema pode ser que:
- ✅ Supabase foi atualizado com novas chaves
- ❌ Vercel ainda tem as chaves antigas
- ❌ Variáveis de ambiente desatualizadas

## 📋 Solução: Configurar Variáveis no Vercel

### **Opção 1: Via Dashboard Vercel (Recomendado)**

1. **Acesse:** https://vercel.com/dashboard
2. **Selecione seu projeto** (se já existe)
3. **Settings** → **Environment Variables**
4. **Adicione estas variáveis:**

```env
NEXT_PUBLIC_SUPABASE_URL=https://sliebietpkyrqihaoexj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsaWViaWV0cGt5cnFpaGFvZXhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4MTIyOTEsImV4cCI6MjA2OTM4ODI5MX0.yWlXly2oYdEmdy_orto-h0cVpKfeg4HkkYWJFvSJ230
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsaWViaWV0cGt5cnFpaGFvZXhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzgxMjI5MSwiZXhwIjoyMDY5Mzg4MjkxfQ.IhffKG6c10MnlhLOx86RJ2U89sSvBOoFWnGIG0ZLEnA
```

### **Opção 2: Via CLI (Após Login)**

```bash
# Depois de completar o login
npx vercel env add NEXT_PUBLIC_SUPABASE_URL
# Cole: https://sliebietpkyrqihaoexj.supabase.co

npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY  
# Cole a chave anon atualizada

npx vercel env add SUPABASE_SERVICE_ROLE_KEY
# Cole a chave service_role
```

### **Opção 3: Deploy Novo Projeto**

Se não existe projeto no Vercel ainda:

```bash
# Fazer login primeiro
npx vercel login

# Deploy com configuração automática
npx vercel --yes

# Configurar variáveis depois no dashboard
```

## 🎯 **Próximos Passos**

1. **Complete o login no Vercel** (abra o link que apareceu)
2. **Configure as variáveis** no dashboard
3. **Faça um novo deploy** ou redeploy
4. **Teste a aplicação** em produção

## ⚠️ **Importante**

- ✅ **Chaves atualizadas** - Use as do arquivo `.env.production`
- ✅ **Environment**: Configurar para Production, Preview e Development
- ✅ **Redeploy**: Depois de alterar variáveis, fazer redeploy

## 🔗 **Links Úteis**

- Dashboard Vercel: https://vercel.com/dashboard
- Docs Environment Variables: https://vercel.com/docs/environment-variables

---

**🎯 O problema provavelmente é esse mesmo! Vamos configurar as variáveis atualizadas no Vercel.**
