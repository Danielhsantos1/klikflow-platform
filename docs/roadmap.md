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
- **Fechado**: os 9 cenários foram repetidos via HTTP real (Neon Auth +
  Data API) rodando `scripts/test-tenant-isolation.browser.js` no
  Console do navegador em `https://klikflow.vercel.app` —
  `9 passed, 0 failed`. Tarefa 02 validada de ponta a ponta.
- App também já está publicado em produção: `https://klikflow.vercel.app`
  (projeto Vercel `klikflow`, deploy automático a cada push no branch).

## Concluído (Tarefa 03 — Usuários + Perfis + Permissões)

- `db/migrations/0006_permissions_roles.sql` aplicada ao projeto Neon
  real: `permissions` (catálogo fixo com 5 permissões iniciais), `roles`
  (Perfis configuráveis por tenant), `role_permissions`.
- `memberships.role` (enum fixo da Tarefa 02) substituído por
  `memberships.role_id`, apontando para um Perfil configurável.
- `has_permission(tenant_id, perm_key)` substitui `is_tenant_admin()` em
  todas as policies (`tenants`, `units`, `memberships`, `audit_log`).
- `create_tenant()` atualizado: cria o Perfil "Proprietário"
  (`is_system = true`) com todas as permissões e a membership do criador
  aponta pra esse Perfil.
- Duas proteções em nível de banco: `protect_system_role()` (Perfil de
  dono não pode ser renomeado/excluído) e
  `protect_last_owner_membership()` (Empresa nunca fica sem dono) —
  ambas testadas de verdade contra o Neon real (transações com rollback
  confirmando o bloqueio).
- `src/types/database.ts`, `src/types/tenant.ts` e
  `src/lib/permissions/types.ts` atualizados para o schema real.
- **Fechado**: `scripts/test-permissions.browser.js` rodado contra o
  Neon real (`https://klikflow.vercel.app`, Console do navegador) —
  `10 passed, 0 failed`. Confirmado: Perfil "Proprietário" nasce com
  todas as permissões; um Perfil customizado ("Caixa") com só
  `audit_log.read` só conseguiu o que tinha permissão; dono não
  conseguiu se auto-rebaixar nem se auto-remover.
- Nenhuma UI de gestão de perfis/usuários criada — fora do escopo (só a
  base configurável de autorização).

## Concluído (Tarefa 04 — Catálogo + Produção + Locais)

- `db/migrations/0007_catalog.sql` aplicada ao projeto Neon real:
  `categories`, `products` (`price`, `image_url`), `production_stations`
  (Estação de Produção), `product_stations` (associação com `sequence`),
  `consumption_locations` (Local de Consumo, sob `units`).
- 3 novas permissões (`catalog.manage`, `production_stations.manage`,
  `consumption_locations.manage`) — `create_tenant()` não precisou
  mudar, já concede automaticamente todas as permissões do catálogo ao
  Perfil "Proprietário".
- Trigger `check_product_category_same_tenant()`: um produto não pode
  usar uma categoria de outro tenant — testado de verdade contra o Neon
  (bloqueado com sucesso, transação desfeita).
- Fluxo completo testado via SQL contra o Neon real: Unidade → Categoria
  → Produto (com preço) → Estação de Produção → associação → Local de
  Consumo.
- `src/types/database.ts` (novas tabelas) e `src/types/catalog.ts`
  (novo, tipos de domínio) criados; `ConsumptionLocation` migrado do
  placeholder em `tenant.ts` para o tipo real.
- `scripts/test-catalog.browser.js` criado para validar via HTTP real —
  inclui teste de usuário sem membership tentando ler/escrever no
  catálogo, e tentativa de anexar categoria de outro tenant.
- **Pendente**: rodar esse script no navegador e confirmar o resultado.
- Nenhuma UI de catálogo (cardápio, cadastro de produto) criada — fora
  do escopo desta tarefa.

## Próximos passos (fora do escopo desta tarefa)

1. Confirmar a validação via HTTP da Tarefa 04 contra o Neon real.
2. Tarefa 05 — Comanda + Pedidos (núcleo transacional). Itens de pedido
   devem gravar snapshot do preço/nome do produto no momento da compra,
   nunca reconsultar `products` depois.
3. Tarefa 06 — Produção, status configurável, Realtime.
4. Telas de negócio: CUSTOMER (autoatendimento), OPERATIONS, MANAGEMENT
   — inclui a primeira UI real de catálogo e de gestão de usuários/perfis.
5. SaaS Admin (administração da plataforma, cross-tenant).

Cada um desses itens deve ser tratado como uma tarefa própria, com o
mesmo cuidado de não antecipar funcionalidades fora do escopo pedido.
