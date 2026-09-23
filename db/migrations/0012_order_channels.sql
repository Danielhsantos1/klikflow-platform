-- Tarefa 2 da funcionalidade "Canais de Atendimento" (QR Code / Totem).
--
-- Só o schema desta etapa: nenhuma RPC de cliente, nenhuma UI ainda. O
-- objetivo é registrar de onde uma Comanda nasceu (`channel`) e preparar
-- o campo que vai autenticar um cliente sem conta numa Comanda específica
-- (`access_token`) — a validação de fato (Tarefa 3) fica pra depois,
-- assim como a coluna nunca é lida por nenhuma policy nesta migration.
--
-- `staff` é o comportamento 100% atual (funcionário abre a comanda) e é
-- o default — nenhuma comanda existente ou futura do fluxo já validado
-- (Tarefas 05/09) muda de comportamento.

alter table public.tabs
  add column channel text not null default 'staff'
    check (channel in ('staff', 'qr_code', 'totem'));

alter table public.tabs
  add column access_token uuid;

-- Um cliente sem conta só pode ter uma Comanda por token — permite achar
-- a Comanda a partir do link/QR sem vazar nada sobre outras.
create unique index tabs_access_token_idx
  on public.tabs (access_token)
  where access_token is not null;

-- Consistência de dados: comanda de funcionário nunca tem token; comanda
-- de cliente sempre tem (a Tarefa 3 é quem vai gerar esse valor).
alter table public.tabs
  add constraint tabs_channel_access_token_check
  check (
    (channel = 'staff' and access_token is null)
    or (channel <> 'staff' and access_token is not null)
  );

-- `opened_by` deixa de ser obrigatório: uma Comanda de cliente (Tarefa 3)
-- não tem um `profiles.id` de funcionário que a abriu.
alter table public.tabs
  alter column opened_by drop not null;
