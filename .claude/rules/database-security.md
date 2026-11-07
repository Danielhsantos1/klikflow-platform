# Regras de banco de dados e segurança — KlikFlow

Base real do projeto (não é aspiracional — é o que já está implementado
e testado contra o Neon em produção). Qualquer agente que toque em
schema, RLS, RPC ou policy segue isto.

## Stack de dados

- **Neon Postgres** (projeto `klikflow`, branch `production`, região
  `aws-sa-east-1`).
- **Neon Auth** (Managed Better Auth) — usuários em `neon_auth."user"`,
  espelhados em `public.profiles` via trigger `handle_new_user()`.
- **Neon Data API** — REST estilo PostgREST, autenticada por JWT. É o
  que faz `auth.uid()` existir dentro do Postgres. RLS só é real através
  dela — uma conexão direta com `klikflow_owner` tem `BYPASSRLS = true`.
- Migrations em `db/migrations/*.sql`, numeradas sequencialmente,
  aplicadas via MCP do Neon (`run_sql`/`run_sql_transaction`) — não há
  CLI de migrations. Cada arquivo mistura DDL + RLS + grants: uma tabela
  nunca existe num estado intermediário exposto.

## Dois clients, dois níveis de confiança — nunca misturar

- `src/lib/db/client.ts` — Client Components, via Data API
  (`@neondatabase/neon-js`). Injeta o JWT do usuário logado
  automaticamente; RLS decide o que volta. **Único client permitido em
  código que roda no navegador.**
- `src/lib/db/admin.ts` — conexão direta com a connection string
  completa (`klikflow_owner`, `BYPASSRLS`). Importa `server-only` — quebra
  o build se alcançado por código client. Uso restrito a operações de
  confiança server-side; nunca para atender requisição de usuário final
  diretamente.
- `src/lib/db/anonymous.ts` — cliente do cliente SEM conta (QR
  Code/Totem/Tablet). Usa `fetch()` puro com um JWT anônimo real (plugin
  `anonymous-token` do Better Auth) — a Data API rejeita toda requisição
  sem `Authorization`, não existe "sem header = anônimo" como no
  PostgREST/Supabase.

## Multi-tenancy — não é opcional, é a arquitetura

- Toda tabela de negócio nasce com `tenant_id not null references
  tenants(id)` na MESMA migration que a cria, com `ENABLE ROW LEVEL
  SECURITY` + `FORCE ROW LEVEL SECURITY` logo em seguida. Nunca criar
  tabela e adicionar RLS depois.
- `tenant_id` **nunca** é confiado vindo do cliente. Toda policy resolve
  isolamento a partir de `is_tenant_member(tenant_id)` /
  `has_permission(tenant_id, 'permissao.chave')`, que por sua vez
  resolvem a partir de `auth.uid()` no banco — nunca de um valor
  enviado na query/payload.
- Uma entidade que não pertence diretamente a um tenant (ex:
  `consumption_locations` pertence a uma `unit`, `order_items` pertence
  a uma `order`) precisa de um trigger explícito garantindo que a
  entidade pai é do mesmo tenant (ver `check_product_category_same_tenant`,
  `check_tab_location_same_tenant`) — FK sozinha não impede vincular
  linhas de tenants diferentes porque cada policy é checada
  isoladamente.

## Permissões — configuráveis, nunca um enum fixo

- `permissions` é um catálogo global e fixo (só muda via migration).
- `roles` são Perfis configuráveis POR tenant (não "admin"/"garçom"
  fixos). `role_permissions` liga Perfil → Permissões.
- `create_tenant()` concede automaticamente TODAS as permissões
  existentes ao Perfil "Proprietário" — mas só no momento da criação.
  **Uma permissão nova precisa de backfill explícito pros tenants que já
  existem** (`insert into role_permissions ... where not exists (...)`),
  senão só tenants criados depois da migration a ganham. Isso já
  aconteceu (0037 `recipes.manage`, 0039 `checklists.manage`) — é
  padrão esperado, não exceção.
- Nenhum código do app decide autorização. Tudo resolve no banco via
  `has_permission()`. A UI nunca replica a checagem — só mostra o erro
  de RLS se a escrita for negada.

## Transições de status são controladas, nunca um UPDATE livre

- `order_status_transitions` é o grafo de arestas permitidas por
  tenant. `validate_order_status_transition()` rejeita qualquer mudança
  de `status_id` sem aresta correspondente — inclusive mudanças feitas
  por trigger interno (não só pela UI). Ver o caso real: a migration
  0031 removeu uma aresta achando que só sustentava um atalho da UI, e
  quebrou um trigger legítimo que dependia dela (corrigido na 0034).
  **Antes de remover uma aresta de transição, verificar todo trigger/
  função que faz UPDATE em `orders.status_id`, não só os callers da
  UI.**

## Cliente sem conta (QR Code/Totem/Tablet)

- Nunca uma policy de RLS genérica para o role `anonymous`. Toda
  escrita do cliente sem conta passa por RPCs `SECURITY DEFINER`
  (`open_customer_tab`, `create_customer_order`,
  `add_customer_order_item`, `confirm_customer_payment`, etc.) que
  resolvem a Comanda a partir de um `access_token` — nunca de um
  `tab_id`/`tenant_id`/`order_id` que o cliente informe diretamente.
- Leitura pública (`GRANT SELECT` para `anonymous`) é exceção mínima e
  explícita — hoje só `tenants`, `categories`, `products`,
  `consumption_locations`, sempre com `using (status = 'active')`.
  `tabs`/`orders`/`order_items` nunca têm grant de leitura direta para
  `anonymous`.

## Histórico nunca é recalculado, é snapshot

- `order_items.product_name`/`unit_price` são gravados por trigger
  (`snapshot_order_item()`) no momento do INSERT, ignorando qualquer
  valor enviado pelo cliente, e nunca mudam depois mesmo que o produto
  mude de preço. Itens de pedido não têm política de UPDATE/DELETE.
- Esse princípio se aplica a qualquer dado financeiro novo: nunca
  reconsultar o preço "atual" de um produto pra reconstruir o valor de
  um pedido já feito.

## Antes de criar uma migration (Backend & Database Architect)

1. Leia as migrations existentes relacionadas ao domínio (não assuma —
   confira o arquivo).
2. Verifique se a tabela/coluna/função já existe sob outro nome.
3. Siga o padrão de RLS já estabelecido (select = `is_tenant_member`,
   insert/update/delete = `has_permission` com uma permissão nomeada
   `dominio.manage`), a menos que o domínio já tenha outro padrão
   específico (ex: completions por dia em `checklist_item_completions`,
   onde insert é `completed_by = auth.uid()` + permissão, não só
   permissão).
4. Rode cada statement da migration individualmente via MCP do Neon
   (o client não aceita múltiplos statements numa chamada), na ordem:
   DDL → índice → trigger → RLS enable/force → grants → policies →
   backfill de permissão se aplicável.
5. Valide com um bloco `do $$ ... end $$` descartável simulando o
   cenário real (igual aos testes feitos nas migrations 0030–0039) —
   nunca assuma que uma trigger/policy funciona sem rodar contra o
   banco real.
6. Nunca rode `DROP`/`DELETE`/`TRUNCATE` em dado de produção sem
   confirmação explícita do usuário.
