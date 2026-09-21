# Banco de dados — Tarefas 02, 03 e 04

Schema de multi-tenancy, autenticação, RLS (Tarefa 02), sistema
configurável de perfis/permissões (Tarefa 03) e catálogo/produção/locais
de consumo (Tarefa 04). Vive em `db/migrations/*.sql`, versionado e
aplicado via SQL direto (não há CLI de migrations dedicado no fluxo
atual — ver "Como aplicar" abaixo).

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

As 7 migrations abaixo já foram aplicadas ao projeto `klikflow` (branch
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

Confirmado via `pg_class`/`pg_policies` depois de aplicar as 7
migrations no projeto `klikflow`:

- `relrowsecurity` e `relforcerowsecurity` = `true` nas 13 tabelas
  (`profiles`, `tenants`, `units`, `memberships`, `audit_log`,
  `permissions`, `roles`, `role_permissions`, `categories`, `products`,
  `production_stations`, `product_stations`, `consumption_locations`).
- Roles `authenticated` e `anonymous` da Data API confirmadas com
  `rolbypassrls = false` (RLS realmente se aplica a elas) — diferente da
  role `klikflow_owner`/`klikflow_app`, que tem `BYPASSRLS = true` e não
  pode ser alterada via SQL (limitação da plataforma Neon).
- `auth.uid()` confirmada como função real (`pg_session_jwt`), retornando
  `uuid`.

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

### Comportamental via HTTP real — Tarefa 04 (pendente de confirmação)

`scripts/test-catalog.browser.js` repete os cenários acima via HTTP real
(Data API + JWTs), no mesmo padrão dos scripts anteriores — inclui um
usuário sem membership no tenant tentando ler/escrever no catálogo (deve
ser bloqueado) e a tentativa de anexar uma categoria de outro tenant a um
produto. Rodar do mesmo jeito: `https://klikflow.vercel.app`, F12 →
Console, colar o conteúdo do arquivo.

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
