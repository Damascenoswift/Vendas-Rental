# Codex Quick Map (Rental V2)

Guia curto para reduzir tempo de descoberta em sessões do Codex.

## Arquitetura (alto nível)

- App Router e páginas: `src/app`
- Componentes reutilizáveis: `src/components`
- Regras/utilitários: `src/lib`
- Serviços de negócio: `src/services`
- Banco e migrações: `supabase/migrations` e `sql`
- Scripts operacionais: `scripts`

## Comandos padrão

```bash
npm run dev
npm run lint
npm run typecheck
npm run test
npm run test:watch
npm run e2e
npm run check
```

## Definition of Done (tarefas de código)

Rodar localmente antes de fechar tarefa (`lint + typecheck + test`):

```bash
npm run check
```

Se precisar feedback rápido apenas de tipagem:

```bash
npm run typecheck
```

Se a mudança envolver fluxo de ponta a ponta, também rodar:

```bash
npm run e2e
```

## Estratégia de subagentes (paralelo)

- Domínio 1: UI e rotas (`src/app`, `src/components`)
- Domínio 2: Regras e serviços (`src/lib`, `src/services`)
- Domínio 3: Banco e SQL (`supabase/migrations`, `sql`)

Use prompts com escopo fechado, saída esperada clara e sem sobreposição de arquivos.
