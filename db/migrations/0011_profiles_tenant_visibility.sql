-- Tarefa 11: Gestão de usuários/perfis (MANAGEMENT).
--
-- `profiles_select_own` (Tarefa 01/02) só deixa cada usuário ver o
-- próprio perfil — correto como padrão de privacidade, mas incompatível
-- com uma tela de "Membros da equipe", que precisa mostrar o nome de
-- quem divide a empresa. Esta policy adicional (RLS combina policies do
-- mesmo comando com OR, nunca substitui a existente) libera a leitura
-- do perfil de outro usuário SOMENTE quando os dois têm uma membership
-- ativa no mesmo tenant — nunca perfis de usuários sem nenhuma empresa
-- em comum.

create policy "profiles_select_tenant_member"
  on public.profiles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.memberships m1
      join public.memberships m2 on m1.tenant_id = m2.tenant_id
      where m1.user_id = auth.uid()
        and m1.status = 'active'
        and m2.user_id = profiles.id
        and m2.status = 'active'
    )
  );
