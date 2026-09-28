-- Suporte a upload de imagem (banner de categoria e logo da empresa),
-- agora que existe um lugar real pra hospedar arquivo (Vercel Blob,
-- via /api/uploads). `products.image_url` já existia desde a Tarefa 04
-- e nunca teve UI pra preenchê-lo - esta tarefa também resolve isso.
alter table public.categories add column image_url text;
alter table public.tenants add column logo_url text;
