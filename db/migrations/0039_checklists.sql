-- Checklists de abertura/fechamento - próxima lacuna da comparação com
-- concorrentes (Tairo: "rotinas de abertura, fechamento e padrão da
-- equipe"). Mesmo padrão das demais entidades de cadastro por tenant.
--
-- Desenho: `checklists` é o modelo (ex: "Abertura", "Fechamento"),
-- `checklist_items` são os passos dele. Em vez de criar uma "execução"
-- (run) explícita por turno, a conclusão de um item fica marcada por
-- DIA (`checklist_item_completions`, uma linha por item+dia) - o
-- checklist "de hoje" é só os itens do modelo junto com a conclusão de
-- hoje (se existir); no dia seguinte volta tudo desmarcado sozinho,
-- sem precisar de um job de reset.

insert into public.permissions (key, description) values
  ('checklists.manage', 'Criar, editar checklists e marcar itens como concluídos');

-- ---------------------------------------------------------------------
-- checklists (o modelo/rotina, ex: "Abertura", "Fechamento")
-- ---------------------------------------------------------------------
create table public.checklists (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create index checklists_tenant_id_idx on public.checklists (tenant_id);

create trigger set_checklists_updated_at
  before update on public.checklists
  for each row
  execute function public.set_updated_at();

alter table public.checklists enable row level security;
alter table public.checklists force row level security;

grant select, insert, update, delete on public.checklists to authenticated;

create policy "checklists_select_member"
  on public.checklists
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

create policy "checklists_insert_admin"
  on public.checklists
  for insert
  to authenticated
  with check (public.has_permission(tenant_id, 'checklists.manage'));

create policy "checklists_update_admin"
  on public.checklists
  for update
  to authenticated
  using (public.has_permission(tenant_id, 'checklists.manage'))
  with check (public.has_permission(tenant_id, 'checklists.manage'));

create policy "checklists_delete_admin"
  on public.checklists
  for delete
  to authenticated
  using (public.has_permission(tenant_id, 'checklists.manage'));

-- ---------------------------------------------------------------------
-- checklist_items (os passos de um checklist)
-- ---------------------------------------------------------------------
create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.checklists (id) on delete cascade,
  label text not null,
  sequence integer not null default 0,
  created_at timestamptz not null default now()
);

create index checklist_items_checklist_id_idx on public.checklist_items (checklist_id);

alter table public.checklist_items enable row level security;
alter table public.checklist_items force row level security;

grant select, insert, update, delete on public.checklist_items to authenticated;

create policy "checklist_items_select_member"
  on public.checklist_items
  for select
  to authenticated
  using (
    exists (
      select 1 from public.checklists c
      where c.id = checklist_items.checklist_id
        and public.is_tenant_member(c.tenant_id)
    )
  );

create policy "checklist_items_insert_admin"
  on public.checklist_items
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.checklists c
      where c.id = checklist_items.checklist_id
        and public.has_permission(c.tenant_id, 'checklists.manage')
    )
  );

create policy "checklist_items_update_admin"
  on public.checklist_items
  for update
  to authenticated
  using (
    exists (
      select 1 from public.checklists c
      where c.id = checklist_items.checklist_id
        and public.has_permission(c.tenant_id, 'checklists.manage')
    )
  )
  with check (
    exists (
      select 1 from public.checklists c
      where c.id = checklist_items.checklist_id
        and public.has_permission(c.tenant_id, 'checklists.manage')
    )
  );

create policy "checklist_items_delete_admin"
  on public.checklist_items
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.checklists c
      where c.id = checklist_items.checklist_id
        and public.has_permission(c.tenant_id, 'checklists.manage')
    )
  );

-- ---------------------------------------------------------------------
-- checklist_item_completions: um item marcado como feito NUM DIA.
-- Existir a linha = feito; não existir = pendente. "Hoje" desmarcado
-- sozinho no dia seguinte é consequência natural de filtrar por
-- completed_on = current_date, sem job nenhum.
-- ---------------------------------------------------------------------
create table public.checklist_item_completions (
  id uuid primary key default gen_random_uuid(),
  checklist_item_id uuid not null references public.checklist_items (id) on delete cascade,
  completed_on date not null default current_date,
  completed_by uuid not null references public.profiles (id),
  completed_at timestamptz not null default now(),
  unique (checklist_item_id, completed_on)
);

create index checklist_item_completions_item_id_idx on public.checklist_item_completions (checklist_item_id);

alter table public.checklist_item_completions enable row level security;
alter table public.checklist_item_completions force row level security;

grant select, insert, delete on public.checklist_item_completions to authenticated;

create policy "checklist_item_completions_select_member"
  on public.checklist_item_completions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.checklist_items ci
      join public.checklists c on c.id = ci.checklist_id
      where ci.id = checklist_item_completions.checklist_item_id
        and public.is_tenant_member(c.tenant_id)
    )
  );

create policy "checklist_item_completions_insert_member"
  on public.checklist_item_completions
  for insert
  to authenticated
  with check (
    completed_by = auth.uid()
    and exists (
      select 1 from public.checklist_items ci
      join public.checklists c on c.id = ci.checklist_id
      where ci.id = checklist_item_completions.checklist_item_id
        and public.has_permission(c.tenant_id, 'checklists.manage')
    )
  );

create policy "checklist_item_completions_delete_member"
  on public.checklist_item_completions
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.checklist_items ci
      join public.checklists c on c.id = ci.checklist_id
      where ci.id = checklist_item_completions.checklist_item_id
        and public.has_permission(c.tenant_id, 'checklists.manage')
    )
  );

-- Tenants que já existem não ganham essa permissão nova sozinhos -
-- create_tenant() só dá "todas as permissões" no momento da criação do
-- tenant (mesma observação da 0037).
insert into public.role_permissions (role_id, permission_key)
select r.id, 'checklists.manage'
from public.roles r
join public.role_permissions rp on rp.role_id = r.id and rp.permission_key = 'catalog.manage'
where not exists (
  select 1 from public.role_permissions existing
  where existing.role_id = r.id and existing.permission_key = 'checklists.manage'
);
