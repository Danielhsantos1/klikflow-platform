"use client";

import { useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";

export type NavItem = {
  key: string;
  label: string;
  available: boolean;
};

export type NavSection = {
  label?: string;
  items: NavItem[];
};

function Logo() {
  return (
    <div className="flex flex-col">
      <span className="text-lg font-extrabold tracking-tight">
        Klik<span className="text-brand">Flow</span>
      </span>
      <span className="text-[0.65rem] font-medium text-muted">Simples. Ágil. Conforme.</span>
    </div>
  );
}

function NavList({
  sections,
  activeKey,
  onSelect,
}: {
  sections: NavSection[];
  activeKey: string;
  onSelect: (key: string) => void;
}) {
  return (
    <nav className="flex flex-col gap-4">
      {sections.map((section, index) => (
        <div key={section.label ?? index} className="flex flex-col gap-1">
          {section.label && (
            <p className="px-3 text-[0.68rem] font-semibold uppercase tracking-wide text-muted">
              {section.label}
            </p>
          )}
          {section.items.map((item) => (
            <button
              key={item.key}
              disabled={!item.available}
              onClick={() => item.available && onSelect(item.key)}
              className={cn(
                "flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                item.available
                  ? activeKey === item.key
                    ? "bg-brand-soft text-brand"
                    : "text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                  : "cursor-not-allowed text-muted",
              )}
            >
              <span>{item.label}</span>
              {!item.available && <Badge variant="neutral">Em breve</Badge>}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}

export function AppShell({
  companyName,
  unitName,
  userName,
  sections,
  activeKey,
  onSelect,
  userMenu,
  children,
}: {
  companyName: string;
  unitName: string;
  userName: string;
  sections: NavSection[];
  activeKey: string;
  onSelect: (key: string) => void;
  userMenu: React.ReactNode;
  children: React.ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen w-full flex-col">
      <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface/95 px-4 backdrop-blur sm:px-6">
        <div className="flex items-center gap-3">
          <button
            className="rounded-md p-1.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] lg:hidden"
            aria-label="Abrir menu"
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            <span className="block h-0.5 w-5 bg-foreground" />
            <span className="mt-1 block h-0.5 w-5 bg-foreground" />
            <span className="mt-1 block h-0.5 w-5 bg-foreground" />
          </button>
          <Logo />
        </div>

        <div className="hidden flex-col items-center text-center sm:flex">
          <span className="text-sm font-semibold">{companyName}</span>
          <span className="text-xs text-muted">{unitName}</span>
        </div>

        <div className="flex items-center gap-3">
          <Avatar name={userName} />
          {userMenu}
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border bg-surface px-3 py-4 lg:flex">
          <NavList sections={sections} activeKey={activeKey} onSelect={onSelect} />
        </aside>

        {mobileNavOpen && (
          <div className="fixed inset-0 z-30 flex lg:hidden">
            <div
              className="absolute inset-0 bg-black/30"
              onClick={() => setMobileNavOpen(false)}
            />
            <aside className="relative flex h-full w-64 flex-col gap-1 overflow-y-auto bg-surface px-3 py-4 shadow-xl">
              <div className="flex items-center justify-between px-1 pb-3">
                <Logo />
                <button
                  className="rounded-md p-1 text-sm text-muted hover:bg-black/[0.05]"
                  onClick={() => setMobileNavOpen(false)}
                  aria-label="Fechar menu"
                >
                  ✕
                </button>
              </div>
              <NavList
                sections={sections}
                activeKey={activeKey}
                onSelect={(key) => {
                  onSelect(key);
                  setMobileNavOpen(false);
                }}
              />
            </aside>
          </div>
        )}

        <main className="flex flex-1 flex-col overflow-x-hidden">
          <div className="flex flex-col items-center px-1 py-1 text-center sm:hidden">
            <span className="pt-3 text-sm font-semibold">{companyName}</span>
            <span className="pb-2 text-xs text-muted">{unitName}</span>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
