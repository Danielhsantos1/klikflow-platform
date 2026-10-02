-- Inconsistência encontrada em análise: a 0030 descreveu como regra de
-- negócio que nenhum pedido pula de "Novo" pra "Pronto" direto, mas o
-- próprio SQL da 0030 recriou `create_tenant()` copiando a aresta
-- new->ready que vinha desde a 0018 (lá ela existia pra sustentar um
-- auto-avanço que a 0029 já tinha desativado, mas a aresta em si nunca
-- foi removida). Com essa aresta viva em `order_status_transitions`,
-- `validate_order_status_transition` (0009) ainda aceita um UPDATE
-- direto de "new" pra "ready" — hoje nenhum caminho da UI faz esse
-- UPDATE (Produção sempre passa por "in_production" primeiro, ver
-- production-board.tsx), mas a regra ficava garantida só por convenção
-- da UI, não pelo banco.
--
-- Remove a aresta new->ready pra tenants existentes e pra
-- create_tenant() (novos tenants). Não mexe em mais nada: a aresta
-- accepted->in_production, a in_production->ready e o auto-avanço de
-- check_order_ready_after_station_update (0018, ainda válido) continuam
-- intactos.
delete from public.order_status_transitions t
using public.order_statuses os_new, public.order_statuses os_ready
where t.from_status_id = os_new.id
  and t.to_status_id = os_ready.id
  and os_new.tenant_id = t.tenant_id
  and os_ready.tenant_id = t.tenant_id
  and os_new.key = 'new'
  and os_ready.key = 'ready';

create or replace function public.create_tenant(tenant_name text, tenant_segment text default 'other')
returns public.tenants
language plpgsql
security definer
set search_path = public
as $$
declare
  new_tenant public.tenants;
  owner_role_id uuid;
  status_awaiting_payment uuid;
  status_novo uuid;
  status_aceito uuid;
  status_producao uuid;
  status_pronto uuid;
  status_entregue uuid;
  status_finalizado uuid;
  status_cancelado uuid;
begin
  if auth.uid() is null then
    raise exception 'create_tenant requires an authenticated user';
  end if;

  insert into public.tenants (name, segment)
  values (tenant_name, tenant_segment)
  returning * into new_tenant;

  insert into public.roles (tenant_id, name, is_system)
  values (new_tenant.id, 'Proprietário', true)
  returning id into owner_role_id;

  insert into public.role_permissions (role_id, permission_key)
  select owner_role_id, key from public.permissions;

  insert into public.memberships (tenant_id, user_id, role_id, status)
  values (new_tenant.id, auth.uid(), owner_role_id, 'active');

  insert into public.units (tenant_id, name)
  values (new_tenant.id, 'Unidade Principal');

  insert into public.order_statuses (tenant_id, key, label, sequence, is_terminal)
  values
    (new_tenant.id, 'awaiting_payment', 'Aguardando pagamento', 0, false),
    (new_tenant.id, 'new', 'Novo', 1, false),
    (new_tenant.id, 'accepted', 'Aceito', 2, false),
    (new_tenant.id, 'in_production', 'Em Produção', 3, false),
    (new_tenant.id, 'ready', 'Pronto', 4, false),
    (new_tenant.id, 'delivered', 'Entregue', 5, false),
    (new_tenant.id, 'completed', 'Finalizado', 6, true),
    (new_tenant.id, 'cancelled', 'Cancelado', 99, true);

  select id into status_awaiting_payment from public.order_statuses where tenant_id = new_tenant.id and key = 'awaiting_payment';
  select id into status_novo from public.order_statuses where tenant_id = new_tenant.id and key = 'new';
  select id into status_aceito from public.order_statuses where tenant_id = new_tenant.id and key = 'accepted';
  select id into status_producao from public.order_statuses where tenant_id = new_tenant.id and key = 'in_production';
  select id into status_pronto from public.order_statuses where tenant_id = new_tenant.id and key = 'ready';
  select id into status_entregue from public.order_statuses where tenant_id = new_tenant.id and key = 'delivered';
  select id into status_finalizado from public.order_statuses where tenant_id = new_tenant.id and key = 'completed';
  select id into status_cancelado from public.order_statuses where tenant_id = new_tenant.id and key = 'cancelled';

  -- Sem new->ready direto: todo pedido precisa passar por "Em Produção"
  -- (via accepted->in_production ou, pra quem não tem estação, direto
  -- new->in_production da 0030) antes de virar "Pronto".
  insert into public.order_status_transitions (tenant_id, from_status_id, to_status_id)
  values
    (new_tenant.id, status_awaiting_payment, status_novo),
    (new_tenant.id, status_awaiting_payment, status_cancelado),
    (new_tenant.id, status_novo, status_aceito),
    (new_tenant.id, status_novo, status_producao),
    (new_tenant.id, status_aceito, status_producao),
    (new_tenant.id, status_producao, status_pronto),
    (new_tenant.id, status_pronto, status_entregue),
    (new_tenant.id, status_novo, status_cancelado),
    (new_tenant.id, status_aceito, status_cancelado),
    (new_tenant.id, status_producao, status_cancelado),
    (new_tenant.id, status_pronto, status_cancelado);

  return new_tenant;
end;
$$;
