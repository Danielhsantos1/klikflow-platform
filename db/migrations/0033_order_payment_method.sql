-- Caixa já pede a forma de pagamento (Dinheiro/PIX/Débito/Crédito) pra
-- guiar o atendente na hora de cobrar, mas isso nunca foi persistido -
-- pergunta deixada em aberto quando a tela foi criada, agora respondida:
-- adiciona a coluna pra ficar disponível em relatório futuro.
alter table public.orders
  add column payment_method text
  check (payment_method in ('cash', 'pix', 'debit', 'credit'));
