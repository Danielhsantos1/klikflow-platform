"use client";

import { cn } from "@/lib/utils/cn";

export function CategoryPills({
  categories,
  activeId,
  onSelect,
}: {
  categories: { id: string; name: string }[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      <button
        onClick={() => onSelect(null)}
        className={cn(
          "shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
          activeId === null
            ? "bg-foreground text-background"
            : "bg-black/[0.05] text-foreground hover:bg-black/[0.08] dark:bg-white/[0.08] dark:hover:bg-white/[0.12]",
        )}
      >
        Tudo
      </button>
      {categories.map((category) => (
        <button
          key={category.id}
          onClick={() => onSelect(category.id)}
          className={cn(
            "shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            activeId === category.id
              ? "bg-foreground text-background"
              : "bg-black/[0.05] text-foreground hover:bg-black/[0.08] dark:bg-white/[0.08] dark:hover:bg-white/[0.12]",
          )}
        >
          {category.name}
        </button>
      ))}
    </div>
  );
}
