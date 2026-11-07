-- Controle de estoque com alerta de reposição - próxima lacuna da
-- comparação com concorrentes (Tairo: "Estoque em tempo real e lista
-- de compras"). Estende `ingredients` (0037) em vez de criar tabela
-- nova: mesmo cadastro que já serve pra ficha técnica/CMV agora também
-- guarda quanto tem em estoque e o mínimo antes de alertar.
--
-- Escopo desta etapa: contagem MANUAL (o funcionário ajusta o estoque
-- ao repor ou contar) - não desconta sozinho quando um pedido é feito.
-- Ligar consumo de ingrediente a pedido entregue é a etapa seguinte,
-- deliberadamente fora daqui pra não misturar duas coisas.
alter table public.ingredients
  add column current_stock numeric(10, 4) not null default 0 check (current_stock >= 0);

alter table public.ingredients
  add column min_stock numeric(10, 4) not null default 0 check (min_stock >= 0);
