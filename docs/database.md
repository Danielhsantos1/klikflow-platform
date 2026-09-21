# Banco de dados — Tarefa 02

Schema inicial de multi-tenancy, autenticação e RLS. Vive em
`supabase/migrations/*.sql`, versionado e aplicado via Supabase CLI —
nunca editado manualmente em produção.

## Por que ainda não está aplicado a um projeto Supabase

O plano gratuito da organização já usa os 2 projetos ativos permitidos
(`igreja360`, `unha-marcada`); criar ou reativar um terceiro exigiria
pausar um deles, o que não foi autorizado nesta etapa. As migrations
abaixo estão prontas para aplicar assim que houver um projeto disponível
(`supabase link` + `supabase db push`, ou colando o SQL no SQL Editor do
Supabase Studio).

## Como foram validadas sem um projeto Supabase

Sem projeto remoto e sem Docker disponível neste ambiente (`supabase
start` não roda), o schema foi validado contra um Postgres 16 local, com
um schema `auth` mínimo simulando `auth.users` e `auth.uid()` (lendo o
claim `request.jwt.claim.sub`, como o PostgREST do Supabase faz de
verdade). Isso permitiu testar as políticas de RLS com usuários reais,
não só ler o SQL. Ver seção "Testes de segurança executados".

## Migrations

| Arquivo | Conteúdo |
|---|---|
| `0001_extensions.sql` | Vazio intencionalmente (placeholder para extensões futuras); `gen_random_uuid()` já é nativo do Postgres 13+. |
| `0002_utility_functions.sql` | `set_updated_at()` — trigger genérico reaproveitado por todas as tabelas. |
| `0003_profiles.sql` | Tabela `profiles` (espelho 1:1 de `auth.users`), trigger `handle_new_user()` que cria o profile no signup, RLS restrita ao próprio usuário. |
| `0004_core_multitenancy.sql` | `tenants`, `units`, `memberships`, funções `is_tenant_member`/`is_tenant_admin`, função `create_tenant()`, e todas as políticas RLS dessas três tabelas. |
| `0005_audit_log.sql` | Tabela `audit_log` append-only, somente leitura para admins do tenant. |

## Entidades

- **`profiles`** — dados do usuário (nome). Não carrega `tenant_id`: um
  usuário pode pertencer a mais de um tenant através de `memberships`.
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

Ambas são `SECURITY DEFINER` para poderem ser chamadas de dentro da
própria política de `memberships` sem recursão: a função roda com o
privilégio do owner (bypassa RLS), enquanto `auth.uid()` continua
refletindo a sessão de quem chamou.

## Criação de tenant: por que uma função RPC, não um INSERT direto

Não existe política de INSERT em `tenants`. A criação passa por
`create_tenant(tenant_name, tenant_segment)`, uma função `SECURITY
DEFINER` que insere o tenant e a membership de owner na mesma transação
e retorna a linha diretamente. Dois motivos, descobertos durante os
testes desta tarefa (não apenas teóricos):

1. **Atomicidade** — tenant e membership de owner nascem juntos; não deve
   existir um instante em que o tenant exista sem dono.
2. **`INSERT ... RETURNING` reavalia a política de SELECT.** O padrão
   inicial (INSERT direto em `tenants` + trigger `AFTER INSERT` criando a
   membership) falhava com *"new row violates row-level security policy
   for table tenants"* sempre que a query pedia `RETURNING` — que é
   exatamente o que `supabase-js` gera para `.insert(...).select()`. O
   Postgres verifica a política de SELECT sobre a linha retornada dentro
   do mesmo statement, e a membership criada por um trigger `AFTER
   INSERT` não é enxergada a tempo por essa verificação. Colocar os dois
   inserts dentro de uma função `SECURITY DEFINER` elimina o problema:
   ela bypassa RLS internamente e devolve a linha já conhecida, sem
   depender de um `RETURNING` verificado por política.

## Auth

- `auth.users` (gerenciado pelo Supabase Auth) dispara
  `handle_new_user()` via trigger `on_auth_user_created`, criando a linha
  correspondente em `public.profiles`.
- Nenhuma tela de login/signup foi criada nesta tarefa — isso pertence às
  experiências de produto (Customer/Operations/Management), fora do
  escopo da fundação de dados.
- `src/lib/auth/session.ts` (Tarefa 01) já expõe `getCurrentUser()` para
  ler a sessão no servidor; nada mudou nele.

## RLS — resumo por tabela

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | dono (`id = auth.uid()`) | — (só via trigger) | dono | — |
| `tenants` | membro | — (só via `create_tenant()`) | admin do tenant | — (arquivar via `status`) |
| `units` | membro | admin do tenant | admin do tenant | admin do tenant |
| `memberships` | membro | admin do tenant | admin do tenant | admin do tenant |
| `audit_log` | admin do tenant | — (só service role) | — | — |

`anon` não recebe nenhum `GRANT` nessas tabelas — o acesso falha antes de
sequer chegar à checagem de RLS.

## Testes de segurança executados

Script local (não commitado — vive fora do repositório) simulando dois
tenants e três usuários contra o Postgres local com o stub de `auth`:

1. Usuário A cria o Tenant A via `create_tenant()` e vira `owner`
   automaticamente. ✅
2. Usuário B cria o Tenant B; só enxerga seu próprio tenant
   (`count(*) = 1`). ✅
3. Usuário B não enxerga as `units` do Tenant A (`count(*) = 0`). ✅
4. Usuário B tenta `UPDATE` no Tenant A → `UPDATE 0` (nenhuma linha
   afetada); nome do Tenant A permanece intacto. ✅
5. Usuário B tenta `INSERT` uma `unit` diretamente no Tenant A →
   bloqueado (`insufficient_privilege`, RLS). ✅
6. `staff-a` (membro não-admin do Tenant A) tenta se auto-promover a
   `owner` via `UPDATE memberships` → 0 linhas afetadas (bloqueado por
   RLS, não por erro de permissão de coluna). ✅
7. `staff-a` tenta criar uma `unit` (ação de admin) → bloqueado. ✅
8. Um usuário autenticado tenta `INSERT` direto em `tenants` (contornando
   `create_tenant()`) → bloqueado por falta de `GRANT`/política. ✅
9. `anon` (sem sessão) tenta ler `tenants` e `memberships` → bloqueado
   antes mesmo da RLS, por falta de `GRANT`. ✅

Todos os 9 cenários passaram no ambiente de teste local.

## Limitação conhecida

Os testes acima rodaram contra um Postgres genérico com um `auth` stub,
não contra o Supabase gerenciado real. O comportamento de RLS testado
(GRANT, `SECURITY DEFINER`, `auth.uid()` via `current_setting`) é
exatamente o que o PostgREST do Supabase usa em produção, mas a validação
final "de verdade" — aplicar em um projeto Supabase real e repetir os
mesmos 9 cenários via `supabase-js` — ainda está pendente até haver um
projeto disponível.
