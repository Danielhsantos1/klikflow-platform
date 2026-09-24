-- Tarefa 5/N da funcionalidade "Canais de Atendimento" (QR Code / Totem).
--
-- Decisão do usuário: sem gateway de pagamento nesta primeira versão —
-- o cliente monta o pedido pelo QR/Totem, mas continua pagando no
-- balcão com a equipe (dinheiro, maquininha, Pix manual). O sistema só
-- precisa deixar claro que aquele Pedido ainda não foi pago, até um
-- funcionário confirmar.
--
-- Reaproveita inteiramente a máquina de status configurável da Tarefa
-- 06 — nenhuma tabela nova. Um Pedido de canal `qr_code`/`totem` nasce
-- no status `awaiting_payment` em vez do de menor `sequence` do tenant;
-- um Pedido de canal `staff` (o fluxo já validado nas Tarefas 05/09)
-- continua exatamente como sempre foi, sem nenhuma mudança de
-- comportamento.

-- `default_order_status()`: agora consulta o `channel` da Comanda do
-- Pedido antes de decidir o status inicial.
create or replace function public.default_order_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel text;
begin
  if new.status_id is null then
    select channel into v_channel from public.tabs where id = new.tab_id;

    if v_channel is distinct from 'staff' then
      select id into new.status_id
      from public.order_statuses
      where tenant_id = new.tenant_id and key = 'awaiting_payment';
    end if;

    -- Fluxo staff inalterado, e fallback de segurança para um tenant
    -- de cliente que por algum motivo não tenha `awaiting_payment`
    -- configurado: nunca deixa um Pedido sem status_id nenhum.
    if new.status_id is null then
      select id into new.status_id
      from public.order_statuses
      where tenant_id = new.tenant_id and key <> 'awaiting_payment'
      order by sequence asc
      limit 1;
    end if;
  end if;

  if new.status_id is null then
    raise exception 'tenant % has no order_statuses configured', new.tenant_id;
  end if;

  return new;
end;
$$;

-- `create_tenant()`: todo tenant novo já nasce com `awaiting_payment`
-- (sequence 0 — antes de `new`) e a transição pra liberar o Pedido
-- depois que a equipe confirma o pagamento.
create or replace function public.create_tenant(tenant_name text, tenant_segment text default 'other')
returns public.tenants
language plpgsql
security definer
set search_path = public
as $$
declare
  new_tenant public.tenants;
  owner_role_id uuid;
  status_aguardando_pagamento uuid;
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

  select id into status_aguardando_pagamento from public.order_statuses where tenant_id = new_tenant.id and key = 'awaiting_payment';
  select id into status_novo from public.order_statuses where tenant_id = new_tenant.id and key = 'new';
  select id into status_aceito from public.order_statuses where tenant_id = new_tenant.id and key = 'accepted';
  select id into status_producao from public.order_statuses where tenant_id = new_tenant.id and key = 'in_production';
  select id into status_pronto from public.order_statuses where tenant_id = new_tenant.id and key = 'ready';
  select id into status_entregue from public.order_statuses where tenant_id = new_tenant.id and key = 'delivered';
  select id into status_finalizado from public.order_statuses where tenant_id = new_tenant.id and key = 'completed';
  select id into status_cancelado from public.order_statuses where tenant_id = new_tenant.id and key = 'cancelled';

  insert into public.order_status_transitions (tenant_id, from_status_id, to_status_id)
  values
    (new_tenant.id, status_aguardando_pagamento, status_novo),
    (new_tenant.id, status_aguardando_pagamento, status_cancelado),
    (new_tenant.id, status_novo, status_aceito),
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

-- Backfill: tenants criados antes desta migration não têm
-- `awaiting_payment` na própria lista de status configurada.
insert into public.order_statuses (tenant_id, key, label, sequence, is_terminal)
select t.id, 'awaiting_payment', 'Aguardando pagamento', 0, false
from public.tenants t
where not exists (
  select 1 from public.order_statuses s
  where s.tenant_id = t.id and s.key = 'awaiting_payment'
);

insert into public.order_status_transitions (tenant_id, from_status_id, to_status_id)
select s_from.tenant_id, s_from.id, s_to.id
from public.order_statuses s_from
join public.order_statuses s_to
  on s_to.tenant_id = s_from.tenant_id and s_to.key = 'new'
where s_from.key = 'awaiting_payment'
  and not exists (
    select 1 from public.order_status_transitions t
    where t.from_status_id = s_from.id and t.to_status_id = s_to.id
  );
