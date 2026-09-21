# Segurança

## Princípios adotados desde a fundação

- **TypeScript strict** ligado desde o início (`tsconfig.json`).
- **Validação com Zod** nas fronteiras do sistema (env vars hoje;
  formulários e payloads de API no futuro) — `src/lib/validation/`.
- **Variáveis de ambiente**: `.env.example` documenta as chaves
  necessárias sem valores reais; `.env*` está no `.gitignore` (com exceção
  explícita para `.env.example`). Nenhum secret real é commitado.
- **Nenhuma Service Role Key no navegador**: `src/lib/supabase/admin.ts`
  importa `server-only`, o que quebra o build se o módulo for alcançado
  por código client. Componentes/hooks client só podem usar
  `src/lib/supabase/client.ts`, que carrega apenas a anon key.
- **Separação client/server explícita**: três entradas diferentes para o
  Supabase (`client.ts`, `server.ts`, `admin.ts`), cada uma com um único
  uso pretendido, em vez de um client genérico reaproveitado em todo
  lugar.
- **RLS obrigatório e testado (Tarefa 02)**: `tenants`, `units`,
  `memberships`, `profiles` e `audit_log` têm `ENABLE` + `FORCE ROW LEVEL
  SECURITY` desde a migration que as cria. Isolamento entre tenants foi
  validado com um Postgres local simulando dois tenants e três usuários —
  ver `docs/database.md` para o detalhe dos 9 cenários testados
  (cross-tenant read/write, auto-promoção de role, acesso anônimo).
- **`tenant_id` nunca é confiado vindo do cliente**: toda política usa
  `is_tenant_member()`/`is_tenant_admin()`, que resolvem a associação
  usuário↔tenant a partir de `auth.uid()` no banco, não de um valor
  enviado na query.
- **Criação de tenant via RPC, não INSERT direto**: não existe política
  de INSERT em `tenants`; só a função `create_tenant()` (`SECURITY
  DEFINER`) pode criar um tenant, garantindo que ele nasça sempre com um
  owner. Ver `docs/database.md` para o porquê (inclui um bug real de RLS
  encontrado e corrigido durante esta tarefa).
- **Auditoria não é client-writable**: `audit_log` não tem política de
  INSERT/UPDATE/DELETE para `authenticated`/`anon` — só leitura para
  admins do próprio tenant. Escrita será feita futuramente por código de
  servidor com a service role.

## O que ainda não existe (intencionalmente)

- Fluxo de autenticação completo (login/signup) — apenas o helper de
  leitura de sessão (`src/lib/auth/session.ts`), o middleware de refresh
  de sessão (`middleware.ts`) e o trigger `handle_new_user()`
  (cria `profiles` no signup) estão prontos.
- Sistema de permissões/roles configurável — `memberships.role` hoje é um
  enum fixo (`owner`/`manager`/`staff`), suficiente para a RLS desta
  etapa. O sistema configurável de perfis/permissões é escopo da Tarefa
  03.
- As migrations ainda não foram aplicadas a um projeto Supabase real
  (limite de projetos do plano gratuito da organização — ver
  `docs/database.md`).

## Checklist para as próximas etapas

- Toda nova tabela de negócio deve nascer com `tenant_id` + política RLS
  na mesma migration (padrão já seguido em `0004_core_multitenancy.sql`).
- Nenhuma rota server deve confiar em dados de tenant vindos do cliente
  sem revalidar contra a sessão autenticada.
- `admin.ts` só deve ser chamado a partir de Route Handlers/Server Actions
  específicas e auditadas — nunca a partir de código que atende
  diretamente uma requisição de usuário final sem checagem de
  autorização própria.
