# Banco de dados — Tarefas 02 a 06

Schema de multi-tenancy, autenticação, RLS (Tarefa 02), sistema
configurável de perfis/permissões (Tarefa 03), catálogo/produção/locais
de consumo (Tarefa 04), o núcleo transacional Comanda + Pedidos
(Tarefa 05) e status de pedido configurável + rastreamento de produção
(Tarefa 06). Vive em `db/migrations/*.sql`, versionado e aplicado via SQL
direto (não há CLI de migrations dedicado no fluxo atual — ver "Como
aplicar" abaixo).

## Provedor: Neon (não Supabase)

Esta tarefa começou desenhada para Supabase e foi re-executada em cima do
**Neon** a pedido do usuário: o plano gratuito da organização já usava os
2 projetos Supabase permitidos, e criar/pausar um deles não foi
autorizado. A arquitetura de multi-tenancy e RLS é a mesma nos dois
provedores — só a peça de infraestrutura por baixo mudou.

Projeto usado: **`klikflow`** (id `hidden-cake-81994840`, região
`aws-sa-east-1`, branch `production`), criado do zero e dedicado só ao
KlikFlow. Um projeto Neon pré-existente do usuário ("Teste doc") foi
inspecionado primeiro e descartado por já conter o schema de outra
aplicação (DocDeck: `companies`, `contracts`, `tenants`, `users`, etc.) —
aplicar ali teria colidido com nomes de tabela de um projeto não
relacionado.

## Peças do Neon usadas

- **Postgres** (a database em si, `klikflow` na branch `production`).
- **Neon Auth** (Managed Better Auth): autenticação hospedada. Usuários
  vivem em `neon_auth."user"` (não em `auth.users` como no Supabase).
- **Neon Data API**: interface REST estilo PostgREST sobre a database,
  autenticada por JWT do Neon Auth. É o que faz `auth.uid()` existir
  dentro do Postgres (via a extensão `pg_session_jwt`) e é o único jeito
  de ter RLS realmente aplicada — conexões diretas com a role
  `klikflow_owner` têm `BYPASSRLS = true` e a Neon não permite removê-lo
  de roles criadas via API.

## Como aplicar as migrations

As 15 migrations abaixo já foram aplicadas ao projeto `klikflow` (branch
`production`) via MCP do Neon (`run_sql_transaction`), na ordem dos
arquivos. Para reaplicar em outro branch/projeto:

```bash
# usando psql, na ordem dos arquivos
for f in db/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
```

Cada migration mistura DDL (tabelas, índices) com DML de segurança
(RLS, policies, grants) no mesmo arquivo — a tabela nasce protegida, nunca
existe um estado intermediário exposto.

## Migrations

| Arquivo | Conteúdo |
|---|---|
| `0001_extensions.sql` | Vazio intencionalmente (placeholder para extensões futuras); `gen_random_uuid()` já é nativo do Postgres 13+. |
| `0002_utility_functions.sql` | `set_updated_at()` — trigger genérico reaproveitado por todas as tabelas. |
| `0003_profiles.sql` | Tabela `profiles` (espelho 1:1 de `neon_auth."user"`), trigger `handle_new_user()` que cria o profile no signup, RLS restrita ao próprio usuário. |
| `0004_core_multitenancy.sql` | `tenants`, `units`, `memberships`, funções `is_tenant_member`/`is_tenant_admin` (esta última substituída na 0006), função `create_tenant()`, e todas as políticas RLS dessas três tabelas. |
| `0005_audit_log.sql` | Tabela `audit_log` append-only, somente leitura para admins do tenant. |
| `0006_permissions_roles.sql` | Tarefa 03: `permissions` (catálogo fixo), `roles` (Perfis configuráveis por tenant), `role_permissions`, função `has_permission()` (substitui `is_tenant_admin`), triggers de proteção (`protect_system_role`, `protect_last_owner_membership`), `memberships.role` (enum fixo) trocado por `memberships.role_id` (FK para `roles`), `create_tenant()` atualizado para criar o Perfil "Proprietário". |
| `0007_catalog.sql` | Tarefa 04: `categories`, `products` (com `price`/`image_url`), `production_stations` (Estação de Produção), `product_stations` (associação produto↔estação), `consumption_locations` (Local de Consumo, sob `units`). 3 novas permissões (`catalog.manage`, `production_stations.manage`, `consumption_locations.manage`) e o trigger `check_product_category_same_tenant`. |
| `0008_tabs_orders.sql` | Tarefa 05: `tabs` (Comanda), `orders` (Pedido, status fixo por enquanto), `order_items` (itens com snapshot de nome/preço). 2 novas permissões (`tabs.manage`, `orders.manage`). Triggers: `check_tab_location_same_tenant`, `check_order_tab_same_tenant_and_open`, `snapshot_order_item` (ignora preço/nome enviados pelo cliente). |
| `0009_production_status.sql` | Tarefa 06: `orders.status` (enum fixo) trocado por `orders.status_id` (FK para `order_statuses`, configurável por tenant); `order_status_transitions` (grafo de transições permitidas); `order_item_stations` (rastreamento de cada item nas Estações de Produção, seedado automaticamente). 2 novas permissões (`orders.configure_statuses`, `production.manage`). `create_tenant()` atualizado para semear o fluxo padrão (Novo→Aceito→Em Produção→Pronto→Entregue→Finalizado, +Cancelado). |
| `0010_default_unit.sql` | Tarefa 09: `create_tenant()` atualizado para semear uma Unidade padrão ("Unidade Principal") — pré-requisito para criar um Local de Consumo, que a tela OPERATIONS desta tarefa precisa. Backfill para tenants já existentes. |
| `0011_profiles_tenant_visibility.sql` | Tarefa 11: nova policy `profiles_select_tenant_member` — libera a leitura do perfil (nome) de quem divide uma empresa com o usuário, além do próprio (`profiles_select_own` continua intocada). Necessário para a tela de Membros mostrar nomes. |
| `0012_order_channels.sql` | Canais de Atendimento (Tarefa 2/N — só schema): `tabs.channel` (`staff`/`qr_code`/`totem`, default `staff`) e `tabs.access_token` (identifica uma Comanda de cliente sem conta), com `tabs_channel_access_token_check` garantindo que só um canal ≠ `staff` tenha token. `tabs.opened_by` vira nullable — uma Comanda de cliente não tem funcionário que a abriu. Nenhuma RPC ou policy nova ainda; comportamento de `staff` inalterado (confirmado: tabs existentes ganharam `channel = 'staff'` sem nenhuma mudança visível). |
| `0013_customer_channel_rpcs.sql` | Canais de Atendimento (Tarefa 3/N): `orders.created_by` vira nullable (mesmo motivo do `opened_by`). 4 funções `SECURITY DEFINER`, concedidas ao role `anonymous` da Data API — `open_customer_tab`, `get_customer_tab`, `create_customer_order`, `add_customer_order_item`. Cada uma valida o `access_token` contra o banco antes de tocar em qualquer linha; nenhuma confia em `tenant_id`/`tab_id`/`order_id` vindo do cliente sem essa prova. Sem policy de RLS nova para `anonymous` — toda escrita do cliente passa por estas RPCs, nunca por INSERT direto. |
| `0014_public_menu_read.sql` | Canais de Atendimento (Tarefa 4/N): primeiro `GRANT SELECT` da história do projeto para `anonymous` — só em `tenants`, `categories`, `products`, `consumption_locations`, e só policies `using (status = 'active')`. `tabs`/`orders`/`order_items` continuam sem nenhum grant para `anonymous`; a única porta de escrita/leitura de pedido do cliente são as RPCs da Tarefa 3/N. |
| `0015_awaiting_payment_status.sql` | Canais de Atendimento (Tarefa 5/N — sem gateway, pagamento no balcão): `default_order_status()` passa a checar o `channel` da Comanda — um Pedido de canal `qr_code`/`totem` nasce em `awaiting_payment` (novo status, sequence 0), um Pedido de canal `staff` continua nascendo em `new` como sempre. `create_tenant()` semeia `awaiting_payment` + transições (`awaiting_payment → new`, `awaiting_payment → cancelled`) para tenants novos; backfill aplicado aos existentes. Nenhuma tabela nova — reaproveita 100% a máquina de status configurável da Tarefa 06. |

## Entidades

- **`profiles`** — dados do usuário (nome). Não carrega `tenant_id`: um
  usuário pode pertencer a mais de um tenant através de `memberships`.
  FK para `neon_auth."user"(id)`.
- **`tenants`** — a Empresa. Campos: `name`, `segment` (apenas
  descritivo — nada no schema ou no app pode ramificar comportamento por
  segmento), `status` (`active`/`suspended`/`archived`, para
  soft-lifecycle em vez de exclusão física).
- **`units`** — a Unidade, pertence a um `tenant_id`.
- **`memberships`** — a peça central do isolamento: liga
  `user_id ↔ tenant_id (↔ unit_id opcional)` com um `role_id` (Perfil).
  Toda política RLS deste schema depende desta tabela, nunca de um
  `tenant_id` enviado pelo cliente.
- **`audit_log`** — trilha de auditoria. `tenant_id` é opcional para
  também comportar futuras entradas de nível de plataforma (SaaS Admin).
- **`permissions`** *(Tarefa 03)* — catálogo global e fixo de ações
  possíveis (`tenant.manage`, `units.manage`, `memberships.manage`,
  `roles.manage`, `audit_log.read`, e desde a Tarefa 04 também
  `catalog.manage`, `production_stations.manage`,
  `consumption_locations.manage`). Só muda via migration, nunca pelo
  tenant.
- **`roles`** *(Tarefa 03)* — os Perfis, configuráveis por Empresa (não
  fixos como "admin"/"garçom"). Cada tenant cria os seus próprios. O
  Perfil "Proprietário" (`is_system = true`) nasce automaticamente com
  `create_tenant()` e nunca pode ser renomeado ou excluído.
- **`role_permissions`** *(Tarefa 03)* — liga um Perfil às Permissões que
  ele concede.
- **`categories`** *(Tarefa 04)* — categorias de produto, por tenant.
- **`products`** *(Tarefa 04)* — `price` (`numeric(10,2)`, sempre ≥ 0),
  `image_url` (texto — nenhuma integração de upload nesta etapa),
  `category_id` opcional. Guarda o preço **atual**; um pedido (Tarefa 05)
  deve gravar o preço no momento da compra no próprio item, nunca
  reconsultar `products` depois (ver princípio de histórico em
  `docs/security.md`).
- **`production_stations`** *(Tarefa 04)* — Estação de Produção
  (ex: Chapa, Forno, Confeitaria, Expedição), por tenant.
- **`product_stations`** *(Tarefa 04)* — associação produto ↔ estação(s),
  com `sequence` para o produto passar por várias estações em ordem.
- **`consumption_locations`** *(Tarefa 04)* — Local de Consumo (Mesa 01,
  Balcão 02, Quarto 103...). Pertence a uma `unit`, não diretamente ao
  tenant — reflete a hierarquia Tenant → Unit → Local de Consumo.
- **`tabs`** *(Tarefa 05)* — a Comanda: agrupa o consumo de um Local de
  Consumo entre a abertura e o fechamento (`status`: `open`/`closed`).
  Um índice único garante no máximo uma comanda `open` por Local de
  Consumo por vez.
- **`orders`** *(Tarefa 05, `status` trocado por `status_id` na Tarefa
  06)* — o Pedido, pertence a uma `tab`. `status_id` aponta para
  `order_statuses`, configurável por tenant (ver abaixo).
- **`order_items`** *(Tarefa 05)* — os itens do pedido. `product_name` e
  `unit_price` são um **snapshot** do produto no instante da compra,
  gravado por uma trigger que ignora qualquer valor enviado pelo
  cliente — nunca reflete uma mudança de preço/nome posterior em
  `products` (ver princípio de histórico, seção 26 da direção mestre).
  Sem política de UPDATE/DELETE: um item lançado é permanente.
- **`order_statuses`** *(Tarefa 06)* — os status possíveis de um
  Pedido, configuráveis por tenant (não mais um enum fixo). `sequence`
  define o status inicial de um pedido novo; `is_terminal` marca um
  status do qual não deveria mais sair transição (ex: Finalizado,
  Cancelado). `create_tenant()` semeia o fluxo padrão descrito na
  direção mestre (Novo → Aceito → Em Produção → Pronto → Entregue →
  Finalizado, + Cancelado a partir de qualquer status não-terminal); o
  tenant pode reconfigurar depois via `orders.configure_statuses`.
- **`order_status_transitions`** *(Tarefa 06)* — o grafo de transições
  permitidas entre `order_statuses`. Uma trigger em `orders` rejeita
  qualquer mudança de `status_id` que não tenha uma linha correspondente
  aqui — é isso que torna as transições **controladas**, não um `UPDATE`
  livre (ver seção 14 da direção mestre: "um usuário não poderá
  simplesmente alterar qualquer status sem possuir autorização").
- **`order_item_stations`** *(Tarefa 06)* — acompanha cada item do
  pedido passando pelas Estações de Produção associadas ao produto
  (`product_stations`, Tarefa 04). Semeado automaticamente quando o item
  é criado, com `status` inicial `pending`; nenhuma política de
  INSERT/DELETE — as linhas só existem via a trigger de seed.

### De `memberships.role` (Tarefa 02) para `memberships.role_id` (Tarefa 03)

Na Tarefa 02, `role` era um `check` fixo (`owner`/`manager`/`staff`) — o
mínimo que a RLS precisava até existir um sistema de verdade. A Tarefa 03
substitui isso pelo sistema descrito na direção mestre do projeto
("Usuário → Perfil → Permissões → Função"): `memberships.role` virou
`memberships.role_id`, apontando para um Perfil configurável em `roles`,
com granularidade fina via `role_permissions`. Nenhuma tabela de negócio
futura (produtos, pedidos, pagamentos) deve voltar a usar um enum de
"papel" fixo — deve ganhar sua própria permissão em `permissions` e ser
checada com `has_permission()`.

## Multi-tenancy

Nenhuma tabela expõe `tenant_id` para decisão de acesso vinda do
cliente. Toda política de SELECT/INSERT/UPDATE/DELETE usa
`is_tenant_member(tenant_id)` ou `is_tenant_admin(tenant_id)`, funções
`SECURITY DEFINER` que resolvem a associação a partir de `auth.uid()` —
nunca a partir de um valor enviado na query.

```sql
is_tenant_member(target_tenant_id)          → existe membership ativa de auth.uid() nesse tenant?
has_permission(target_tenant_id, perm_key)  → o Perfil da membership ativa de auth.uid() nesse
                                                tenant concede essa permissão? (substitui is_tenant_admin)
```

`auth.uid()`, no Neon, é fornecida pela extensão `pg_session_jwt` — a
mesma peça que a Neon Data API usa para verificar o JWT assinado pelo
Neon Auth e popular a sessão Postgres. Retorna `uuid`, extraído do claim
`sub` do JWT — comportamento idêntico ao `auth.uid()` do Supabase, o que
tornou a portabilidade das policies quase 1:1.

## Criação de tenant: por que uma função RPC, não um INSERT direto

Não existe política de INSERT em `tenants`. A criação passa por
`create_tenant(tenant_name, tenant_segment)`, uma função `SECURITY
DEFINER` que insere o tenant e a membership de owner na mesma transação
e retorna a linha diretamente. Dois motivos, descobertos durante os
testes desta tarefa (contra Postgres puro, antes da migração para Neon —
o comportamento do Postgres aqui é idêntico):

1. **Atomicidade** — tenant e membership de owner nascem juntos; não deve
   existir um instante em que o tenant exista sem dono.
2. **`INSERT ... RETURNING` reavalia a política de SELECT.** O padrão
   inicial (INSERT direto em `tenants` + trigger `AFTER INSERT` criando a
   membership) falhava com *"new row violates row-level security policy
   for table tenants"* sempre que a query pedia `RETURNING` — que é
   exatamente o que a Data API gera para `.insert(...).select()`. O
   Postgres verifica a política de SELECT sobre a linha retornada dentro
   do mesmo statement, e a membership criada por um trigger `AFTER
   INSERT` não é enxergada a tempo por essa verificação. Colocar os dois
   inserts dentro de uma função `SECURITY DEFINER` elimina o problema.

## Sistema de permissões (Tarefa 03)

```
Usuário → Membership → Perfil (role) → Permissões (permission_key)
```

- Cada tenant tem seus próprios Perfis (`roles`), nunca um catálogo fixo
  de cargos globais.
- `create_tenant()` sempre cria o Perfil "Proprietário" (`is_system =
  true`) com **todas** as permissões do catálogo, e a membership do
  criador aponta pra esse Perfil.
- Quem tem a permissão `roles.manage` pode criar outros Perfis (ex:
  "Gerente", "Caixa") e escolher quais permissões cada um concede, via
  INSERT/UPDATE/DELETE normais em `roles`/`role_permissions` pela Data
  API — não precisou de nenhuma função RPC extra, porque diferente da
  criação de tenant, quem cria um Perfil novo já é membro do tenant (a
  policy de SELECT em `roles` já enxerga a linha recém-criada via
  `INSERT ... RETURNING` sem o problema de timing descrito acima).

### Duas proteções contra a Empresa ficar sem dono

1. **`protect_system_role()`** (trigger em `roles`) — bloqueia
   `UPDATE`/`DELETE` que renomeie ou apague um Perfil `is_system`.
2. **`protect_last_owner_membership()`** (trigger em `memberships`) —
   antes de excluir uma membership, ou trocar seu `role_id`/`status`,
   verifica se ela é a última membership ativa com o Perfil de dono do
   tenant; se for, bloqueia com uma exceção. Vale tanto para o próprio
   dono tentando sair/se rebaixar quanto para outro admin tentando
   removê-lo.

Essas duas proteções rodam no banco, não no app — nenhuma tela ou rota
futura consegue contornar isso, mesmo sem checagem própria.

## Auth

- `neon_auth."user"` (gerenciado pelo Neon Auth) dispara
  `handle_new_user()` via trigger `on_auth_user_created`, criando a linha
  correspondente em `public.profiles`.
- Nenhuma tela de login/signup foi criada nesta tarefa — isso pertence às
  experiências de produto (Customer/Operations/Management), fora do
  escopo da fundação de dados. O que existe é só a infraestrutura:
  `src/app/api/auth/[...path]/route.ts` (proxy obrigatório da API do Neon
  Auth) e `src/lib/auth/server.ts` + `src/lib/auth/session.ts`
  (`getCurrentUser()`).

## RLS — resumo por tabela

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | dono (`id = auth.uid()`) | — (só via trigger) | dono | — |
| `tenants` | membro | — (só via `create_tenant()`) | `tenant.manage` | — (arquivar via `status`) |
| `units` | membro | `units.manage` | `units.manage` | `units.manage` |
| `memberships` | membro | `memberships.manage`\* | `memberships.manage`\* | `memberships.manage`\* |
| `audit_log` | `audit_log.read` | — (só via `src/lib/db/admin.ts`, fora da Data API) | — | — |
| `permissions` | qualquer autenticado | — (só migration) | — | — |
| `roles` | membro | `roles.manage`\* | `roles.manage`\*\* | `roles.manage`\*\* |
| `role_permissions` | membro (via `roles.tenant_id`) | `roles.manage` (via `roles.tenant_id`) | — | `roles.manage` (via `roles.tenant_id`) |
| `categories` | membro | `catalog.manage` | `catalog.manage` | `catalog.manage` |
| `products` | membro | `catalog.manage`\*\*\* | `catalog.manage`\*\*\* | `catalog.manage` |
| `production_stations` | membro | `production_stations.manage` | `production_stations.manage` | `production_stations.manage` |
| `product_stations` | membro (via `products.tenant_id`) | `catalog.manage` (via `products.tenant_id`) | `catalog.manage` (via `products.tenant_id`) | `catalog.manage` (via `products.tenant_id`) |
| `consumption_locations` | membro (via `units.tenant_id`) | `consumption_locations.manage` (via `units.tenant_id`) | `consumption_locations.manage` (via `units.tenant_id`) | `consumption_locations.manage` (via `units.tenant_id`) |
| `tabs` | membro | `tabs.manage`\*\*\*\* | `tabs.manage`\*\*\*\* | — (fecha via `status`) |
| `orders` | membro | `orders.manage`\*\*\*\*\* | `orders.manage` | — (cancela via `status`) |
| `order_items` | membro (via `orders.tenant_id`) | `orders.manage` (via `orders.tenant_id`)\*\*\*\*\*\* | — (imutável) | — (imutável) |
| `order_statuses` | membro | `orders.configure_statuses` | `orders.configure_statuses` | `orders.configure_statuses`\*\*\*\*\*\*\* |
| `order_status_transitions` | membro | `orders.configure_statuses` | — | `orders.configure_statuses` |
| `order_item_stations` | membro (via `order_items`→`orders.tenant_id`) | — (só via trigger de seed) | `production.manage` (via `order_items`→`orders.tenant_id`) | — |

\*\*\*\*\*\*\* um status em uso por algum pedido não pode ser excluído — o FK
`orders.status_id` não tem `on delete cascade`.

\*\*\*\* também sujeito a `check_tab_location_same_tenant()` — o Local de
Consumo de uma comanda precisa ser do mesmo tenant; e a um índice único
que impede duas comandas `open` no mesmo Local de Consumo.
\*\*\*\*\* também sujeito a `check_order_tab_same_tenant_and_open()` — a
comanda de um pedido precisa ser do mesmo tenant e estar `open` (só na
criação).
\*\*\*\*\*\* também sujeito a `snapshot_order_item()` — grava
`product_name`/`unit_price` a partir do produto real, ignorando o que o
cliente enviar, e valida que o produto é do mesmo tenant do pedido.

\*\*\* também sujeito a `check_product_category_same_tenant()` — a
`category_id` de um produto precisa pertencer ao mesmo tenant do produto.

\* também sujeito a `protect_last_owner_membership()` — nunca deixa o
último dono ser removido/rebaixado, mesmo por quem tem `memberships.manage`.
\*\* também sujeito a `protect_system_role()` — o Perfil `is_system` nunca
pode ser renomeado nem excluído, mesmo por quem tem `roles.manage`.

O role `anonymous` (usuário não autenticado da Data API) não recebe
nenhum `GRANT` nessas tabelas — o acesso falha antes de sequer chegar à
checagem de RLS.

## Validação

### Estrutural (feita contra o projeto Neon real)

Confirmado via `pg_class`/`pg_policies` depois de aplicar as 9
migrations no projeto `klikflow`:

- `relrowsecurity` e `relforcerowsecurity` = `true` nas 19 tabelas
  (`profiles`, `tenants`, `units`, `memberships`, `audit_log`,
  `permissions`, `roles`, `role_permissions`, `categories`, `products`,
  `production_stations`, `product_stations`, `consumption_locations`,
  `tabs`, `orders`, `order_items`, `order_statuses`,
  `order_status_transitions`, `order_item_stations`).
- Roles `authenticated` e `anonymous` da Data API confirmadas com
  `rolbypassrls = false` (RLS realmente se aplica a elas) — diferente da
  role `klikflow_owner`/`klikflow_app`, que tem `BYPASSRLS = true` e não
  pode ser alterada via SQL (limitação da plataforma Neon).
- `auth.uid()` confirmada como função real (`pg_session_jwt`), retornando
  `uuid`.

### Comportamental — Tarefa 06 (simulado via SQL, `klikflow_owner`)

Fluxo completo testado contra o Neon real: pedido criado **sem
`status_id` explícito** → a trigger `default_order_status()` atribuiu
sozinha o status de menor `sequence` ("Novo"); item de pedido criado →
`order_item_stations` seedado automaticamente com a estação "Cozinha"
em `pending`. Depois:

1. Transição válida (Novo → Aceito, com transição cadastrada) → aceita
   normalmente. ✅
2. Transição **sem** linha em `order_status_transitions` (tentar voltar
   de Aceito para Novo) → bloqueada por
   `validate_order_status_transition()` com *"transition from ... to ...
   is not allowed for this tenant"*. ✅
3. Atualização de `order_item_stations.status` para `done` → aceita
   normalmente (simulando o operador da Cozinha marcando o item pronto).
   ✅

### Comportamental via HTTP real — Tarefa 06 (pendente de confirmação)

`scripts/test-production-status.browser.js` repete os cenários acima via
HTTP real — inclui criar um pedido sem informar status, tentar pular uma
etapa do fluxo (bloqueado) e marcar um item como concluído numa estação.
Rodar do mesmo jeito de sempre, lembrando de atualizar o cache de schema
da Data API antes.

### Comportamental — Tarefa 05 (simulado via SQL, `klikflow_owner`)

Fluxo completo testado contra o Neon real: comanda aberta num Local de
Consumo → pedido lançado na comanda → item de pedido criado. Depois:

1. **Snapshot de preço confirmado de verdade**: o item ficou com
   `unit_price = 12.00`; o preço do produto foi alterado para `20.00`
   depois; reconsultando o item, ele continua em `12.00`. ✅
2. Tentativa de abrir uma **segunda comanda** no mesmo Local de Consumo
   → bloqueada pelo índice único `tabs_one_open_per_location_idx`. ✅
3. Tentativa de lançar um **pedido numa comanda fechada** → bloqueada
   por `check_order_tab_same_tenant_and_open()` com *"cannot add an
   order to a closed tab"*. ✅
4. Tentativa de criar um **item de pedido usando produto de outro
   tenant** → bloqueada por `snapshot_order_item()` com *"product must
   belong to the same tenant as the order"*. ✅

### Comportamental via HTTP real — Tarefa 05 (pendente de confirmação)

`scripts/test-orders.browser.js` repete os cenários acima via HTTP real,
incluindo uma tentativa explícita do cliente de **mentir o preço e o
nome do item** (`unit_price: 0.01`, `product_name: "Free beer"`) — o
teste confirma que a trigger ignora esses valores e grava o preço/nome
reais do produto. Rodar do mesmo jeito de sempre, e **lembrar de
atualizar o cache de schema da Data API antes** (ver
`docs/development.md`).

### Comportamental — Tarefa 04 (simulado via SQL, `klikflow_owner`)

Fluxo completo criado numa transação real contra o projeto Neon
(sem rollback desta vez, dados removidos depois): Unidade → Categoria →
Produto (com preço) → Estação de Produção → associação produto↔estação
(com `sequence`) → Local de Consumo sob a Unidade. Tudo criado
corretamente, com os relacionamentos certos. ✅

Testei também a proteção cross-tenant: tentar criar um produto no
Tenant B usando uma categoria do Tenant A → bloqueado por
`check_product_category_same_tenant()` com *"category must belong to
the same tenant as the product"*, e a transação inteira desfeita. ✅

### Comportamental via HTTP real — Tarefa 04

`scripts/test-catalog.browser.js` repete os cenários acima via HTTP real
(Data API + JWTs), no mesmo padrão dos scripts anteriores — inclui um
usuário sem membership no tenant tentando ler/escrever no catálogo (deve
ser bloqueado) e a tentativa de anexar uma categoria de outro tenant a um
produto.

**Achado operacional importante:** a primeira execução deu `3 passed, 4
failed`, com erro `"Could not find the table 'public.products' in the
schema cache"`. Não era bug de RLS nem do código — a **Neon Data API
cacheia o schema do banco**, e como a migration foi aplicada via SQL
direto (MCP), não pelo Console do Neon, o cache não foi atualizado
automaticamente. Resolvido chamando o refresh do cache (`update_data_api`
via MCP, equivalente ao botão "Refresh schema cache" no painel). Depois
disso, nova execução: `7 passed, 0 failed`.

**Regra para as próximas tarefas:** sempre que uma migration criar/alterar
tabelas expostas pela Data API, atualizar o cache do schema logo em
seguida (painel do Neon → Data API → "Refresh schema cache", ou o
equivalente via MCP/API) antes de testar via HTTP — senão os erros de
"tabela não encontrada" parecem um bug de RLS/policy quando na verdade
são só cache desatualizado.

**A Tarefa 04 está fechada de ponta a ponta.**

### Comportamental — Tarefa 03 (simulado via SQL, `klikflow_owner`)

Antes de aplicar em produção, os triggers de proteção foram exercitados
de verdade contra o projeto Neon real, dentro de transações (cada
tentativa inválida aborta a transação inteira — nada fica persistido):

1. `create_tenant()` simulado manualmente (mesmos INSERTs, com
   `ROLLBACK` no final): tenant + Perfil "Proprietário" (`is_system =
   true`) + as 5 permissões do catálogo + membership com esse
   `role_id` — tudo criado corretamente. ✅
2. Tentativa de `UPDATE roles SET name = 'Hackeado' ... WHERE is_system`
   → bloqueada por `protect_system_role()`. ✅
3. Tentativa de `DELETE` no Perfil `is_system` → bloqueada. ✅
4. Tentativa de `DELETE` na única membership ativa de um tenant (o dono)
   → bloqueada por `protect_last_owner_membership()` com *"cannot remove
   the last owner of a tenant"*. ✅

### Comportamental via HTTP real

`scripts/test-permissions.browser.js` repete os cenários acima, mas via
HTTP de verdade (Data API + JWTs reais), no mesmo padrão dos scripts de
isolamento da Tarefa 02 — dois usuários reais, um Perfil customizado
("Caixa") criado com uma única permissão, e as tentativas de
auto-rebaixamento/auto-remoção do último dono.

**Status: executado com sucesso contra o Neon real.**

```
Result: 10 passed, 0 failed
```

Confirmado via o Console do navegador em `https://klikflow.vercel.app`:
Perfil "Proprietário" nasce com as 5 permissões; um Perfil "Caixa"
customizado com só `audit_log.read` conseguiu ler a auditoria mas foi
bloqueado ao tentar renomear o tenant e criar uma unidade; o dono não
conseguiu se auto-rebaixar nem se auto-remover (última proteção). Os
dados de teste (2 tenants, 4 usuários) foram removidos do banco depois —
tivemos que desabilitar temporariamente os próprios triggers de proteção
para a limpeza, o que por si só confirmou que eles bloqueiam até
exclusões em cascata (`DELETE` de usuário → cascade em `memberships` →
trigger ainda impedindo remover o último dono).

**A Tarefa 03 está fechada de ponta a ponta.**

### Comportamental (isolamento entre tenants)

O desenho de RLS foi testado ponta a ponta com usuários reais **antes**
da migração para Neon, contra um Postgres 16 local simulando o
`auth.uid()` do Supabase (9 cenários: leitura/escrita cross-tenant,
auto-promoção de role, bypass de RPC, acesso anônimo — todos bloqueados
corretamente). A lógica das policies não mudou ao portar para Neon.

O ambiente onde a Tarefa 02 foi implementada tem uma política de rede de
saída restrita a uma allowlist que não inclui o host da Neon Auth/Data
API deste projeto — chamadas HTTP de ponta a ponta contra o Neon real não
podiam ser feitas de lá. Dois scripts repetem os mesmos 9 cenários via
HTTP real (Neon Auth + Data API), pensados para rodar fora dessa
restrição:

- `scripts/test-tenant-isolation.sh` — via `curl`, para quem tem
  terminal/Git Bash.
- `scripts/test-tenant-isolation.browser.js` — a mesma coisa em
  `fetch()`, para colar no Console do navegador (F12) em
  `https://klikflow.vercel.app`, sem precisar instalar nada. Esse domínio
  foi adicionado aos trusted origins do Neon Auth para isso funcionar.

Cada cenário imprime `OK` ou `FAIL` e o script termina com o total.

**Status: executado com sucesso contra o Neon real.** Rodado via o
script de navegador em `https://klikflow.vercel.app`, com dois usuários
reais criados pelo Neon Auth e JWTs reais (não simulados) contra a Data
API:

```
Result: 9 passed, 0 failed
```

Os 9 cenários (leitura/escrita cross-tenant, alteração indevida,
insert direto bloqueado, acesso anônimo bloqueado) se confirmaram
idênticos ao que já tinha sido validado localmente durante o desenho do
schema. **A Tarefa 02 está fechada de ponta a ponta**, incluindo a
validação comportamental que ficara pendente.

## Credenciais geradas nesta tarefa

- Role `klikflow_owner` (dono do projeto, criada automaticamente pelo
  Neon) — usada para aplicar as migrations e para `src/lib/db/admin.ts`.
- Role `klikflow_app` foi criada durante a investigação mas **não é
  usada** — descoberta de que toda role criada via API do Neon vem com
  `BYPASSRLS = true` sem forma de remover via SQL, então uma role de
  aplicação "sem privilégio" não cumpre o papel que teria no Supabase.
  Pode ser removida numa limpeza futura.
- Nenhuma credencial real foi commitada. `.env.local` (fora do Git) tem
  os valores reais deste projeto; `.env.example` documenta as chaves sem
  valores.
