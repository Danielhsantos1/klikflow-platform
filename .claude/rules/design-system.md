# Design system — KlikFlow

Identidade visual real extraída de `src/app/globals.css` e
`src/components/ui/*`. Não inventar paleta nova por módulo — todo
componente novo usa estes tokens.

## Tokens de cor (CSS custom properties, `src/app/globals.css`)

Consumidos como utilitário Tailwind (`text-brand`, `bg-surface`,
`border-border`, etc.):

- `background`, `surface`, `foreground`, `muted`, `border` — neutros de
  layout.
- `brand`, `brand-foreground`, `brand-soft` — cor da marca (customizável
  por tenant via `AppearanceSettings`/`brandStyleVars`, não é fixa).
- `accent`, `accent-foreground`, `accent-soft`.
- `success`, `success-soft` / `warning`, `warning-soft` / `danger`,
  `danger-soft` — estado semântico (confirmação, pendência, erro).

Cada cor semântica tem par `cor` + `cor-soft` (fundo suave pra badge/
alerta, texto saturado pra ênfase) — seguir esse par ao introduzir um
novo estado, não um tom solto.

## Componentes base (`src/components/ui/`)

`alert`, `avatar`, `badge`, `button`, `card`, `empty-state`, `input`,
`skeleton` — construídos com `class-variance-authority` (variantes
tipadas) + `cn()` (`tailwind-merge`). Antes de estilizar algo do zero,
checar se já existe uma variante aqui. `Badge` já tem variantes
`neutral`/`brand`/`accent`/`success`/`warning`/`danger` — usar a
semântica certa, não forçar uma cor incompatível com o sentido.

## Padrões de tela já estabelecidos

- **Tela de gestão/CRUD** (`CatalogManager`, `ChecklistsManager`,
  `RolesManager`): `<section>` por grupo de entidade, título `h2` +
  parágrafo `text-sm text-muted` explicando o propósito (uma frase,
  sem repetir o óbvio), lista, formulário de criação logo abaixo da
  lista.
- **Board operacional** (`ProductionBoard`, `CashierBoard`,
  `OperationsBoard`): colunas por estágio, polling a cada 5s
  (`POLL_MS`), card com hierarquia número do pedido > identificação >
  detalhe > uma única ação principal por card — nunca múltiplos botões
  de ação concorrendo no mesmo card.
- **Painel público** (`ReadyPanel`, `CustomerOrderPage`): tipografia
  grande, alto contraste, zero dado interno (preço de custo, margem,
  nome de funcionário nunca aparecem aqui). `ReadyPanel` é
  deliberadamente 100% informativo — nenhuma ação de escrita.
- **Erro inline, não modal**: `{error && <p className="text-sm
  text-danger">{error}</p>}` logo abaixo do título da seção — não usar
  `alert()`/toast para erro de formulário (só `window.confirm()` para
  confirmação de ação destrutiva, ex: excluir categoria).

## Responsividade

- Mobile-first implícito: `flex-col` por padrão, `sm:flex-row` quando
  a tela cresce. Formulários empilham no celular e viram linha a partir
  de `sm:`.
- Totem/Tablet do cliente (`CustomerOrderPage`) é a tela mais sensível
  a toque grande — botões `size="lg"`, nunca um alvo de toque pequeno
  pra ação principal.

## O que evitar

- Não introduzir uma segunda biblioteca de componentes (Radix solto,
  Headless UI, Chakra) — shadcn/ui já cobre os primitivos usados.
- Não hardcode de cor hex fora dos tokens, exceto nas poucas exceções
  já existentes e deliberadas (cores de status do `ProductionBoard` —
  `COLUMN_STYLES` — e o fundo escuro do `ReadyPanel`, pensadas pra
  contraste numa TV, não pra tema).
- Não duplicar texto de ajuda/instrução que já existe num componente
  pai — uma seção explica o conceito uma vez, cards filhos não repetem.
