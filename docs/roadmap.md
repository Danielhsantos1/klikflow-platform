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
- **Fechado**: `scripts/test-catalog.browser.js` rodado contra o Neon
  real — `7 passed, 0 failed` (após atualizar o cache de schema da Data
  API, ver "achado operacional" em `docs/database.md`). Confirmado:
  usuário sem membership não lê nem escreve no catálogo de outro tenant;
  categoria de outro tenant não pode ser anexada a um produto.
- Nenhuma UI de catálogo (cardápio, cadastro de produto) criada — fora
  do escopo desta tarefa.

## Concluído (Tarefa 05 — Comanda + Pedidos)

- `db/migrations/0008_tabs_orders.sql` aplicada ao projeto Neon real:
  `tabs` (Comanda), `orders` (Pedido, status fixo por enquanto —
  a máquina de transições configurável é escopo da Tarefa 06),
  `order_items` (itens com snapshot de nome/preço do produto).
- 2 novas permissões (`tabs.manage`, `orders.manage`).
- Snapshot de preço/nome **confirmado de verdade** contra o Neon real:
  um item mantém o preço no momento da compra mesmo depois do produto
  mudar de preço; a trigger `snapshot_order_item()` ignora qualquer
  preço/nome que o cliente tente enviar no INSERT.
- Três proteções testadas de verdade contra o Neon (via SQL e depois via
  HTTP): só uma comanda `open` por Local de Consumo por vez; não dá para
  lançar pedido numa comanda fechada; item de pedido não pode usar
  produto de outro tenant.
- `src/types/database.ts` (tabelas `tabs`/`orders`/`order_items`) e
  `src/types/order.ts` (novo, tipos de domínio) criados.
- `scripts/test-orders.browser.js` criado — inclui uma tentativa
  explícita do cliente de mentir preço/nome do item, confirmando que a
  trigger ignora e grava os valores reais.
- **Pendente**: rodar esse script no navegador e confirmar o resultado.
- Nenhuma UI de comanda/pedido criada — fora do escopo desta tarefa.

## Concluído (Tarefa 06 — Produção + Status configurável)

- `db/migrations/0009_production_status.sql` aplicada ao projeto Neon
  real: `orders.status` (enum fixo da Tarefa 05) substituído por
  `orders.status_id`, apontando para `order_statuses` (lista configurável
  por tenant, com `sequence` e `is_terminal`) e `order_status_transitions`
  (grafo explícito de transições permitidas).
- 2 novas permissões (`orders.configure_statuses`, `production.manage`).
- `default_order_status()` (trigger BEFORE INSERT em `orders`): se o
  cliente não informa `status_id`, usa o de menor `sequence` do tenant.
- `validate_order_status_transition()` (trigger BEFORE UPDATE em
  `orders`): só aceita a mudança de `status_id` se existir uma linha
  correspondente em `order_status_transitions` — transições fora do grafo
  são bloqueadas com exceção.
- `create_tenant()` atualizado: semeia o fluxo padrão de 7 status (Novo →
  Aceito → Em Produção → Pronto → Entregue → Finalizado, mais Cancelado a
  partir de qualquer status não-terminal) e as transições lineares
  correspondentes para todo tenant novo.
- `order_item_stations` (novo): acompanha cada item do pedido nas
  Estações de Produção do produto (Tarefa 04); semeado automaticamente
  via trigger `seed_order_item_stations()` quando o item é criado — sem
  política de INSERT/DELETE client-side, as linhas só nascem/morrem pela
  trigger.
- **Validado via SQL contra o Neon real** (réplica manual da lógica de
  `create_tenant()`, já que `auth.uid()` não pode ser simulado por SQL
  direto): pedido sem `status_id` recebeu o status "Novo" por padrão;
  transição válida (Novo → Aceito) aceita; transição pulando etapas
  (Aceito → Finalizado) corretamente bloqueada; item de produção marcado
  como `done` com sucesso. Dados de teste limpos depois.
- `src/types/database.ts` (`order_statuses`, `order_status_transitions`,
  `order_item_stations`, `orders.status_id`) e `src/types/order.ts`
  (tipos de domínio) atualizados.
- `scripts/test-production-status.browser.js` criado, cobrindo os mesmos
  cenários via HTTP real (Neon Auth + Data API).
- **Pendente**: rodar esse script no navegador e confirmar o resultado
  (usuário está sem acesso a computador no momento; validação SQL já
  confirma o comportamento das triggers).
- Realtime (citado no título da tarefa mestra) fica para quando existir
  uma tela consumindo esses eventos (Tarefa 07+) — construir a infra
  agora, sem consumidor, seria trabalho especulativo.
- Nenhuma UI de produção/status criada — fora do escopo desta tarefa.

## Concluído (Tarefa 07 — Autenticação: login e cadastro)

- Primeira UI real do produto: `/login` e `/signup`, usando o client
  `createAuthClient()` de `@neondatabase/auth/next` (`src/lib/auth/client.ts`)
  contra o proxy same-origin já existente
  (`src/app/api/auth/[...path]/route.ts`), sem nenhuma URL de auth
  hardcoded no cliente.
- `src/features/auth/components/`: `LoginForm`, `SignupForm` e
  `SignOutButton` — Client Components mínimos (email/senha, e nome no
  cadastro), com erro exibido inline e redirecionamento para `/app` no
  sucesso.
- `/app`: primeira rota protegida de verdade, um Server Component que
  usa `getCurrentUser()` (já existia desde a Tarefa 01) e redireciona
  para `/login` se não houver sessão — prova de ponta a ponta que a
  infraestrutura de auth (proxy + `pg_session_jwt`) funciona com uma UI
  real, não só via scripts de Console.
- Landing (`/`) ganhou os botões "Entrar" / "Criar conta".
- `src/components/ui/input.tsx` (novo, mesmo padrão do `Button`).
- **Testado localmente**: `npm run build` sem erros; `/`, `/login` e
  `/signup` respondem 200; `/app` sem sessão redireciona (307) para
  `/login`, confirmando o guard de rota.
- **Fechado**: fluxo completo confirmado pelo usuário direto no celular
  contra `https://klikflow.vercel.app`, sem Console/DevTools — signup
  criou a conta e levou para `/app` mostrando nome e e-mail reais
  (Neon Auth), logout voltou para `/login`, e login de novo com o mesmo
  e-mail/senha funcionou. Primeira tarefa validada de ponta a ponta
  inteiramente pela UI real, em vez de scripts de navegador.
- Nenhuma tela de negócio (catálogo, comanda, produção) criada ainda —
  essa é a próxima tarefa.

## Concluído (Tarefa 08 — Cadastro da empresa + Catálogo, primeira tela de negócio)

- `/app` deixou de ser uma tela de boas-vindas estática e virou o
  dashboard real: `TenantDashboard` (Client Component) descobre a
  empresa do usuário logado consultando `memberships` via Data API
  (respeitando RLS, sem nenhum bypass) e decide o que mostrar.
- Sem empresa ainda → `CreateTenantForm`
  (`src/features/tenants/components/`): nome + segmento, chama a RPC
  `create_tenant()` (Tarefa 02) direto do navegador — a mesma função já
  testada e validada, agora com UI de verdade em vez de scripts de
  Console.
- Com empresa → `CatalogManager`
  (`src/features/catalog/components/`): lista e cria Categorias e
  Produtos (nome + preço) da empresa logada — dados **editáveis por
  empresa**, não uma tela genérica: cada tenant só enxerga e só escreve
  o próprio catálogo, RLS (Tarefa 04) decide isso no banco, não a UI.
- `src/components/ui/input.tsx` reutilizado; nenhuma tela nova de
  design system criada além do necessário.
- **Testado**: `npm run build` e `npm run lint` sem erros; `/app` sem
  sessão continua redirecionando (307) para `/login`. O fluxo completo
  (criar empresa → cadastrar categoria → cadastrar produto) depende do
  Neon Auth real e fica para o usuário confirmar em
  `https://klikflow.vercel.app`, pelo navegador normal — sem Console.
- Fora do escopo: edição/exclusão de categoria e produto, upload de
  imagem, gestão de Estações de Produção e Locais de Consumo pela UI,
  convite de outros usuários para a empresa — tudo isso já existe no
  banco (Tarefas 03/04) mas ainda não tem tela.

## Próximos passos (fora do escopo desta tarefa)

1. Confirmar no navegador que criar empresa → cadastrar categoria →
   cadastrar produto funciona contra o Neon real (Tarefa 08).
2. Confirmar a validação via HTTP da Tarefa 05 e da Tarefa 06 contra o
   Neon real, quando o usuário estiver num computador.
3. Próximas telas de negócio: comanda/pedido (OPERATIONS), produção,
   gestão de usuários/perfis (MANAGEMENT), tela CUSTOMER de
   autoatendimento.
4. Realtime, consumido pelas telas de OPERATIONS/MANAGEMENT acima.
5. SaaS Admin (administração da plataforma, cross-tenant).

Cada um desses itens deve ser tratado como uma tarefa própria, com o
mesmo cuidado de não antecipar funcionalidades fora do escopo pedido.
