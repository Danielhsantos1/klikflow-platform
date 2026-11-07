# Padrões de produto — KlikFlow

## O que é o KlikFlow

Plataforma operacional configurável para negócios de atendimento
(cafeterias, restaurantes, bares — qualquer um com comanda/pedido/
produção), SaaS multi-tenant. O domínio é genérico por decisão
arquitetural: nada no schema ramifica comportamento por segmento
(`tenants.segment` é só descritivo).

## Responsabilidade operacional — separação já decidida, não reabrir sem necessidade

```
COMANDAS  → cria e acompanha pedido (nunca ação de pagamento/produção)
CAIXA     → recebe pagamento, fecha a comanda inteira
PRODUÇÃO  → inicia produção, marca pronto, marca entregue
PAINEL TV → só exibe pedidos prontos (zero ação de escrita)
```

Essa separação foi resultado de uma reestruturação deliberada (migrations
0029–0039): antes, Comandas também confirmava pagamento e fechava
comanda, o Painel TV deixava qualquer um marcar "Entregue" tocando a
tela. Um Product Manager que proponha mover uma ação de volta pra outra
tela precisa justificar por que a separação atual não serve — não é
"gosto", é decisão já tomada com motivo registrado.

## Canais de pedido — comportamento por canal é intencional, não bug

- **Totem**: paga na hora, pelo próprio totem (PIX/Débito/Crédito).
  Pedido nasce em "Aguardando pagamento", só vai pra produção depois
  de confirmado. Comanda do totem fecha sozinha após o pagamento (é um
  aparelho compartilhado, não uma mesa).
- **QR Code / Tablet na Mesa**: cliente monta o carrinho localmente
  (nada no banco até confirmar), pode pedir quantas vezes quiser — cada
  envio já vai direto pra produção, SEM pagamento por pedido. O
  pagamento de tudo acontece no Caixa, quando o cliente for embora.
- **Atendente (Comandas)**: mesmo comportamento do QR/Tablet — pedido
  vai pra produção na hora, paga no Caixa no final.

Antes de mudar esse comportamento pra um canal, confirmar com o usuário
se é uma mudança pontual ou uma reinterpretação do modelo de negócio
inteiro (já aconteceu uma vez nesta sessão).

## Critérios de aceite — como registrar

Toda funcionalidade nova, por menor que seja, deve deixar claro antes
de implementar:

1. **Problema real** — qual dor concreta motivou o pedido (evitar
   recurso "bonito" sem necessidade).
2. **Fluxo do usuário** — passo a passo de quem usa (atendente,
   cliente, dono).
3. **Regra de negócio** — o que É permitido e o que NÃO é.
4. **Exceção** — o que acontece quando falta dado, permissão, ou o
   fluxo é interrompido no meio.
5. **Como validar** — o teste concreto (SQL, clique na UI, ou os dois)
   que prova que funciona, antes de considerar entregue.

Não transformar toda ideia em funcionalidade sem passar por isso —
perguntar ao usuário quando o pedido for ambíguo em vez de assumir.

## Lacunas conhecidas (comparação com concorrentes — Tairo, levantada
nesta sessão)

Resolvidas: fichas técnicas/CMV, controle de estoque com alerta de
reposição (manual, sem desconto automático por pedido ainda),
checklists de abertura/fechamento, fluxo de caixa mensal/anual.

Ainda em aberto, fora do escopo até decisão explícita do usuário:
pagamento real via gateway/maquininha (hoje 100% simulado),
integração com impressora térmica, fidelidade com pontos, delivery/
iFood.
