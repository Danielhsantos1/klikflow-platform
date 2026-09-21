# Banco de dados — Tarefa 02

Schema inicial de multi-tenancy, autenticação e RLS. Vive em
`db/migrations/*.sql`, versionado e aplicado via SQL direto (não há CLI
de migrations dedicado no fluxo atual — ver "Como aplicar" abaixo).

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

As 5 migrations abaixo já foram aplicadas ao projeto `klikflow` (branch
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
| `0004_core_multitenancy.sql` | `tenants`, `units`, `memberships`, funções `is_tenant_member`/`is_tenant_admin`, função `create_tenant()`, e todas as políticas RLS dessas três tabelas. |
| `0005_audit_log.sql` | Tabela `audit_log` append-only, somente leitura para admins do tenant. |

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
  `user_id ↔ tenant_id (↔ unit_id opcional)` com um `role`
  (`owner`/`manager`/`staff`). Toda política RLS deste schema depende
  desta tabela, nunca de um `tenant_id` enviado pelo cliente.
- **`audit_log`** — trilha de auditoria. `tenant_id` é opcional para
  também comportar futuras entradas de nível de plataforma (SaaS Admin).

### Sobre `role` em `memberships`

`role` é um `check` fixo (`owner`, `manager`, `staff`) — o mínimo que a
RLS desta tarefa precisa. A Tarefa 03 (Usuários + Perfis + Permissões)
deverá introduzir o sistema configurável de perfis/permissões descrito na
direção mestre do projeto; este campo é o que existe até lá, não a
solução final.

## Multi-tenancy

Nenhuma tabela expõe `tenant_id` para decisão de acesso vinda do
cliente. Toda política de SELECT/INSERT/UPDATE/DELETE usa
`is_tenant_member(tenant_id)` ou `is_tenant_admin(tenant_id)`, funções
`SECURITY DEFINER` que resolvem a associação a partir de `auth.uid()` —
nunca a partir de um valor enviado na query.

```sql
is_tenant_member(target_tenant_id) → existe membership ativa de auth.uid() nesse tenant?
is_tenant_admin(target_tenant_id)  → idem, com role in ('owner', 'manager')
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
| `tenants` | membro | — (só via `create_tenant()`) | admin do tenant | — (arquivar via `status`) |
| `units` | membro | admin do tenant | admin do tenant | admin do tenant |
| `memberships` | membro | admin do tenant | admin do tenant | admin do tenant |
| `audit_log` | admin do tenant | — (só via `src/lib/db/admin.ts`, fora da Data API) | — | — |

O role `anonymous` (usuário não autenticado da Data API) não recebe
nenhum `GRANT` nessas tabelas — o acesso falha antes de sequer chegar à
checagem de RLS.

## Validação

### Estrutural (feita contra o projeto Neon real)

Confirmado via `pg_class`/`pg_policies` depois de aplicar as 5
migrations no projeto `klikflow`:

- `relrowsecurity` e `relforcerowsecurity` = `true` nas 5 tabelas.
- 13 policies no total, distribuídas exatamente como na tabela acima
  (`profiles`: 2, `tenants`: 2, `units`: 4, `memberships`: 4,
  `audit_log`: 1).
- Roles `authenticated` e `anonymous` da Data API confirmadas com
  `rolbypassrls = false` (RLS realmente se aplica a elas) — diferente da
  role `klikflow_owner`/`klikflow_app`, que tem `BYPASSRLS = true` e não
  pode ser alterada via SQL (limitação da plataforma Neon).
- `auth.uid()` confirmada como função real (`pg_session_jwt`), retornando
  `uuid`.

### Comportamental (isolamento entre tenants)

O desenho de RLS foi testado ponta a ponta com usuários reais **antes**
da migração para Neon, contra um Postgres 16 local simulando o
`auth.uid()` do Supabase (9 cenários: leitura/escrita cross-tenant,
auto-promoção de role, bypass de RPC, acesso anônimo — todos bloqueados
corretamente). A lógica das policies não mudou ao portar para Neon.

O ambiente onde a Tarefa 02 foi implementada tem uma política de rede de
saída restrita a uma allowlist que não inclui o host da Neon Auth/Data
API deste projeto — chamadas HTTP de ponta a ponta contra o Neon real não
podiam ser feitas de lá. Por isso, `scripts/test-tenant-isolation.sh`
repete os mesmos 9 cenários via `curl` puro contra a Neon Auth e a Data
API reais, pensado para rodar de uma máquina com rede normal:

```bash
chmod +x scripts/test-tenant-isolation.sh
./scripts/test-tenant-isolation.sh
```

Ele cria dois usuários de teste (emails com timestamp, nunca colidem),
cria um tenant para cada um via `create_tenant()`, e tenta os mesmos
ataques cross-tenant de antes — agora através da Data API com JWTs reais,
não mais via SQL cru. Cada cenário imprime `OK` ou `FAIL` e o script
termina com o total.

**Status:** script escrito e com sintaxe validada (`bash -n`), mas ainda
não executado contra o Neon real — pendente de rodar a partir de um
ambiente sem a restrição de rede acima. Assim que rodar com sucesso (9/9
`OK`), a Tarefa 02 pode ser considerada fechada de ponta a ponta.

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
