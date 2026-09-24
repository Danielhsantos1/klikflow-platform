"use client";

import { Button } from "@/components/ui/button";

export type CartLine = {
  key: string;
  name: string;
  unitPrice: number;
  quantity: number;
};

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function CartPanel({
  title = "Pedido atual",
  lines,
  actionLabel,
  onAction,
  actionDisabled,
  emptyLabel = "Nenhum item ainda.",
  onRemove,
}: {
  title?: string;
  lines: CartLine[];
  actionLabel: string;
  onAction: () => void;
  actionDisabled?: boolean;
  emptyLabel?: string;
  onRemove?: (lineKey: string) => void;
}) {
  const total = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);

  return (
    <div className="flex h-full flex-col gap-3">
      <h3 className="text-sm font-semibold">{title}</h3>

      <ul className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {lines.map((line) => (
          <li key={line.key} className="flex items-start justify-between gap-2 text-sm">
            <span>
              {line.quantity} {line.name}
            </span>
            <span className="flex shrink-0 items-center gap-2 text-muted">
              {formatBRL(line.unitPrice * line.quantity)}
              {onRemove && (
                <button
                  onClick={() => onRemove(line.key)}
                  className="text-danger hover:underline"
                  aria-label={`Remover uma unidade de ${line.name}`}
                >
                  −
                </button>
              )}
            </span>
          </li>
        ))}
        {lines.length === 0 && <li className="text-sm text-muted">{emptyLabel}</li>}
      </ul>

      <div className="flex flex-col gap-3 border-t border-border pt-3">
        <div className="flex items-center justify-between text-sm font-semibold">
          <span>Total</span>
          <span>{formatBRL(total)}</span>
        </div>
        <Button onClick={onAction} disabled={actionDisabled || lines.length === 0}>
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}
