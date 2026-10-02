-- Regra de negócio aprovada: nenhum pedido pula direto de "Novo" pra
-- "Pronto" — todo pedido precisa passar visivelmente por "Em
-- Produção", mesmo quando nenhum dos itens tem Estação de Produção
-- vinculada (Produção usa o status 'in_production', que existe desde
-- create_tenant() mas nunca tinha aresta de transição a partir de
-- 'new' — só existia o caminho morto new->accepted->in_production).
--
-- Adiciona a aresta new->in_production pra todos os tenants existentes
-- e pra create_tenant() (novos tenants). Não cria tabela nem coluna —
-- só um dado a mais em order_status_transitions, que já existe desde
-- 0009.
insert into public.order_status_transitions (tenant_id, from_status_id, to_status_id)
select os_new.tenant_id, os_new.id, os_prod.id
from public.order_statuses os_new
join public.order_statuses os_prod
  on os_prod.tenant_id = os_new.tenant_id and os_prod.key = 'in_production'
where os_new.key = 'new'
  and not exists (
    select 1 from public.order_status_transitions t
    where t.tenant_id = os_new.tenant_id
      and t.from_status_id = os_new.id
      and t.to_status_id = os_prod.id
  );

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

  insert into public.order_status_transitions (tenant_id, from_status_id, to_status_id)
  values
    (new_tenant.id, status_awaiting_payment, status_novo),
    (new_tenant.id, status_awaiting_payment, status_cancelado),
    (new_tenant.id, status_novo, status_aceito),
    (new_tenant.id, status_novo, status_pronto),
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
