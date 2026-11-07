# Padrões de desenvolvimento — KlikFlow

## Stack real (não inventar alternativa)

- **Next.js 16 (App Router)** + React 19 + TypeScript strict.
- **Neon**: Postgres, Neon Auth (Managed Better Auth), Data API (RLS),
  Object Storage (`@vercel/blob` para upload de imagem).
- **Tailwind CSS v4** + shadcn/ui (`src/components/ui/*`) + Lucide
  Icons.
- **Zod** para validação de fronteira.
- Deploy: **Vercel**. Banco: **Neon** (projeto `klikflow`,
  `aws-sa-east-1`).
- Nenhum ORM (Prisma, Drizzle) — acesso via Data API (client) ou SQL
  direto (admin/migrations). Nenhuma alternativa a Neon (Firebase,
  Supabase) — o projeto já migrou de Supabase pra Neon uma vez, por
  decisão explícita do usuário, documentada em `docs/architecture.md`.

## Estrutura de pastas

```
src/
├── app/                # rotas (App Router)
├── components/ui/      # design system (shadcn/ui)
├── features/<dominio>/components/*.tsx   # um diretório por domínio
├── lib/
│   ├── db/              # client.ts (Data API), admin.ts (server-only), anonymous.ts
│   ├── auth/            # client.ts, server.ts, session.ts
│   ├── uploads/
│   ├── theme/
│   └── utils/
├── types/               # tipos de domínio + database.ts (espelha as migrations à mão)
db/migrations/*.sql      # schema, numerado sequencialmente
```

Um domínio novo ganha uma pasta própria em `src/features/<dominio>/
components/`. Não criar `src/services/`, `src/config/` ou outras pastas
do desenho original (`docs/architecture.md`) que nunca chegaram a ser
usadas — o padrão real que vingou é feature folder com componentes
"use client" direto, sem camada de serviço separada.

## Componentes

- `"use client"` é o padrão em componentes de feature — a maior parte
  do app é interativo (CRUD em tempo real via Data API). Server
  Components aparecem em guards de rota (`/app`) e params de página
  (`searchParams`/`params` como `Promise` no Next 16).
- Reaproveitar `src/components/ui/*` (button, input, card, badge,
  alert, avatar, skeleton, empty-state) — não recriar um componente
  equivalente dentro de uma feature.
- Fetch de dados: uma função `async function fetchX(tenantId)` no topo
  do arquivo, chamada tanto no `useEffect` inicial quanto numa função
  `reload()` reusada depois de cada mutação. Padrão em todo
  `*-manager.tsx`/`*-board.tsx` do projeto — seguir o mesmo formato em
  vez de inventar outro (ex: React Query, SWR não são usados).
- Preço/valor monetário sempre formatado com
  `.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })`
  — nunca hardcode de símbolo `R$`.
- Campos numéricos vêm da Data API como `string` (numeric do Postgres
  serializado como string pra não perder precisão) — sempre `Number()`
  só na hora de exibir/calcular, nunca guardar como `number` no estado
  vindo direto da API.

## React Compiler / regras de pureza

O projeto roda com o React Compiler ativo via ESLint
(`react-hooks/set-state-in-effect`, `react-hooks/purity`). Dois erros
reais já apareceram neste projeto e voltam a aparecer se repetidos:

- **Nunca chamar `setState` de forma síncrona no corpo de um
  `useEffect`** (fora de um callback assíncrono). Se precisa de um
  valor computado a partir do estado atual no primeiro render, derive
  inline (`const selected = orders.find(...) ?? orders[0] ?? null`) em
  vez de um efeito que seta estado.
- **Nunca chamar `Date.now()`/`Math.random()` dentro de uma função que
  o compiler trata como teoricamente pura** (incluindo handlers de
  evento, em certas configurações). Prefira derivar sequência/ordem a
  partir dos dados já carregados (`items.length + 1`) em vez de
  timestamp.

Sempre rodar `npx tsc --noEmit` e `npm run lint` depois de qualquer
mudança — zero erro novo é o critério mínimo pra considerar uma etapa
pronta (warnings pré-existentes em `scripts/*.browser.js` não contam).

## Fluxo de validação obrigatório antes de qualquer entrega

1. `npx tsc --noEmit` — zero erro.
2. `npm run lint` — zero erro novo (warnings pré-existentes nos
   scripts de teste manual são esperados e não bloqueiam).
3. Se a mudança envolveu banco: validar com um teste SQL direto
   (`do $$ ... end $$` descartável) simulando o cenário real, **antes**
   de considerar a migration pronta — nunca assumir que uma trigger ou
   policy funciona sem testar contra o banco de verdade.
4. Só depois disso, commit + push (nunca pular etapa 1-3 achando que
   "deve estar certo").

## Git / commits

- Commits pequenos, um por etapa logicamente fechada — não empilhar
  features não relacionadas num commit só.
- Mensagem de commit em português, explicando o PORQUÊ (não só o
  "o quê" — o nome dos arquivos já mostra isso).
- Nunca `git push --force` na branch principal. Nunca commitar sem
  rodar a validação da seção acima primeiro.
