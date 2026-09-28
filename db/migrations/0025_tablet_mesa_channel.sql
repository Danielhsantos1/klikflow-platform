-- Terceiro canal de atendimento ao cliente: "Tablet na Mesa" — um tablet
-- fixo por mesa (não compartilhado como o Totem, não o celular do
-- próprio cliente como o QR Code). No banco funciona exatamente como
-- `qr_code` (Comanda por Local de Consumo, sem senha) — a única
-- diferença é o aparelho físico usado, então não precisa de nenhuma
-- tabela/coluna nova, só passar a aceitar o valor no canal.

alter table public.tabs
  drop constraint tabs_channel_check;

alter table public.tabs
  add constraint tabs_channel_check
  check (channel = any (array['staff', 'qr_code', 'totem', 'tablet_mesa']));

create or replace function public.open_customer_tab(p_location_id uuid, p_channel text)
returns public.tabs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_new_tab public.tabs;
begin
  if p_channel not in ('qr_code', 'totem', 'tablet_mesa') then
    raise exception 'invalid channel: %', p_channel;
  end if;

  select u.tenant_id into v_tenant_id
  from public.consumption_locations cl
  join public.units u on u.id = cl.unit_id
  where cl.id = p_location_id
    and cl.status = 'active';

  if v_tenant_id is null then
    raise exception 'location not found or inactive';
  end if;

  begin
    insert into public.tabs (tenant_id, consumption_location_id, channel, access_token)
    values (v_tenant_id, p_location_id, p_channel, gen_random_uuid())
    returning * into v_new_tab;
  exception
    when unique_violation then
      raise exception 'this location already has an open tab';
  end;

  return v_new_tab;
end;
$$;
