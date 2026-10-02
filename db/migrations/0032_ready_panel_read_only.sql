-- Decisão de produto (confirmada): o Painel TV é só informativo pro
-- cliente - quem marca "Entregue" é sempre a equipe, pela tela de
-- Produção. `mark_order_delivered` (0027) continua existindo e correta
-- (ready->delivered é uma transição válida), só deixa de ser chamável
-- por qualquer um tocando a TV. O client da TV (ready-panel.tsx)
-- também para de chamá-la nesta mesma etapa.
--
-- Revoga tanto de `anonymous` quanto de `public`: toda função ganha
-- EXECUTE para PUBLIC automaticamente na criação (diferente de
-- tabelas), e essa função nunca tinha revogado isso - só tirar o grant
-- de `anonymous` não bastava, o grant implícito de PUBLIC ainda
-- permitiria a chamada anônima.
revoke execute on function public.mark_order_delivered(uuid, uuid) from anonymous;
revoke execute on function public.mark_order_delivered(uuid, uuid) from public;
