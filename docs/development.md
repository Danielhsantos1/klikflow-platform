# Desenvolvimento

## Requisitos

- Node.js 20+
- npm

## Setup

```bash
npm install
cp .env.example .env.local   # preencher com as chaves reais do projeto Neon
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
- Nunca importar `src/lib/db/admin.ts` de um componente client
  (`"use client"`) — o pacote `server-only` bloqueia isso em build.
- Validar toda entrada externa (formulários, payloads de API) com Zod
  antes de usá-la.
- Nomear conceitos de forma genérica (Unidade, Local de Consumo, Comanda,
  Estação de Produção) — nunca usar termos de um segmento específico
  (mesa, cozinha, garçom, hambúrguer) em código ou schema.

## Migrations do banco

Vivem em `db/migrations/*.sql`, numeradas e aplicadas em ordem. Nunca
editar uma migration já aplicada — criar uma nova.

```bash
for f in db/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
```

Ou via o MCP do Neon (`run_sql_transaction`), como foi feito nesta tarefa.

**Importante:** depois de criar/alterar tabelas, atualizar o cache de
schema da Neon Data API (painel do Neon → Postgres database → Data API →
"Refresh schema cache", ou `update_data_api` via MCP/API). Sem isso, a
Data API responde com *"Could not find the table ... in the schema
cache"* mesmo com a tabela existindo e a RLS correta — já aconteceu na
Tarefa 04 e parece um bug de permissão quando não é.

Depois de aplicar, regenerar os tipos (quando o gerador oficial estiver
acessível — ver `docs/data-api/generate-types` na documentação do Neon):

```bash
# placeholder — o gerador exato depende de rede que este ambiente não tinha
```

Ver `docs/database.md` para o schema, a estratégia de RLS e os testes de
isolamento já executados.

## Deploy

Vercel, conectado ao branch principal do GitHub. Variáveis de ambiente do
Neon (`NEXT_PUBLIC_NEON_DATABASE_URL`, `NEON_AUTH_BASE_URL`,
`NEON_AUTH_COOKIE_SECRET`, `DATABASE_URL`) devem ser configuradas no
dashboard do projeto Vercel, não commitadas.
