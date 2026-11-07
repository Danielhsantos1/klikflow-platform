# Padrões de teste — KlikFlow

## Não existe suite de testes automatizados ainda

O projeto não tem Jest/Vitest/Playwright configurado. A validação real
usada até aqui é:

1. **TypeScript**: `npx tsc --noEmit` — zero erro é obrigatório.
2. **Lint**: `npm run lint` — zero erro novo (warnings pré-existentes
   em `scripts/*.browser.js` são esperados, não bloqueiam).
3. **SQL direto contra o Neon real** (via MCP) pra toda mudança de
   schema/RLS/trigger/RPC — um bloco `do $$ ... end $$` descartável que
   simula o cenário (inserir dado de teste, exercitar a regra, checar o
   resultado com `raise exception` se falhar, `raise notice` se passar,
   limpar os dados de teste no final). Isso já substituiu dúzias de
   vezes "achar que a trigger funciona" por "provar que funciona".
4. **`scripts/*.browser.js`**: scripts manuais de teste via HTTP real
   contra a Data API (não um test runner — rodados manualmente quando
   existem, ver `test-permissions.browser.js`,
   `test-production-status.browser.js`,
   `test-tenant-isolation.browser.js`). Não inventar um novo formato de
   teste automatizado sem alinhar com o usuário antes — não é prioridade
   atual do projeto.
5. **Build real no Vercel**: o ambiente de desenvolvimento às vezes não
   tem as env vars de produção (`NEON_AUTH_BASE_URL`,
   `NEON_AUTH_COOKIE_SECRET`) — um erro de `npm run build` nesse caso,
   restrito a rotas que dependem de auth, não é bug de código. Confirmar
   isso rodando `tsc --noEmit` e `lint` separadamente antes de concluir
   que o build real vai falhar.

## O que testar antes de declarar algo pronto

- **Isolamento multi-tenant**: uma mudança em RLS/policy precisa provar
  que um tenant não enxerga/edita dado de outro. Testado historicamente
  com cenários cross-tenant read/write explícitos.
- **Transição de status**: qualquer UPDATE em `orders.status_id` (direto
  ou via trigger) precisa ter uma aresta em `order_status_transitions`
  — testar o caminho que deveria falhar (pular etapa) e não só o que
  deveria passar.
- **Permissão**: uma ação restrita por `has_permission()` precisa ser
  testada tanto pra quem tem a permissão quanto, idealmente, descrita
  pra quem não tem (ainda que o teste completo exija duas sessões
  diferentes, nem sempre viável via MCP).
- **Canal de pedido**: Totem, QR Code, Tablet na Mesa e Atendente têm
  regras diferentes (ver `product-standards.md`) — uma mudança no fluxo
  de pedido/pagamento precisa confirmar o comportamento nos canais
  afetados, não só no que motivou a mudança.

## Papel do QA & Test Engineer neste projeto

Sem suite automatizada, o QA Engineer deste time:

- Define os cenários de teste ANTES do Backend Architect escrever a
  migration (o que vira o bloco SQL de validação).
- Roda esses cenários de fato (via MCP do Neon ou manualmente na UI
  publicada) — nunca reporta "deveria funcionar" sem rodar.
- Diferencia explicitamente: **testado e passou**, **testado e falhou**,
  **não testado** (ex: bloqueado por falta de acesso a um ambiente) —
  nunca inventa um resultado.
- Verifica regressão nas 4 telas operacionais (Comandas, Caixa,
  Produção, Painel TV) quando a mudança toca o fluxo de pedido/
  pagamento, mesmo que o pedido original mencione só uma tela.
