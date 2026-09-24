-- Tarefa 4/N da funcionalidade "Canais de Atendimento" (QR Code / Totem).
--
-- Até aqui, o role `anonymous` da Data API não tinha nenhum GRANT em
-- nenhuma tabela (ver docs/database.md) — o cliente sem conta só
-- conseguia escrever através das RPCs da Tarefa 3/N. Mas pra montar um
-- carrinho ele precisa primeiro LER o cardápio, o nome da empresa e
-- confirmar que o Local de Consumo do link/QR é válido. Isso é uma
-- decisão de leitura pública, deliberadamente restrita:
--
--   - Só o que já é público por natureza num cardápio físico: nome da
--     empresa, categorias e produtos ativos, o Local de Consumo.
--   - Nunca preço de custo, dados de outro cliente, dados de outro
--     tenant, nem nada de `tabs`/`orders`/`order_items` — essas
--     continuam sem NENHUM grant para `anonymous`; toda escrita e
--     leitura de pedido do cliente passa pelas RPCs (`get_customer_tab`
--     etc.), nunca por SELECT direto.
--   - Sempre filtrado por `status = 'active'` — um produto arquivado ou
--     uma empresa suspensa não aparece pra ninguém de fora.

grant select on public.tenants to anonymous;

create policy "tenants_select_public_active"
  on public.tenants
  for select
  to anonymous
  using (status = 'active');

grant select on public.categories to anonymous;

create policy "categories_select_public_active"
  on public.categories
  for select
  to anonymous
  using (status = 'active');

grant select on public.products to anonymous;

create policy "products_select_public_active"
  on public.products
  for select
  to anonymous
  using (status = 'active');

grant select on public.consumption_locations to anonymous;

create policy "consumption_locations_select_public_active"
  on public.consumption_locations
  for select
  to anonymous
  using (status = 'active');
