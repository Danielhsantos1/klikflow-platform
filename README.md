# KlikFlow

Plataforma operacional configurável para negócios de atendimento
(cafeterias, restaurantes, bares, hotéis, clínicas e outros) — SaaS
multi-tenant.

Este repositório contém a fundação técnica do projeto e o schema inicial
de multi-tenancy/auth/RLS: nenhuma funcionalidade de negócio (comandas,
pedidos, pagamentos, telas) foi implementada ainda.

Veja `/docs`:

- [`docs/architecture.md`](docs/architecture.md) — stack, estrutura de
  pastas, decisões de arquitetura.
- [`docs/database.md`](docs/database.md) — schema, RLS, multi-tenancy e
  testes de isolamento (Tarefa 02).
- [`docs/development.md`](docs/development.md) — como rodar o projeto.
- [`docs/security.md`](docs/security.md) — medidas de segurança adotadas.
- [`docs/roadmap.md`](docs/roadmap.md) — o que já existe e o que vem a
  seguir.

## Quickstart

```bash
npm install
cp .env.example .env.local
npm run dev
```
