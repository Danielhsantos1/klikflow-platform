# Desenvolvimento

## Requisitos

- Node.js 20+
- npm

## Setup

```bash
npm install
cp .env.example .env.local   # preencher com as chaves reais do projeto Supabase
npm run dev
```

## Scripts

| Comando         | Descrição                          |
|-----------------|-------------------------------------|
| `npm run dev`   | Servidor de desenvolvimento         |
| `npm run build` | Build de produção                   |
| `npm run start` | Sobe o build de produção            |
| `npm run lint`  | ESLint                              |

## Convenções

- TypeScript em modo `strict` (já configurado em `tsconfig.json`).
- Um domínio de negócio = um diretório em `src/features/<dominio>`.
- Nunca importar `src/lib/supabase/admin.ts` de um componente client
  (`"use client"`) — o pacote `server-only` bloqueia isso em build.
- Validar toda entrada externa (formulários, payloads de API) com Zod
  antes de usá-la.
- Nomear conceitos de forma genérica (Unidade, Local de Consumo, Comanda,
  Estação de Produção) — nunca usar termos de um segmento específico
  (mesa, cozinha, garçom, hambúrguer) em código ou schema.

## Migrations do banco

Vivem em `supabase/migrations/*.sql`, numeradas e aplicadas em ordem.
Nunca editar uma migration já aplicada — criar uma nova.

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push       # aplica as migrations pendentes
```

Depois de aplicar, regenerar os tipos:

```bash
npx supabase gen types typescript --project-id <project-ref> > src/types/database.ts
```

Ver `docs/database.md` para o schema, a estratégia de RLS e os testes de
isolamento já executados.

## Deploy

Vercel, conectado ao branch principal do GitHub. Variáveis de ambiente do
Supabase devem ser configuradas no dashboard do projeto Vercel, não
commitadas.
