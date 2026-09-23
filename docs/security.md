# Segurança

## Princípios adotados desde a fundação

- **TypeScript strict** ligado desde o início (`tsconfig.json`).
- **Validação com Zod** nas fronteiras do sistema (env vars hoje;
  formulários e payloads de API no futuro) — `src/lib/validation/`.
- **Variáveis de ambiente**: `.env.example` documenta as chaves
  necessárias sem valores reais; `.env*` está no `.gitignore` (com exceção
  explícita para `.env.example`). Nenhum secret real é commitado.
- **Nenhuma connection string privilegiada no navegador**:
  `src/lib/db/admin.ts` importa `server-only`, o que quebra o build se o
  módulo for alcançado por código client. Componentes/hooks client só
  podem usar `src/lib/db/client.ts`, que fala com o Neon através da Data
  API (JWT do usuário, sujeito a RLS) — nunca com a connection string
  direta.
- **Separação client/server explícita**: `src/lib/db/client.ts` (Data
  API, RLS aplicada) vs. `src/lib/db/admin.ts` (conexão direta, role com
  `BYPASSRLS`), cada um com um único uso pretendido, em vez de um client
  genérico reaproveitado em todo lugar.
- **RLS obrigatório, aplicado a um projeto Neon real (Tarefa 02)**:
  `tenants`, `units`, `memberships`, `profiles` e `audit_log` têm
  `ENABLE` + `FORCE ROW LEVEL SECURITY` desde a migration que as cria, já
  aplicadas ao projeto `klikflow` no Neon. As roles da Data API
  (`authenticated`/`anonymous`) foram confirmadas com `BYPASSRLS = false`
  — RLS de fato se aplica a elas. O desenho das policies foi validado
  ponta a ponta (9 cenários: cross-tenant read/write, auto-promoção de
  role, acesso anônimo) contra um Postgres local antes da migração para
  Neon; ver `docs/database.md` para o detalhe e para a validação
  comportamental ainda pendente contra o Neon real.
- **`tenant_id` nunca é confiado vindo do cliente**: toda política usa
  `is_tenant_member()`/`has_permission()`, que resolvem a associação
  usuário↔tenant e a permissão concedida a partir de `auth.uid()` no
  banco, não de um valor enviado na query.
- **Permissões configuráveis, não um enum fixo (Tarefa 03)**:
  `memberships.role_id` aponta para um Perfil (`roles`) próprio de cada
  tenant, com permissões granulares em `role_permissions`. Nenhum código
  do app decide autorização — tudo é resolvido por `has_permission()` no
  banco.
- **Uma Empresa nunca fica sem dono**: dois triggers em nível de banco
  garantem isso mesmo que uma rota futura esqueça de checar —
  `protect_system_role()` bloqueia renomear/excluir o Perfil de dono, e
  `protect_last_owner_membership()` bloqueia remover ou rebaixar a última
  membership ativa desse Perfil. Testado contra o projeto Neon real (ver
  `docs/database.md`).
- **Criação de tenant via RPC, não INSERT direto**: não existe política
  de INSERT em `tenants`; só a função `create_tenant()` (`SECURITY
  DEFINER`) pode criar um tenant, garantindo que ele nasça sempre com um
  owner. Ver `docs/database.md` para o porquê (inclui um bug real de RLS
  encontrado e corrigido durante esta tarefa).
- **Auditoria não é client-writable**: `audit_log` não tem política de
  INSERT/UPDATE/DELETE para `authenticated`/`anonymous` — só leitura para
  admins do próprio tenant. Escrita será feita futuramente por código de
  servidor usando `src/lib/db/admin.ts` (fora da Data API).
- **Preço/nome do item de pedido nunca vêm do cliente (Tarefa 05)**: a
  trigger `snapshot_order_item()` sempre sobrescreve `product_name` e
  `unit_price` com os valores reais de `products` no momento do INSERT,
  ignorando qualquer valor que o cliente envie — testado enviando um
  preço falso de propósito, e o banco gravou o preço real. Itens não têm
  política de UPDATE/DELETE: são permanentes, preservando o histórico
  mesmo que o produto mude de preço depois.
- **Uma comanda fechada não aceita novos pedidos**: enforced por trigger
  (`check_order_tab_same_tenant_and_open()`), não pelo app.
- **Transições de status de pedido são controladas, não um UPDATE livre
  (Tarefa 06)**: `validate_order_status_transition()` só aceita a
  mudança de `orders.status_id` se existir uma linha correspondente em
  `order_status_transitions` para aquele tenant — testado contra o Neon
  real: uma transição pulando etapas (Aceito → Finalizado) foi
  corretamente bloqueada com exceção. `orders.configure_statuses` é a
  permissão que controla quem pode reconfigurar o fluxo de um tenant.
- **Item de produção só pode ser atualizado por quem tem
  `production.manage` (Tarefa 06)**: `order_item_stations` não tem
  política de INSERT/DELETE para o cliente — as linhas só nascem via
  trigger `seed_order_item_stations()` (a partir de `product_stations`
  do produto), nunca escolhidas livremente pelo cliente.

- **Rota `/app` protegida no servidor, não no cliente (Tarefa 07)**: o
  guard usa `getCurrentUser()` num Server Component e redireciona antes
  de qualquer HTML sensível ser enviado — não é uma checagem client-side
  que poderia ser contornada desabilitando JS.
- **Catálogo por empresa é RLS, não filtro de UI (Tarefa 08)**: o
  `CatalogManager` não recebe uma lista de "tenants permitidos" nem
  decide o que mostrar — ele só sabe o `tenant_id` da empresa do usuário
  logado (resolvido via `memberships`) e delega toda a checagem de
  isolamento e de permissão (`catalog.manage`) para as policies já
  testadas na Tarefa 04. Um usuário sem permissão de escrita recebe o
  erro de RLS na hora de inserir, não uma tela que finge que ele pode.
- **`createDbClient()` nunca usa `createClient(url)` (forma de URL
  única) num Client Component (Tarefa 08)**: essa forma cria seu próprio
  cliente Neon Auth apontando direto pro host do Neon, uma sessão
  paralela e sem cookie à que o login realmente usa (proxy same-origin
  `/api/auth`) — foi exatamente isso que quebrou o catálogo em produção
  logo após o deploy. `src/lib/db/client.ts` usa a forma "external auth
  provider", buscando o JWT em `src/app/api/session-token/route.ts`
  (que lê a sessão no servidor, via `auth.handler()` no endpoint `/token`
  do plugin `jwt`) — nunca o `session.token` de `getSession()`, que é o
  token de sessão opaco do Better Auth, não um JWT.
- **`profiles` é visível para o próprio usuário e para quem divide uma
  empresa com ele, nunca além disso (Tarefa 11)**: a policy nova
  (`profiles_select_tenant_member`) exige uma membership ativa
  compartilhada nos dois lados (`m1.user_id = auth.uid()` e
  `m2.user_id = profiles.id`, mesmo `tenant_id`) — um usuário sem
  nenhuma empresa em comum continua sem conseguir ler o perfil de
  ninguém. `RolesManager`/`MembersManager` não replicam checagem de
  permissão nenhuma no cliente: `roles.manage`/`memberships.manage`
  decidem no banco quem pode escrever, a UI só mostra o erro de RLS se
  a escrita for negada.

## O que ainda não existe (intencionalmente)

- ~~Fluxo de autenticação completo (login/signup)~~ — **fechado na
  Tarefa 07**: UI real (`/login`, `/signup`, `/app`) sobre a
  infraestrutura que já existia desde a Tarefa 01 (proxy
  `src/app/api/auth/[...path]/route.ts`, `src/lib/auth/session.ts`,
  trigger `handle_new_user()`). Confirmado pelo usuário direto no
  celular contra `https://klikflow.vercel.app`: signup, sessão
  protegida em `/app` e logout/login funcionam de ponta a ponta.
- Tela de gestão de Perfis/permissões (convidar usuário, criar Perfil,
  marcar permissões) — o backend (Tarefa 03) está pronto e testado via
  Data API (`10 passed, 0 failed`, ver `docs/database.md`), mas nenhuma
  UI foi criada.
- Tela de catálogo/cardápio (Tarefa 04) — schema pronto e testado via
  HTTP real contra o Neon (`7 passed, 0 failed`, ver `docs/database.md`),
  mas nenhuma UI foi criada.
- Tela de comanda/pedido (Tarefa 05) — schema pronto e testado via SQL
  contra o Neon real; confirmação via HTTP
  (`scripts/test-orders.browser.js`) pendente de execução; nenhuma UI
  criada.
- Tela de produção/status (Tarefa 06) — máquina de transições
  configurável e acompanhamento por Estação de Produção prontos e
  testados via SQL contra o Neon real; confirmação via HTTP
  (`scripts/test-production-status.browser.js`) pendente de execução;
  nenhuma UI criada.

## Checklist para as próximas etapas

- Toda nova tabela de negócio deve nascer com `tenant_id` + política RLS
  na mesma migration (padrão já seguido em `0004_core_multitenancy.sql`).
- Nenhuma rota server deve confiar em dados de tenant vindos do cliente
  sem revalidar contra a sessão autenticada.
- `admin.ts` só deve ser chamado a partir de Route Handlers/Server Actions
  específicas e auditadas — nunca a partir de código que atende
  diretamente uma requisição de usuário final sem checagem de
  autorização própria.
