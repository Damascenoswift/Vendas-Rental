# Handoff - Rental V2 Clean

## O que foi pedido
- Liberar acesso do portal do investidor para o login `adm_mestre`.
- Adicionar um atalho/botao para o portal do investidor no dashboard.
- Entender por que o deploy na Vercel falhou e orientar como corrigir.

## Mudancas realizadas (codigo)
1) `src/app/investidor/layout.tsx`
- Guard de acesso atualizado para permitir `adm_mestre` acessar o portal do investidor.
- O acesso agora aceita `investidor` OU `adm_mestre`.
- Foi adicionado fallback de role via `user_metadata` caso a tabela `public.users` esteja fora de sincronia.

2) `src/app/dashboard/layout.tsx`
- Adicionado botao "Portal do Investidor" no header do dashboard para `adm_mestre`.
- O link aponta para `/investidor`.

## Commit/push
- Commit feito e enviado ao GitHub: "Permitir admin mestre no portal do investidor".
- Branch: `main`.
- Hash do commit: `efcacb6`.

## Onde paramos
- O deploy da Vercel para o commit `efcacb6` falhou no build.
- O erro do build (Vercel) indica problema com `lightningcss`:
  - `Error: Cannot find module '../lightningcss.linux-x64-gnu.node'`
  - Isso costuma acontecer quando a Vercel instala sem `devDependencies` e/ou sem `optionalDependencies`.

## Sugestoes para resolver o deploy na Vercel
Opcao A (sem mudar codigo):
- Vercel > Settings > Environment Variables
  - Remover `NODE_ENV` se existir (isso faz o npm omitir devDependencies)
  - Garantir `NPM_CONFIG_PRODUCTION=false`
  - Garantir `NPM_CONFIG_OPTIONAL=true`
- Vercel > Settings > Build & Development > Install Command
  - Usar `npm install` OU `npm ci --include=dev --include=optional`

Opcao B (com mudanca no repo):
- Mover `tailwindcss` e `@tailwindcss/postcss` para `dependencies` em `package.json`.
- Isso garante que o binario do lightningcss seja instalado no build.

## Observacoes importantes
- O portal do investidor existe em `src/app/investidor/*`.
- As tabelas e RLS do modo investidor estao no arquivo `sql/migration_energy_manager.sql`.
  - Esse arquivo NAO esta em `supabase/migrations`.
  - Se ainda nao foi aplicado no Supabase de producao, o portal pode ficar vazio ou falhar.
- A Vercel mostra o deploy com erro no commit `efcacb6` e os deployments "Current" sao de commits antigos.

## Proximos passos sugeridos
1) Corrigir o build na Vercel com a Opcao A (mais rapido) e fazer redeploy do commit `efcacb6`.
2) Se ainda falhar, aplicar a Opcao B e subir novo commit.
3) Confirmar se o SQL `sql/migration_energy_manager.sql` foi aplicado no Supabase (tabelas + RLS).
4) Testar login `adm_mestre` e acessar `/investidor`.

