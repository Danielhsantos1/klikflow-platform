-- Etapa 1/N do fluxo "Totem com senha / Tablet na mesa": pagamento
-- (ainda simulado) trava a produção de verdade, gera uma senha, e o
-- pedido avança sozinho para "Pronto" quando toda a produção termina —
-- hoje esse avanço não existe, nada nunca move um pedido além de "Novo".
--
-- `pickup_number` reinicia por dia (comum em cafeterias/lanchonetes) e é
-- por tenant. `customer_name` fica disponível para a Etapa 2/N perguntar
-- no totem/tablet — nada aqui ainda escreve nele.

alter table public.orders add column customer_name text;
alter table public.orders add column pickup_number integer;

-- `seed_order_item_stations` (0009) rodava incondicionalmente no INSERT
-- do item — um item de um pedido "aguardando pagamento" já entrava na
-- fila de produção antes de qualquer confirmação. Agora só semeia se o
-- pedido já não está aguardando pagamento.
create or replace function public.seed_order_item_stations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status_key text;
begin
  select os.key into v_status_key
  from public.orders o
  join public.order_statuses os on os.id = o.status_id
  where o.id = new.order_id;

  if v_status_key = 'awaiting_payment' then
    return new;
  end if;

  insert into public.order_item_stations (order_item_id, station_id, sequence)
  select new.id, ps.station_id, ps.sequence
  from public.product_stations ps
  where ps.product_id = new.product_id;

  return new;
end;
$$;

-- Ao sair de "aguardando_pagamento" (pagamento confirmado), gera a
-- senha do dia. Fica em trigger BEFORE para poder escrever em NEW.
create or replace function public.assign_pickup_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_key text;
  v_new_key text;
begin
  select key into v_old_key from public.order_statuses where id = old.status_id;
  select key into v_new_key from public.order_statuses where id = new.status_id;

  if v_old_key = 'awaiting_payment' and v_new_key <> 'awaiting_payment' and new.pickup_number is null then
    select coalesce(max(pickup_number), 0) + 1 into new.pickup_number
    from public.orders
    where tenant_id = new.tenant_id
      and created_at::date = current_date;
  end if;

  return new;
end;
$$;

create trigger assign_pickup_number_trigger
  before update on public.orders
  for each row
  when (old.status_id is distinct from new.status_id)
  execute function public.assign_pickup_number();

-- Ao sair de "aguardando_pagamento": semeia retroativamente as estações
-- dos itens que já tinham sido lançados (pulados acima enquanto o
-- pedido ainda não tinha pago), e confere se o pedido já nasce "Pronto"
-- (nenhum item precisa de preparo - ex: só itens já prontos).
create or replace function public.on_order_status_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_key text;
  v_new_key text;
  v_ready_status_id uuid;
  v_pending_count integer;
begin
  select key into v_old_key from public.order_statuses where id = old.status_id;
  select key into v_new_key from public.order_statuses where id = new.status_id;

  if v_old_key = 'awaiting_payment' and v_new_key <> 'awaiting_payment' then
    insert into public.order_item_stations (order_item_id, station_id, sequence)
    select oi.id, ps.station_id, ps.sequence
    from public.order_items oi
    join public.product_stations ps on ps.product_id = oi.product_id
    where oi.order_id = new.id
      and not exists (
        select 1 from public.order_item_stations existing
        where existing.order_item_id = oi.id and existing.station_id = ps.station_id
      );
  end if;

  if v_new_key = 'new' then
    select count(*) into v_pending_count
    from public.order_item_stations ois
    join public.order_items oi on oi.id = ois.order_item_id
    where oi.order_id = new.id
      and ois.status <> 'done';

    if v_pending_count = 0 then
      select id into v_ready_status_id
      from public.order_statuses
      where tenant_id = new.tenant_id and key = 'ready';

      if v_ready_status_id is not null then
        update public.orders set status_id = v_ready_status_id where id = new.id;
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger on_order_status_changed_trigger
  after update on public.orders
  for each row
  when (old.status_id is distinct from new.status_id)
  execute function public.on_order_status_changed();

-- Quando a Produção marca o último item pendente de um pedido como
-- "done", o pedido avança sozinho de "Novo" para "Pronto" - hoje isso
-- exigia uma ação manual que nem existe na UI.
create or replace function public.check_order_ready_after_station_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_tenant_id uuid;
  v_status_key text;
  v_ready_status_id uuid;
  v_pending_count integer;
begin
  if new.status <> 'done' then
    return new;
  end if;

  select oi.order_id into v_order_id
  from public.order_items oi
  where oi.id = new.order_item_id;

  select o.tenant_id, os.key into v_tenant_id, v_status_key
  from public.orders o
  join public.order_statuses os on os.id = o.status_id
  where o.id = v_order_id;

  if v_status_key <> 'new' then
    return new;
  end if;

  select count(*) into v_pending_count
  from public.order_item_stations ois
  join public.order_items oi on oi.id = ois.order_item_id
  where oi.order_id = v_order_id
    and ois.status <> 'done';

  if v_pending_count = 0 then
    select id into v_ready_status_id
    from public.order_statuses
    where tenant_id = v_tenant_id and key = 'ready';

    if v_ready_status_id is not null then
      update public.orders set status_id = v_ready_status_id where id = v_order_id;
    end if;
  end if;

  return new;
end;
$$;

create trigger check_order_ready_after_station_update_trigger
  after update on public.order_item_stations
  for each row
  execute function public.check_order_ready_after_station_update();

-- O grafo de transições nunca tinha uma aresta de "Novo" direto pra
-- "Pronto" (a UI nunca passava por "Aceito"/"Em Produção" - esses
-- status ficavam mortos). Sem essa aresta, o avanço automático acima
-- seria bloqueado pela validação de transição (0009). Adiciona a
-- aresta para tenants existentes e para create_tenant() (novos tenants).
insert into public.order_status_transitions (tenant_id, from_status_id, to_status_id)
select os_new.tenant_id, os_new.id, os_ready.id
from public.order_statuses os_new
join public.order_statuses os_ready
  on os_ready.tenant_id = os_new.tenant_id and os_ready.key = 'ready'
where os_new.key = 'new'
  and not exists (
    select 1 from public.order_status_transitions t
    where t.tenant_id = os_new.tenant_id
      and t.from_status_id = os_new.id
      and t.to_status_id = os_ready.id
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
    (new_tenant.id, status_aceito, status_producao),
    (new_tenant.id, status_producao, status_pronto),
    (new_tenant.id, status_pronto, status_entregue),
    (new_tenant.id, status_entregue, status_finalizado),
    (new_tenant.id, status_novo, status_cancelado),
    (new_tenant.id, status_aceito, status_cancelado),
    (new_tenant.id, status_producao, status_cancelado),
    (new_tenant.id, status_pronto, status_cancelado);

  return new_tenant;
end;
$$;
