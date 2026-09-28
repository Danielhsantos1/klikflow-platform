-- Cor de marca customizável por empresa (ex: uma cafeteria pode querer
-- um marrom/creme em vez do verde padrão do KlikFlow). Guardada como hex
-- simples; null = usa a cor padrão do KlikFlow (nenhuma mudança pra
-- quem não configurar nada). Reaproveita a policy de UPDATE já existente
-- (tenant.manage, 0006) e a leitura pública já existente (0014) — a
-- tela do cliente também precisa ler essa cor, sem estar logada.
alter table public.tenants add column brand_color text;
