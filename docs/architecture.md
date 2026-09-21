# Arquitetura — KlikFlow

## Visão geral

KlikFlow é um SaaS multi-tenant, genérico para negócios de atendimento
(cafeterias, restaurantes, bares, hotéis, clínicas, etc). O domínio nunca
deve referenciar um segmento específico — nomes fixos como "cozinha",
"mesa" ou "garçom" não existem no código; usamos os conceitos genéricos
definidos na tarefa: Empresa (Tenant), Unidade, Local de Consumo, Comanda,
Pedido, Produto, Categoria, Estação de Produção, Função, Perfil,
Permissão, Pagamento, Fluxo, Auditoria.

## Stack

- Next.js (App Router) + React + TypeScript
- Neon: Postgres, Managed Better Auth (Neon Auth), Data API (RLS), Object Storage
- Tailwind CSS + shadcn/ui + Lucide Icons
- Zod para validação
- Deploy: Vercel

Nenhuma alternativa (ex: Firebase) foi usada.

**Nota de decisão (pós-Tarefa 02):** a stack original desta tarefa era
Supabase. Ela foi trocada para Neon a pedido explícito do usuário, por um
motivo prático (o plano gratuito da organização já usava os 2 projetos
Supabase permitidos) — não por limitação técnica do Supabase. O desenho
de multi-tenancy, RLS e auth é equivalente nos dois provedores; ver
`docs/database.md` para o mapeamento exato entre os dois modelos.

## Divisão conceitual do produto

```
KLIKFLOW
├── CORE          (multi-tenancy, auth, permissions, configuration,
│                  orders, tabs, production, payments, audit)
├── CUSTOMER      (autoatendimento)
├── OPERATIONS    (operação)
├── MANAGEMENT    (gestão)
└── SAAS ADMIN    (administração da plataforma)
```

Esta etapa entrega apenas a fundação do CORE (estrutura, não lógica de
negócio). As demais divisões (Customer, Operations, Management, SaaS
Admin) ainda não têm código — apenas a pasta `src/features/*` reservada
para elas.

## Estrutura de pastas

```
src/
├── app/                # rotas (App Router)
├── components/ui/      # design system (shadcn/ui)
├── features/           # um diretório por domínio de negócio
│   ├── auth/
│   ├── tenants/
│   ├── users/
│   ├── products/
│   ├── categories/
│   ├── locations/
│   ├── tabs/
│   ├── orders/
│   ├── production/
│   ├── payments/
│   ├── service-requests/
│   ├── reports/
│   └── audit/
├── lib/
│   ├── db/               # clients (Data API browser client, admin direto)
│   ├── auth/             # instância Neon Auth (server) + helper de sessão
│   ├── permissions/      # vocabulário de roles/permissions
│   ├── validation/       # schemas Zod (ex: env)
│   ├── realtime/         # helpers de realtime (futuro, provedor a definir)
│   └── utils/
├── services/            # integrações e acesso a dados cross-feature
├── types/               # tipos de domínio + tipos gerados do Supabase
└── config/              # configuração estática da aplicação
```

Cada pasta em `features/*` está vazia (apenas `.gitkeep`) nesta etapa —
elas existem para fixar onde o código de cada domínio deve nascer, sem
antecipar sua implementação.

## Hierarquia multi-tenant

```
Tenant → Unit → Users (via Membership) → Products → Orders → Payments
```

Implementada desde a Tarefa 02 em `db/migrations/`, aplicada a um projeto
Neon real (`klikflow`, região `sa-east-1`). Ver `docs/database.md` para o
detalhamento do schema, das políticas RLS e da estratégia de auth.
`src/types/tenant.ts` e `src/types/database.ts` espelham essas tabelas em
TypeScript. Toda entidade de negócio futura (produtos, comandas, pedidos,
pagamentos) deverá seguir o mesmo padrão: `tenant_id not null` + RLS na
mesma migration que cria a tabela.

## Neon

Dois clients, com propósitos e superfícies de confiança distintos:

- `src/lib/db/client.ts` — Client Components, via **Neon Data API**
  (`@neondatabase/neon-js`), o equivalente do PostgREST do Supabase.
  Injeta o JWT do usuário logado automaticamente; RLS decide o que volta.
- `src/lib/db/admin.ts` — conexão direta ao Postgres com a connection
  string completa (role `klikflow_owner`), importável apenas no servidor
  (`server-only`). Essa role tem `BYPASSRLS` — a Neon não permite removê-lo
  de roles criadas via API — então ignora RLS por completo: uso restrito a
  operações de confiança, nunca para atender requisições de usuário final
  diretamente.
- `src/lib/auth/server.ts` — instância do Neon Auth (`createNeonAuth`),
  usada pela rota `src/app/api/auth/[...path]/route.ts` (proxy obrigatório
  da API de auth) e por `src/lib/auth/session.ts` (`getCurrentUser()`).

`src/types/database.ts` é escrito manualmente espelhando
`db/migrations/*.sql`. O gerador oficial (`docs/data-api/generate-types`)
depende de acesso de rede que este ambiente de desenvolvimento não tinha
no momento — regenerar quando possível.

## Por que nada de lógica de negócio ainda

Esta tarefa é só a fundação. Ver `docs/roadmap.md` para os próximos passos
(schema real, RLS, telas de negócio).
