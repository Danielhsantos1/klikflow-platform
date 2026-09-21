# Roadmap

## Concluído (Tarefa 01 — Fundação)

- Projeto Next.js + TypeScript + Tailwind + ESLint inicializado.
- Estrutura de pastas por domínio (`src/features/*`).
- Infraestrutura Supabase preparada (client, server, admin, middleware),
  sem schema de negócio.
- Segurança inicial: strict mode, Zod, `.env.example`, separação
  client/server, `server-only` no client privilegiado.
- Vocabulário de multi-tenancy definido (`src/types/tenant.ts`), sem
  implementação de isolamento.
- Design system inicial (Tailwind + shadcn/ui + Lucide) com um componente
  (`Button`) de exemplo.
- Landing simples validando que o projeto builda e roda.
- Documentação em `/docs`.

## Concluído (Tarefa 02 — Banco + Multi-tenancy + Auth + RLS)

- Schema versionado em `supabase/migrations/`: `profiles`, `tenants`,
  `units`, `memberships`, `audit_log`.
- RLS habilitado e forçado em todas as tabelas, isolando tenants via
  `is_tenant_member()`/`is_tenant_admin()` — nunca via `tenant_id` do
  cliente.
- Criação de tenant via função RPC `create_tenant()` (atômica, evita o
  bug de RLS+`RETURNING` documentado em `docs/database.md`).
- Trigger `handle_new_user()` sincronizando `auth.users` → `profiles`.
- `audit_log` somente leitura para admins do tenant; sem INSERT/UPDATE/
  DELETE client-side.
- 9 cenários de isolamento/segurança testados contra Postgres local (ver
  `docs/database.md`) — todos passaram.
- `src/types/database.ts` e `src/types/tenant.ts` atualizados para
  espelhar o schema real.
- Migrations ainda não aplicadas a um projeto Supabase real (limite do
  plano gratuito da organização — decisão pendente do usuário).

## Próximos passos (fora do escopo desta tarefa)

1. Aplicar as migrations a um projeto Supabase real e repetir os testes
   de isolamento via `supabase-js` (não só localmente).
2. Tarefa 03 — sistema configurável de usuários/perfis/permissões,
   substituindo o enum fixo `memberships.role`.
3. Tarefa 04 — catálogo (categorias, produtos, preços), estações de
   produção, locais de consumo.
4. Tarefa 05 — Comanda + Pedidos (núcleo transacional).
5. Tarefa 06 — Produção, status configurável, Realtime.
6. Telas de negócio: CUSTOMER (autoatendimento), OPERATIONS, MANAGEMENT.
7. SaaS Admin (administração da plataforma, cross-tenant).

Cada um desses itens deve ser tratado como uma tarefa própria, com o
mesmo cuidado de não antecipar funcionalidades fora do escopo pedido.
