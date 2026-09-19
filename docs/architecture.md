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
- Supabase: Postgres, Auth, RLS, Realtime, Storage
- Tailwind CSS + shadcn/ui + Lucide Icons
- Zod para validação
- Deploy: Vercel

Nenhuma alternativa (ex: Firebase) foi usada.

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
│   ├── supabase/        # clients (browser, server, admin, middleware)
│   ├── auth/            # helpers de sessão
│   ├── permissions/      # vocabulário de roles/permissions
│   ├── validation/       # schemas Zod (ex: env)
│   ├── realtime/         # helpers de canais Supabase Realtime (futuro)
│   └── utils/
├── services/            # integrações e acesso a dados cross-feature
├── types/               # tipos de domínio + tipos gerados do Supabase
└── config/              # configuração estática da aplicação
```

Cada pasta em `features/*` está vazia (apenas `.gitkeep`) nesta etapa —
elas existem para fixar onde o código de cada domínio deve nascer, sem
antecipar sua implementação.

## Hierarquia multi-tenant (planejada, ainda não implementada)

```
Tenant → Unit → Users → Products → Orders → Payments
```

O tipo `src/types/tenant.ts` fixa esse vocabulário. Nenhuma tabela foi
criada ainda; quando o schema nascer, toda entidade de negócio deverá
carregar `tenant_id` e ser protegida por política RLS equivalente.

## Supabase

Três clients, cada um com um propósito e superfície de confiança distintos:

- `src/lib/supabase/client.ts` — Client Components, usa apenas a anon key.
- `src/lib/supabase/server.ts` — Server Components / Route Handlers /
  Server Actions, também com a anon key, lendo cookies via `next/headers`.
- `src/lib/supabase/admin.ts` — client privilegiado com a Service Role
  Key, importável apenas no servidor (`server-only` garante erro de build
  se importado de um módulo client). Ignora RLS: uso restrito a jobs de
  confiança, nunca para atender requisições de usuário final.
- `src/lib/supabase/middleware.ts` + `middleware.ts` — renova a sessão a
  cada request.

`src/types/database.ts` é um placeholder até existir schema; será
substituído por `npx supabase gen types typescript`.

## Por que nada de lógica de negócio ainda

Esta tarefa é só a fundação. Ver `docs/roadmap.md` para os próximos passos
(schema real, RLS, telas de negócio).
