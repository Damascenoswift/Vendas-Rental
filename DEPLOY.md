# 🚀 GUIA DE DEPLOY - RENTAL V2

## ✅ Deploy Automático na Vercel

### **Pré-requisitos**
- [x] Conta na Vercel (vercel.com)
- [x] Projeto no GitHub
- [x] Variáveis de ambiente configuradas

### **📋 Passo a Passo**

#### **1. Conectar GitHub à Vercel**
1. Acesse [vercel.com](https://vercel.com)
2. Faça login com sua conta GitHub
3. Clique em "New Project"
4. Selecione o repositório `rental-v2-clean`

#### **2. Configurar Deploy**
- **Framework Preset**: Next.js (detectado automaticamente)
- **Root Directory**: `./` (raiz do projeto)
- **Build Command**: `npm run build` (padrão)
- **Output Directory**: `.next` (padrão)

#### **3. Variáveis de Ambiente**
Configure estas variáveis na Vercel:

```env
# OBRIGATÓRIAS
NEXT_PUBLIC_SUPABASE_URL=https://sliebietpkyrqihaoexj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# OPCIONAIS (COGNI)
NEXT_PUBLIC_COGNI_API_URL=https://api.cogni.group
NEXT_PUBLIC_COGNI_API_TOKEN=cdcc5fb03482a5804dfbf8a4
NEXT_PUBLIC_COGNI_SECRET_KEY=12f35abcf40bd2f978ff1e11

# OPCIONAIS (INTEGRAÇÃO)
ZAPIER_WEBHOOK_URL=https://hooks.zapier.com/hooks/catch/24229386/u6ns2kc/
```

#### **4. Deploy Automático**
- ✅ Push para `main` = Deploy automático
- ✅ Preview em branches = Deploy de teste
- ✅ SSL automático
- ✅ CDN global
- ✅ Monitoramento incluído

### **🔧 Comandos Úteis**

```bash
# Testar build local
npm run build

# Testar produção local
npm start

# Deploy via CLI (opcional)
npx vercel --prod
```

### **📊 URLs Após Deploy**

- **Produção**: `https://rental-v2-clean.vercel.app`
- **Preview**: `https://rental-v2-clean-git-branch.vercel.app`
- **Dashboard**: `https://vercel.com/dashboard`

### **🛠️ Troubleshooting**

#### **Build Error?**
```bash
# Limpar cache e reinstalar
rm -rf .next node_modules
npm install
npm run build
```

#### **Environment Variables?**
- Verifique se todas as `NEXT_PUBLIC_*` estão configuradas
- Redeploy após adicionar variáveis
- Use `console.log(process.env.NEXT_PUBLIC_SUPABASE_URL)` para debug

#### **Supabase Connection?**
- Verifique URL e chave no dashboard Supabase
- Confirme que RLS está configurado corretamente
- Teste localmente primeiro

### **🎯 Checklist Pós-Deploy**

- [ ] Site carrega corretamente
- [ ] Supabase conecta (teste login)
- [ ] COGNI funciona (acesse `/cogni-test`)
- [ ] SSL ativo (https://)
- [ ] Performance OK (< 3s carregamento)
- [ ] Responsivo (mobile/desktop)

### **⚡ Performance Otimizada**

O projeto já inclui:
- ✅ **Next.js 15** - Framework otimizado
- ✅ **Turbopack** - Build ultra-rápido
- ✅ **Tailwind CSS** - CSS otimizado
- ✅ **TypeScript** - Code splitting automático
- ✅ **shadcn/ui** - Componentes leves
- ✅ **Cache inteligente** - COGNI com TTL

### **💰 Custos**

- **Hobby Plan**: Gratuito até 100GB bandwidth
- **Pro Plan**: $20/mês para uso comercial
- **Domínio customizado**: Opcional

---

**Deploy configurado com sucesso! 🎉**
