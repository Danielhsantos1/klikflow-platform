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

Executada duas vezes: primeiro desenhada para Supabase, depois portada
para **Neon** a pedido do usuário (limite de projetos do plano gratuito
do Supabase). O resultado final está no Neon.

- Schema versionado em `db/migrations/`: `profiles`, `tenants`, `units`,
  `memberships`, `audit_log` — **aplicado a um projeto Neon real**
  (`klikflow`, região `sa-east-1`).
- RLS habilitado e forçado em todas as tabelas, isolando tenants via
  `is_tenant_member()`/`is_tenant_admin()` — nunca via `tenant_id` do
  cliente. Confirmado estruturalmente contra o projeto real (RLS
  enable+force, 13 policies, roles da Data API sem `BYPASSRLS`).
- Criação de tenant via função RPC `create_tenant()` (atômica, evita o
  bug de RLS+`RETURNING` documentado em `docs/database.md`).
- Trigger `handle_new_user()` sincronizando `neon_auth."user"` →
  `profiles`.
- `audit_log` somente leitura para admins do tenant; sem INSERT/UPDATE/
  DELETE client-side.
- Neon Auth (Managed Better Auth) + Neon Data API provisionados; proxy de
  auth (`src/app/api/auth/[...path]/route.ts`), instância server
  (`src/lib/auth/server.ts`) e clients de banco (`src/lib/db/client.ts`,
  `src/lib/db/admin.ts`) implementados.
- 9 cenários de isolamento/segurança testados ponta a ponta contra
  Postgres local antes da portabilidade (ver `docs/database.md`) — a
  mesma lógica de policies foi aplicada ao Neon sem alteração.
- `src/types/database.ts` e `src/types/tenant.ts` atualizados para
  espelhar o schema real.
- **Pendente**: repetir os 9 cenários via HTTP contra o Neon real — a
  política de rede deste ambiente de desenvolvimento bloqueia o host da
  Neon Auth/Data API (fora do escopo resolver isso aqui).

## Próximos passos (fora do escopo desta tarefa)

1. Validar o isolamento entre tenants via HTTP contra o Neon real (de um
   ambiente sem a restrição de rede deste sandbox).
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
