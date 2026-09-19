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
- **Arquitetura preparada para RLS**: o vocabulário de multi-tenancy
  (`Tenant → Unit → Users → Products → Orders → Payments`, ver
  `src/types/tenant.ts`) já assume que toda tabela de negócio terá
  `tenant_id` e uma política RLS correspondente quando o schema for
  criado. Nenhuma tabela existe ainda, então nenhuma política foi escrita
  — mas nenhuma decisão desta etapa impede isso.

## O que ainda não existe (intencionalmente)

- Schema de banco de dados e políticas RLS reais.
- Fluxo de autenticação completo (login/signup) — apenas o helper de
  leitura de sessão (`src/lib/auth/session.ts`) e o middleware de refresh
  de sessão (`middleware.ts`) estão prontos.
- Sistema de permissões/roles com enforcement — `src/lib/permissions/`
  hoje só define o vocabulário (`Role`, `Permission`, `Profile`).

## Checklist para as próximas etapas

- Toda nova tabela de negócio deve nascer com `tenant_id` + política RLS.
- Nenhuma rota server deve confiar em dados de tenant vindos do cliente
  sem revalidar contra a sessão autenticada.
- `admin.ts` só deve ser chamado a partir de Route Handlers/Server Actions
  específicas e auditadas — nunca a partir de código que atende
  diretamente uma requisição de usuário final sem checagem de
  autorização própria.
