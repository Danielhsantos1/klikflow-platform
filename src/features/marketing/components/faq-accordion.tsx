"use client";

import { useState } from "react";

const FAQ_ITEMS = [
  {
    question: "Preciso de totem ou maquininha pra usar o KlikFlow?",
    answer:
      "Não. Comandas, Caixa e Produção funcionam no navegador, em qualquer computador ou tablet. Totem e Tablet na Mesa são canais extras pro cliente pedir sozinho, não um pré-requisito.",
  },
  {
    question: "O cliente precisa baixar algum aplicativo?",
    answer:
      "Não. Pelo QR Code, o cliente abre o cardápio direto no navegador do celular, sem cadastro e sem instalar nada.",
  },
  {
    question: "Dá pra ter mais de uma unidade na mesma conta?",
    answer:
      "Sim — a plataforma é multi-tenant desde a fundação: cada empresa isola completamente os dados da outra, e uma empresa pode ter mais de uma Unidade.",
  },
  {
    question: "Como funciona o controle de custo dos produtos?",
    answer:
      "Em Catálogo, cada produto pode ter uma ficha técnica (ingredientes + quantidade). O sistema calcula custo, CMV% e margem automaticamente — sem planilha separada.",
  },
  {
    question: "Quem pode ver o quê dentro da equipe?",
    answer:
      "Permissões são configuráveis por Perfil, não um \"admin\"/\"garçom\" fixo. Você decide quem acessa Caixa, Catálogo, Equipe, Fluxo de caixa, etc.",
  },
];

export function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
      {FAQ_ITEMS.map((item, index) => {
        const isOpen = openIndex === index;

        return (
          <div
            key={item.question}
            className={`rounded-xl border px-5 py-4 transition-colors ${
              isOpen ? "border-brand bg-brand-soft" : "border-border"
            }`}
          >
            <button
              type="button"
              className="flex w-full items-center justify-between gap-4 text-left font-semibold"
              onClick={() => setOpenIndex(isOpen ? null : index)}
            >
              {item.question}
              <span className="shrink-0 text-xl text-brand">{isOpen ? "−" : "+"}</span>
            </button>
            {isOpen && <p className="mt-2 text-sm text-muted">{item.answer}</p>}
          </div>
        );
      })}
    </div>
  );
}
