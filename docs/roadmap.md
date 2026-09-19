# Roadmap

## Concluído (Tarefa 01 — Fundação)

- Projeto Next.js + TypeScript + Tailwind + ESLint inicializado.
- Estrutura de pastas por domínio (`src/features/*`).
- Infraestrutura Supabase preparada (client, server, admin, middleware),
  sem schema de negócio.
- Segurança inicial: strict mode, Zod, `.env.example`, separação
  client/server, `server-only` no client privilegiado.
- Vocabulário de multi-tenancy definido (`src/types/tenant.ts`), sem
  implementação de isolamento.
- Design system inicial (Tailwind + shadcn/ui + Lucide) com um componente
  (`Button`) de exemplo.
- Landing simples validando que o projeto builda e roda.
- Documentação em `/docs`.

## Próximos passos (fora do escopo desta tarefa)

1. Modelar e criar o schema real no Supabase: `tenants`, `units`,
   `consumption_locations`, `profiles`/roles, `categories`, `products`.
2. Escrever as políticas RLS correspondentes a cada tabela.
3. Implementar autenticação (login, signup, convite de usuário por
   tenant) usando Supabase Auth.
4. Implementar o sistema de permissões (`src/lib/permissions/`) com
   enforcement real, não só tipos.
5. Modelar Comanda, Pedido, Estação de Produção e Pagamento.
6. Primeiras telas de negócio: CUSTOMER (autoatendimento), OPERATIONS,
   MANAGEMENT.
7. SaaS Admin (administração da plataforma, cross-tenant).

Cada um desses itens deve ser tratado como uma tarefa própria, com o
mesmo cuidado de não antecipar funcionalidades fora do escopo pedido.
