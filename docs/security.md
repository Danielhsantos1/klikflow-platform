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
  `is_tenant_member()`/`is_tenant_admin()`, que resolvem a associação
  usuário↔tenant a partir de `auth.uid()` no banco, não de um valor
  enviado na query.
- **Criação de tenant via RPC, não INSERT direto**: não existe política
  de INSERT em `tenants`; só a função `create_tenant()` (`SECURITY
  DEFINER`) pode criar um tenant, garantindo que ele nasça sempre com um
  owner. Ver `docs/database.md` para o porquê (inclui um bug real de RLS
  encontrado e corrigido durante esta tarefa).
- **Auditoria não é client-writable**: `audit_log` não tem política de
  INSERT/UPDATE/DELETE para `authenticated`/`anonymous` — só leitura para
  admins do próprio tenant. Escrita será feita futuramente por código de
  servidor usando `src/lib/db/admin.ts` (fora da Data API).

## O que ainda não existe (intencionalmente)

- Fluxo de autenticação completo (login/signup) — apenas a infraestrutura
  está pronta: o proxy obrigatório (`src/app/api/auth/[...path]/route.ts`),
  o helper de leitura de sessão (`src/lib/auth/session.ts`) e o trigger
  `handle_new_user()` (cria `profiles` no signup).
- Sistema de permissões/roles configurável — `memberships.role` hoje é um
  enum fixo (`owner`/`manager`/`staff`), suficiente para a RLS desta
  etapa. O sistema configurável de perfis/permissões é escopo da Tarefa
  03.
- Validação comportamental via HTTP contra o Neon real (bloqueada pela
  política de rede deste ambiente de desenvolvimento — ver
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
