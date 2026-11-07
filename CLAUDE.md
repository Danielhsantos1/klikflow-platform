@AGENTS.md

# Equipe de agentes especializados do KlikFlow

Este projeto tem um time de 8 agentes especializados em
`.claude/agents/`, coordenados pelo `product-orchestrator`, e 5
documentos de regra compartilhada em `.claude/rules/` (produto, design
system, padrões de desenvolvimento, banco de dados/segurança, testes)
que todo agente deve ler antes de agir.

Para uma funcionalidade nova ou mudança que envolva mais de uma
especialidade, acione o `product-orchestrator` — ele decide quem mais
participa. Para uma tarefa pequena e isolada, acione o especialista
certo diretamente (ex: só `frontend-engineer` para um ajuste visual sem
impacto de banco).

Ver `.claude/agents/00-product-orchestrator.md` para o fluxo completo
de colaboração e a lista dos 8 agentes.

