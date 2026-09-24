"use client";

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function ProductCard({
  name,
  price,
  onAdd,
}: {
  name: string;
  price: number;
  onAdd: () => void;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <button
      onClick={onAdd}
      className="flex flex-col items-start gap-2 rounded-xl border border-border bg-surface p-3 text-left transition-colors hover:border-brand hover:bg-brand-soft/40"
    >
      <div className="flex h-16 w-full items-center justify-center rounded-lg bg-brand-soft text-xl font-bold text-brand">
        {initial}
      </div>
      <div className="flex w-full flex-col">
        <span className="text-sm font-medium">{name}</span>
        <span className="text-xs text-muted">{formatBRL(price)}</span>
      </div>
    </button>
  );
}
