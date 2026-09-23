"use client";

import { Button } from "@/components/ui/button";

/**
 * Next.js error boundary for `/app` and everything under it. Without
 * this, an unhandled exception in a Client Component (like the incident
 * where a malformed session token crashed the whole page with raw error
 * text) has no graceful fallback — this is the last line of defense, not
 * a substitute for handling expected errors where they happen.
 */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-neutral-500">Algo deu errado ao carregar a página.</p>
      <Button variant="outline" onClick={reset}>
        Tentar de novo
      </Button>
    </main>
  );
}
