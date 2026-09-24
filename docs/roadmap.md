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

## Concluído (Tarefa 02 — Banco + Multi-tenancy + Auth + RLS)

Executada duas vezes: primeiro desenhada para Supabase, depois portada
para **Neon** a pedido do usuário (limite de projetos do plano gratuito
do Supabase). O resultado final está no Neon.

- Schema versionado em `db/migrations/`: `profiles`, `tenants`, `units`,
  `memberships`, `audit_log` — **aplicado a um projeto Neon real**
  (`klikflow`, região `sa-east-1`).
- RLS habilitado e forçado em todas as tabelas, isolando tenants via
  `is_tenant_member()`/`is_tenant_admin()` — nunca via `tenant_id` do
  cliente. Confirmado estruturalmente contra o projeto real (RLS
  enable+force, 13 policies, roles da Data API sem `BYPASSRLS`).
- Criação de tenant via função RPC `create_tenant()` (atômica, evita o
  bug de RLS+`RETURNING` documentado em `docs/database.md`).
- Trigger `handle_new_user()` sincronizando `neon_auth."user"` →
  `profiles`.
- `audit_log` somente leitura para admins do tenant; sem INSERT/UPDATE/
  DELETE client-side.
- Neon Auth (Managed Better Auth) + Neon Data API provisionados; proxy de
  auth (`src/app/api/auth/[...path]/route.ts`), instância server
  (`src/lib/auth/server.ts`) e clients de banco (`src/lib/db/client.ts`,
  `src/lib/db/admin.ts`) implementados.
- 9 cenários de isolamento/segurança testados ponta a ponta contra
  Postgres local antes da portabilidade (ver `docs/database.md`) — a
  mesma lógica de policies foi aplicada ao Neon sem alteração.
- `src/types/database.ts` e `src/types/tenant.ts` atualizados para
  espelhar o schema real.
- **Fechado**: os 9 cenários foram repetidos via HTTP real (Neon Auth +
  Data API) rodando `scripts/test-tenant-isolation.browser.js` no
  Console do navegador em `https://klikflow.vercel.app` —
  `9 passed, 0 failed`. Tarefa 02 validada de ponta a ponta.
- App também já está publicado em produção: `https://klikflow.vercel.app`
  (projeto Vercel `klikflow`, deploy automático a cada push no branch).

## Concluído (Tarefa 03 — Usuários + Perfis + Permissões)

- `db/migrations/0006_permissions_roles.sql` aplicada ao projeto Neon
  real: `permissions` (catálogo fixo com 5 permissões iniciais), `roles`
  (Perfis configuráveis por tenant), `role_permissions`.
- `memberships.role` (enum fixo da Tarefa 02) substituído por
  `memberships.role_id`, apontando para um Perfil configurável.
- `has_permission(tenant_id, perm_key)` substitui `is_tenant_admin()` em
  todas as policies (`tenants`, `units`, `memberships`, `audit_log`).
- `create_tenant()` atualizado: cria o Perfil "Proprietário"
  (`is_system = true`) com todas as permissões e a membership do criador
  aponta pra esse Perfil.
- Duas proteções em nível de banco: `protect_system_role()` (Perfil de
  dono não pode ser renomeado/excluído) e
  `protect_last_owner_membership()` (Empresa nunca fica sem dono) —
  ambas testadas de verdade contra o Neon real (transações com rollback
  confirmando o bloqueio).
- `src/types/database.ts`, `src/types/tenant.ts` e
  `src/lib/permissions/types.ts` atualizados para o schema real.
- **Fechado**: `scripts/test-permissions.browser.js` rodado contra o
  Neon real (`https://klikflow.vercel.app`, Console do navegador) —
  `10 passed, 0 failed`. Confirmado: Perfil "Proprietário" nasce com
  todas as permissões; um Perfil customizado ("Caixa") com só
  `audit_log.read` só conseguiu o que tinha permissão; dono não
  conseguiu se auto-rebaixar nem se auto-remover.
- Nenhuma UI de gestão de perfis/usuários criada — fora do escopo (só a
  base configurável de autorização).

## Concluído (Tarefa 04 — Catálogo + Produção + Locais)

- `db/migrations/0007_catalog.sql` aplicada ao projeto Neon real:
  `categories`, `products` (`price`, `image_url`), `production_stations`
  (Estação de Produção), `product_stations` (associação com `sequence`),
  `consumption_locations` (Local de Consumo, sob `units`).
- 3 novas permissões (`catalog.manage`, `production_stations.manage`,
  `consumption_locations.manage`) — `create_tenant()` não precisou
  mudar, já concede automaticamente todas as permissões do catálogo ao
  Perfil "Proprietário".
- Trigger `check_product_category_same_tenant()`: um produto não pode
  usar uma categoria de outro tenant — testado de verdade contra o Neon
  (bloqueado com sucesso, transação desfeita).
- Fluxo completo testado via SQL contra o Neon real: Unidade → Categoria
  → Produto (com preço) → Estação de Produção → associação → Local de
  Consumo.
- `src/types/database.ts` (novas tabelas) e `src/types/catalog.ts`
  (novo, tipos de domínio) criados; `ConsumptionLocation` migrado do
  placeholder em `tenant.ts` para o tipo real.
- **Fechado**: `scripts/test-catalog.browser.js` rodado contra o Neon
  real — `7 passed, 0 failed` (após atualizar o cache de schema da Data
  API, ver "achado operacional" em `docs/database.md`). Confirmado:
  usuário sem membership não lê nem escreve no catálogo de outro tenant;
  categoria de outro tenant não pode ser anexada a um produto.
- Nenhuma UI de catálogo (cardápio, cadastro de produto) criada — fora
  do escopo desta tarefa.

## Concluído (Tarefa 05 — Comanda + Pedidos)

- `db/migrations/0008_tabs_orders.sql` aplicada ao projeto Neon real:
  `tabs` (Comanda), `orders` (Pedido, status fixo por enquanto —
  a máquina de transições configurável é escopo da Tarefa 06),
  `order_items` (itens com snapshot de nome/preço do produto).
- 2 novas permissões (`tabs.manage`, `orders.manage`).
- Snapshot de preço/nome **confirmado de verdade** contra o Neon real:
  um item mantém o preço no momento da compra mesmo depois do produto
  mudar de preço; a trigger `snapshot_order_item()` ignora qualquer
  preço/nome que o cliente tente enviar no INSERT.
- Três proteções testadas de verdade contra o Neon (via SQL e depois via
  HTTP): só uma comanda `open` por Local de Consumo por vez; não dá para
  lançar pedido numa comanda fechada; item de pedido não pode usar
  produto de outro tenant.
- `src/types/database.ts` (tabelas `tabs`/`orders`/`order_items`) e
  `src/types/order.ts` (novo, tipos de domínio) criados.
- `scripts/test-orders.browser.js` criado — inclui uma tentativa
  explícita do cliente de mentir preço/nome do item, confirmando que a
  trigger ignora e grava os valores reais.
- **Pendente**: rodar esse script no navegador e confirmar o resultado.
- Nenhuma UI de comanda/pedido criada — fora do escopo desta tarefa.

## Concluído (Tarefa 06 — Produção + Status configurável)

- `db/migrations/0009_production_status.sql` aplicada ao projeto Neon
  real: `orders.status` (enum fixo da Tarefa 05) substituído por
  `orders.status_id`, apontando para `order_statuses` (lista configurável
  por tenant, com `sequence` e `is_terminal`) e `order_status_transitions`
  (grafo explícito de transições permitidas).
- 2 novas permissões (`orders.configure_statuses`, `production.manage`).
- `default_order_status()` (trigger BEFORE INSERT em `orders`): se o
  cliente não informa `status_id`, usa o de menor `sequence` do tenant.
- `validate_order_status_transition()` (trigger BEFORE UPDATE em
  `orders`): só aceita a mudança de `status_id` se existir uma linha
  correspondente em `order_status_transitions` — transições fora do grafo
  são bloqueadas com exceção.
- `create_tenant()` atualizado: semeia o fluxo padrão de 7 status (Novo →
  Aceito → Em Produção → Pronto → Entregue → Finalizado, mais Cancelado a
  partir de qualquer status não-terminal) e as transições lineares
  correspondentes para todo tenant novo.
- `order_item_stations` (novo): acompanha cada item do pedido nas
  Estações de Produção do produto (Tarefa 04); semeado automaticamente
  via trigger `seed_order_item_stations()` quando o item é criado — sem
  política de INSERT/DELETE client-side, as linhas só nascem/morrem pela
  trigger.
- **Validado via SQL contra o Neon real** (réplica manual da lógica de
  `create_tenant()`, já que `auth.uid()` não pode ser simulado por SQL
  direto): pedido sem `status_id` recebeu o status "Novo" por padrão;
  transição válida (Novo → Aceito) aceita; transição pulando etapas
  (Aceito → Finalizado) corretamente bloqueada; item de produção marcado
  como `done` com sucesso. Dados de teste limpos depois.
- `src/types/database.ts` (`order_statuses`, `order_status_transitions`,
  `order_item_stations`, `orders.status_id`) e `src/types/order.ts`
  (tipos de domínio) atualizados.
- `scripts/test-production-status.browser.js` criado, cobrindo os mesmos
  cenários via HTTP real (Neon Auth + Data API).
- **Pendente**: rodar esse script no navegador e confirmar o resultado
  (usuário está sem acesso a computador no momento; validação SQL já
  confirma o comportamento das triggers).
- Realtime (citado no título da tarefa mestra) fica para quando existir
  uma tela consumindo esses eventos (Tarefa 07+) — construir a infra
  agora, sem consumidor, seria trabalho especulativo.
- Nenhuma UI de produção/status criada — fora do escopo desta tarefa.

## Concluído (Tarefa 07 — Autenticação: login e cadastro)

- Primeira UI real do produto: `/login` e `/signup`, usando o client
  `createAuthClient()` de `@neondatabase/auth/next` (`src/lib/auth/client.ts`)
  contra o proxy same-origin já existente
  (`src/app/api/auth/[...path]/route.ts`), sem nenhuma URL de auth
  hardcoded no cliente.
- `src/features/auth/components/`: `LoginForm`, `SignupForm` e
  `SignOutButton` — Client Components mínimos (email/senha, e nome no
  cadastro), com erro exibido inline e redirecionamento para `/app` no
  sucesso.
- `/app`: primeira rota protegida de verdade, um Server Component que
  usa `getCurrentUser()` (já existia desde a Tarefa 01) e redireciona
  para `/login` se não houver sessão — prova de ponta a ponta que a
  infraestrutura de auth (proxy + `pg_session_jwt`) funciona com uma UI
  real, não só via scripts de Console.
- Landing (`/`) ganhou os botões "Entrar" / "Criar conta".
- `src/components/ui/input.tsx` (novo, mesmo padrão do `Button`).
- **Testado localmente**: `npm run build` sem erros; `/`, `/login` e
  `/signup` respondem 200; `/app` sem sessão redireciona (307) para
  `/login`, confirmando o guard de rota.
- **Fechado**: fluxo completo confirmado pelo usuário direto no celular
  contra `https://klikflow.vercel.app`, sem Console/DevTools — signup
  criou a conta e levou para `/app` mostrando nome e e-mail reais
  (Neon Auth), logout voltou para `/login`, e login de novo com o mesmo
  e-mail/senha funcionou. Primeira tarefa validada de ponta a ponta
  inteiramente pela UI real, em vez de scripts de navegador.
- Nenhuma tela de negócio (catálogo, comanda, produção) criada ainda —
  essa é a próxima tarefa.

## Concluído (Tarefa 08 — Cadastro da empresa + Catálogo, primeira tela de negócio)

- `/app` deixou de ser uma tela de boas-vindas estática e virou o
  dashboard real: `TenantDashboard` (Client Component) descobre a
  empresa do usuário logado consultando `memberships` via Data API
  (respeitando RLS, sem nenhum bypass) e decide o que mostrar.
- Sem empresa ainda → `CreateTenantForm`
  (`src/features/tenants/components/`): nome + segmento, chama a RPC
  `create_tenant()` (Tarefa 02) direto do navegador — a mesma função já
  testada e validada, agora com UI de verdade em vez de scripts de
  Console.
- Com empresa → `CatalogManager`
  (`src/features/catalog/components/`): lista e cria Categorias e
  Produtos (nome + preço) da empresa logada — dados **editáveis por
  empresa**, não uma tela genérica: cada tenant só enxerga e só escreve
  o próprio catálogo, RLS (Tarefa 04) decide isso no banco, não a UI.
- `src/components/ui/input.tsx` reutilizado; nenhuma tela nova de
  design system criada além do necessário.
- **Fechado**: usuário confirmou em `https://klikflow.vercel.app`
  (navegador normal, sem Console): criou a empresa "Cafe Daniel",
  cadastrou as categorias "Bebidas" e "Salgados", e os produtos
  "Coca Cola" (R$ 10,00, Bebidas) e "Coxinha Frango" (R$ 7,00,
  Salgados) — todos persistidos de verdade e exibidos de volta,
  provando escrita e leitura reais contra o Neon via RLS.
- Fora do escopo: edição/exclusão de categoria e produto, upload de
  imagem, gestão de Estações de Produção e Locais de Consumo pela UI,
  convite de outros usuários para a empresa — tudo isso já existe no
  banco (Tarefas 03/04) mas ainda não tem tela.

### Incidente pós-deploy: `createDbClient()` não conseguia autenticar

Ao testar em produção, `/app` falhou em cadeia por 4 causas diferentes,
cada uma corrigida e documentada em `docs/database.md`/commits próprios
— resumo:

1. `getCurrentUser()` deixava uma sessão inválida derrubar a página
   inteira em vez de tratar como "não logado".
2. O fallback do proxy de auth respondia com um formato que
   `authClient.useSession()` não sabia resolver, travando em
   "Carregando..." para sempre.
3. **Causa raiz real**: `createDbClient()` usava `createClient(url)` (a
   forma de URL única), que cria seu **próprio** cliente Neon Auth
   apontando direto pro host do Neon — uma sessão completamente separada
   da que o login usa (que passa pelo proxy same-origin `/api/auth`,
   onde o cookie realmente existe). Essa segunda sessão nunca tinha
   login nenhum.
4. Ao corrigir isso, ainda restava usar o campo certo: `session.token`
   do Better Auth é um token de sessão opaco, não um JWT — o JWT de
   verdade vem do plugin `jwt` do Better Auth, endpoint `GET /token`.

Fix final: `src/app/api/session-token/route.ts`, uma rota própria que
invoca esse endpoint no servidor (onde o cookie httpOnly é lido
diretamente) e devolve `{ token }` pro `createDbClient()` usar como
Bearer na Data API. **Lição para as próximas telas**: nunca usar
`createClient(url)` (forma de URL única) num Client Component desta
app — sempre a forma "external auth provider" com `getToken` apontando
pra `/api/session-token`.

## Concluído (Tarefa 09 — Comanda + Pedido, tela OPERATIONS)

- `db/migrations/0010_default_unit.sql`: `create_tenant()` passa a
  semear uma Unidade padrão ("Unidade Principal") — nenhum Local de
  Consumo pode existir sem uma Unidade, e nenhuma tarefa anterior
  criava uma automaticamente. Inclui backfill para tenants já
  existentes (o "Cafe Daniel" da Tarefa 08 recebeu sua Unidade).
- `OperationsBoard` (`src/features/tabs/components/`): lista os Locais
  de Consumo da empresa (com formulário pra criar novos, ex: "Mesa 1"),
  e por local mostra "Abrir comanda" (sem comanda aberta) ou
  "Ver comanda" (com uma aberta, respeitando a restrição de só uma
  comanda `open` por local da Tarefa 05).
- `TabPanel`: dentro de uma comanda aberta, lista os Pedidos (com o
  status configurável da Tarefa 06 já resolvido pelo nome, não por um
  id cru), cada um com seus itens e preço; botão "Novo pedido"
  (nasce com o status inicial via trigger, sem UI escolher) e, por
  pedido, um formulário pra adicionar item (produto + quantidade) —
  nome/preço do item são sempre o snapshot gravado pelo banco
  (Tarefa 05), a UI nunca envia preço. Botão "Fechar comanda".
- `TenantDashboard` ganhou um seletor Comandas/Catálogo no topo, os
  dois convivendo na mesma sessão.
- **Fechado**: usuário confirmou em produção — abriu comanda num local,
  criou pedido, adicionou item do catálogo, viu o preço certo e fechou
  a comanda.
- Fora do escopo: editar/cancelar item, trocar status manualmente pela
  UI (Tarefa 06 já garante que só transições configuradas passam),
  histórico de comandas fechadas (perguntado ao usuário, decidiu adiar
  para depois de produção).

## Concluído (Tarefa 10 — Produção, tela da cozinha)

- `ProductionBoard` (`src/features/production/components/`): fila de
  itens pendentes/em preparo (`order_item_stations` com
  `status in (pending, in_progress)`), agrupada por Estação de Produção
  (Tarefa 04) — a mesma fila que a Tarefa 06 provou funcionar via SQL,
  agora com uma tela de verdade em cima.
- Cada item mostra produto + quantidade (via `order_items`, join
  automático) e um botão que avança o status: `pending` → `in_progress`
  (grava `started_at`) → `done` (grava `completed_at`, some da fila).
  Sem opção de "voltar" o status — a máquina de produção é sempre pra
  frente, igual o `orders.status_id` da Tarefa 06.
  Sem UI de INSERT/DELETE: as linhas de `order_item_stations` só
  nascem via trigger (Tarefa 06), a tela só atualiza `status`.
- Terceira aba (Comandas/Produção/Catálogo) no `TenantDashboard`.
- **Fechado**: usuário confirmou em produção — item "Parmegiana de
  frango" apareceu agrupado na estação "Cozinha", avançou
  pendente → em preparo → concluído e saiu da fila.
- Achado durante o teste: nenhuma tela criava `production_stations` nem
  `product_stations`, então todo produto cadastrado pela UI nunca
  entrava na fila (o trigger `seed_order_item_stations()` só semeia a
  partir de um vínculo já existente). Corrigido no mesmo commit:
  `CatalogManager` ganhou "Estações de produção" (listar/criar) e um
  vínculo produto↔estação — sem isso, todo tenant novo precisaria de
  mim inserindo direto no banco pra usar a tela de Produção.
- Fora do escopo: reordenar a fila manualmente, atribuir item a um
  funcionário específico, notificação sonora/push de novo pedido — tudo
  isso é refinamento de UX de uma tela que já existe, não uma tarefa
  nova do roadmap mestre.

## Concluído (Tarefa 11 — Gestão de usuários/perfis, tela MANAGEMENT)

- `db/migrations/0011_profiles_tenant_visibility.sql`: nova policy
  `profiles_select_tenant_member` — um usuário passa a poder ler o
  perfil (nome) de quem divide uma empresa com ele, além do próprio
  (`profiles_select_own`, intocada). RLS combina policies do mesmo
  comando com OR, então isso é estritamente uma liberação a mais, nunca
  uma substituição: continua impossível ver o perfil de alguém sem
  membership em comum. Sem essa policy, a tela de Membros desta tarefa
  não conseguiria mostrar nome nenhum além do do próprio usuário
  logado — achado ao desenhar a tela, corrigido antes de escrever a UI.
- `RolesManager` (`src/features/roles/components/`): lista os Perfis
  da empresa (com o "Proprietário" marcado como padrão), cria novos
  Perfis, e por Perfil um checklist com todas as permissões do catálogo
  fixo — marca/desmarca grava direto em `role_permissions`. As duas
  proteções da Tarefa 03 (`protect_system_role`,
  `protect_last_owner_membership`) continuam decidindo no banco o que é
  bloqueado, a UI não replica essa lógica.
- `MembersManager` (`src/features/members/components/`): lista os
  membros da empresa (nome via a nova policy, Perfil atual, status),
  com select pra trocar de Perfil e botão pra suspender/ativar.
- Nova aba "Equipe" no `TenantDashboard`.
- **Bug pego em produção e corrigido no mesmo commit**: `memberships`
  se relaciona com `profiles` só "por convenção" (mesmo UUID via
  `handle_new_user()`), não por uma foreign key de verdade —
  `memberships.user_id` referencia `neon_auth."user"`, não
  `public.profiles`. Um `.select("*, profiles(full_name), roles(name)")`
  (nested select assumindo uma FK que não existe) falhou com
  `"Could not find a relationship between 'memberships' and 'profiles'"`.
  Corrigido: `profiles` agora é buscado numa query separada
  (`profiles?id=in.(...)`) e o nome é juntado em JS pelo `user_id` — a
  Data API só faz embed automático a partir de uma FK real.
- **Testado**: `npm run build`/`npm run lint` sem erros; `/app` sem
  sessão continua redirecionando; a nova policy foi confirmada
  aplicada (`pg_policies`); a tela de Membros confirmada em produção
  mostrando o próprio usuário logado corretamente. Fluxo completo
  (criar Perfil, dar permissão, trocar Perfil de um membro) fica para
  quando houver mais de um membro pra testar.
- Fora do escopo, documentado explicitamente na própria tela: convidar
  um novo usuário por e-mail. Isso exige um fluxo de convite (token,
  e-mail, aceite) que não existe ainda — bem maior que "mostrar e
  editar o que já existe", que era o objetivo desta tarefa.

## Em andamento — Canais de Atendimento (QR Code / Totem)

Nova funcionalide pedida pelo usuário: dar ao cliente final duas formas
de fazer pedido sozinho, sem depender de um funcionário — QR Code/link e
Totem/Tablet — reaproveitando o mesmo motor de Comanda/Pedido que o
staff já usa (Tarefas 05/06/09/10), nunca um sistema paralelo.

Antes de qualquer código: análise completa entregue e aprovada (ver
histórico da conversa) — diagnóstico (CUSTOMER nunca foi implementado,
era só uma caixa vazia em `docs/architecture.md`), arquitetura proposta
(reaproveitar `consumption_locations` como "onde" um Totem/QR vive;
`tabs.channel` pra registrar a origem; RPC `SECURITY DEFINER` +
`access_token` pra autenticar um cliente sem conta numa Comanda
específica, em vez de abrir RLS genérica pra `anon`), e um plano de 7
tarefas sequenciais.

- **Concluído (Tarefa 2/N — Estrutura de dados do Canal)**:
  `db/migrations/0012_order_channels.sql` — `tabs.channel`
  (`staff`/`qr_code`/`totem`, default `staff`) e `tabs.access_token`,
  com constraint garantindo que só um canal de cliente tenha token;
  `tabs.opened_by` virou nullable. Aplicado ao Neon real e **testado
  via SQL**: tabs existentes ganharam `channel = 'staff'` sem qualquer
  mudança de comportamento; uma tentativa de inserir `channel = 'qr_code'`
  sem `access_token` foi corretamente bloqueada pela constraint.
  `src/types/database.ts`/`src/types/order.ts` atualizados
  (`OrderChannel`). Nenhuma RPC, policy nova ou UI ainda — só schema,
  como planejado.
- **Concluído (Tarefa 3/N — RPCs seguras do cliente)**:
  `db/migrations/0013_customer_channel_rpcs.sql` — `orders.created_by`
  virou nullable (mesmo motivo do `opened_by` da Tarefa 2/N); 4 funções
  `SECURITY DEFINER` concedidas ao role `anonymous`:
  `open_customer_tab` (abre a Comanda e devolve o `access_token`),
  `get_customer_tab` (retoma a sessão a partir do token),
  `create_customer_order` e `add_customer_order_item`. Nenhuma policy
  de RLS nova para `anonymous` — toda escrita do cliente passa por
  essas RPCs, que resolvem a Comanda pelo token e nunca confiam em
  `tab_id`/`tenant_id`/`order_id` informado diretamente.
- **Testado via SQL contra o Neon real, cenário completo**: abriu uma
  Comanda `qr_code` pro local "Mesa 1" (Cafe Daniel) e recebeu um
  token; uma segunda tentativa no mesmo local foi bloqueada ("this
  location already has an open tab" — a mesma restrição de uma
  Comanda aberta por local da Tarefa 05, sem nenhum código novo pra
  isso); `get_customer_tab` recuperou a Comanda pelo token, e um token
  inventado foi rejeitado; criou um Pedido (o trigger de status padrão
  da Tarefa 06 funcionou normalmente com `created_by` nulo);
  adicionou um item real ("Coca Cola", snapshot de preço certo);
  tentou adicionar um produto de OUTRO tenant (rejeitado: "product not
  found or inactive for this tenant") e um item num pedido inexistente
  pra aquela Comanda (rejeitado: "order not found for this tab"). Dados
  de teste limpos depois, local "Mesa 1" livre de novo.
- **Concluído (Tarefa 4/N — Leitura pública do cardápio + primeira
  tela do cliente)**:
  `db/migrations/0014_public_menu_read.sql` — primeiro `GRANT SELECT`
  do projeto pro role `anonymous`, só em `tenants`/`categories`/
  `products`/`consumption_locations`, só `status = 'active'`.
  `tabs`/`orders`/`order_items` seguem sem nenhum grant — o carrinho
  do cliente é montado a partir do retorno das RPCs, nunca de SELECT
  direto.
- `CustomerOrderPage` (`src/features/customer-orders/components/`),
  servida pela rota pública `/pedir/[locationId]` (sem guard de login —
  é pra ser aberta por alguém sem conta nenhuma): tela "Olá! 👋 Como
  você deseja fazer seu pedido?" → cardápio por categoria → adicionar
  ao carrinho. `?channel=totem` na URL diferencia o Totem/Tablet do
  QR Code/link (default) — mesmo componente, mesmo motor de pedidos,
  só o parâmetro muda. O token de sessão do cliente fica no
  `localStorage` da própria página, escopado por local — recarregar a
  página retoma a mesma Comanda em vez de abrir uma nova.
- **Fechado**: usuário confirmou em produção pelo canal `totem`
  (`?channel=totem`) na "Mesa 1" da Cafe Daniel — abriu o link, viu o
  cardápio, adicionou Coca Cola e Coxinha Frango, carrinho mostrou
  "2 itens — R$ 17,00". Conferido direto no banco: comanda real criada
  com `channel = 'totem'` e `opened_by = null` (nenhum funcionário
  envolvido), pedido e os 2 itens com snapshot de preço corretos.
- **Limitação conhecida, documentada e fora do escopo**: não existe
  pagamento. Cada "Adicionar" grava o item de verdade no Pedido
  imediatamente (o mesmo que a Produção/Tarefa 10 já lê) — não há
  ainda uma etapa de "revisar → pagar → pedido confirmado" como no
  fluxo descrito pelo usuário na análise original. Isso é a Tarefa
  5/N, e exige uma decisão própria de gateway de pagamento antes de
  qualquer código.
- **Decisão do usuário (Tarefa 5/N)**: sem gateway de pagamento nesta
  primeira versão — o cliente monta o pedido pelo QR/Totem, mas paga no
  balcão com a equipe (dinheiro, maquininha, Pix manual), como já é
  comum em totens de autoatendimento reais.
- **Concluído (Tarefa 5/N — Aguardando pagamento)**:
  `db/migrations/0015_awaiting_payment_status.sql` — reaproveita
  inteiramente a máquina de status configurável da Tarefa 06, nenhuma
  tabela nova. `default_order_status()` agora olha o `channel` da
  Comanda: um Pedido `qr_code`/`totem` nasce em `awaiting_payment`
  (status novo, sequence 0); um Pedido `staff` continua nascendo em
  `new`, sem nenhuma mudança. `create_tenant()` semeia
  `awaiting_payment` e as transições (`→ new`, `→ cancelled`) pra
  tenant novo; backfill aplicado aos dois tenants existentes.
  `TabPanel` (Comandas, Tarefa 09) ganhou o botão "Confirmar pagamento"
  num Pedido `awaiting_payment`, que move pra `new` — dali em diante é
  o mesmo fluxo de sempre (Produção, Tarefa 10, nem percebe a
  diferença). A tela do cliente ganhou o aviso "Dirija-se ao balcão
  para pagar e confirmar seu pedido."
- **Testado via SQL contra o Neon real**: criado um Pedido `staff` de
  teste → confirmado que nasceu em `new` (comportamento antigo
  intacto); criado um Pedido `qr_code`/`totem` de teste → confirmado
  que nasceu em `awaiting_payment`; `update` manual pra `new` aceito
  (a transição configurada funciona). Dados de teste limpos depois.
### Correção pós-deploy: tela do cliente herdando sessão de funcionário

Ao testar a Tarefa 5/N em produção, o link `/pedir/[locationId]`
retornou "Local não encontrado." — mas só porque o navegador de teste
ainda estava logado como funcionário de OUTRA empresa
("Restaurante teste"). `createDbClient()` (o cliente Data API usado por
toda tela logada) sempre injeta o JWT de quem estiver logado no
navegador via `/api/session-token`, então a leitura pública do
cardápio virou uma leitura `authenticated` daquele outro funcionário —
e `is_tenant_member()` corretamente bloqueou, já que ele não pertence à
Cafe Daniel.

Corrigido: `src/lib/db/client.ts` ganhou `createAnonymousDbClient()`
(`getToken` fixo em `async () => null`, nunca consulta
`/api/session-token`), e é o único cliente que `CustomerOrderPage` usa
agora. O canal de cliente nunca mais depende de qual conta de
funcionário, se alguma, estiver logada no mesmo aparelho — inclusive
quando é o próprio dono da empresa testando seu QR code.

- **Próximo**: nenhuma tarefa nova planejada além desta — a
  funcionalidade "Canais de Atendimento" está com seu núcleo completo
  (Tarefas 1-5/N). Itens 6-8/N da análise original (identificação do
  canal na gestão, configuração de canais habilitados por empresa)
  ficam para quando o usuário pedir.

## Próximos passos (fora do escopo desta tarefa)

1. Confirmar no navegador que criar Perfil, dar permissão e trocar o
   Perfil de um membro funciona contra o Neon real (Tarefa 11).
2. Confirmar a validação via HTTP da Tarefa 05 e da Tarefa 06 contra o
   Neon real, quando o usuário estiver num computador.
3. Continuar Canais de Atendimento (Tarefas 3-8/N, ver acima).
4. Outras telas: convite de novo usuário por e-mail, histórico de
   comandas/relatórios.
5. Realtime, consumido pelas telas de OPERATIONS/MANAGEMENT.
6. SaaS Admin (administração da plataforma, cross-tenant).

Cada um desses itens deve ser tratado como uma tarefa própria, com o
mesmo cuidado de não antecipar funcionalidades fora do escopo pedido.
