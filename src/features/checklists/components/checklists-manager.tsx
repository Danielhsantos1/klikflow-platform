"use client";

import { useEffect, useState } from "react";

import { createDbClient } from "@/lib/db/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Checklist, ChecklistItem } from "@/types/catalog";

type ItemWithStatus = ChecklistItem & { done: boolean };
type ChecklistWithItems = Checklist & { items: ItemWithStatus[] };

type RawChecklist = Checklist & {
  checklist_items: (ChecklistItem & {
    checklist_item_completions: { completed_on: string }[];
  })[];
};

async function fetchChecklists(tenantId: string) {
  const db = createDbClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await db
    .from("checklists")
    .select("*, checklist_items(*, checklist_item_completions(completed_on))")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .order("name");

  if (error) return { error: error.message };

  const checklists: ChecklistWithItems[] = ((data as unknown as RawChecklist[]) ?? []).map(
    (checklist) => ({
      ...checklist,
      items: checklist.checklist_items
        .map((item) => ({
          ...item,
          done: item.checklist_item_completions.some((c) => c.completed_on === today),
        }))
        .sort((a, b) => a.sequence - b.sequence),
    }),
  );

  return { checklists };
}

/**
 * Checklists de abertura/fechamento - lacuna identificada comparando
 * com concorrentes (Tairo: "rotinas para padronizar"). Cada item fica
 * "concluído" por marcar uma linha em `checklist_item_completions`
 * pra HOJE (0039) - não existe job de reset: amanhã a mesma consulta
 * filtrando por `completed_on = hoje` não acha nada, e o item some
 * desmarcado sozinho.
 */
export function ChecklistsManager({ tenantId, userId }: { tenantId: string; userId: string }) {
  const [checklists, setChecklists] = useState<ChecklistWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newChecklistName, setNewChecklistName] = useState("");
  const [newItemLabel, setNewItemLabel] = useState<Record<string, string>>({});

  async function reload() {
    const result = await fetchChecklists(tenantId);
    if (result.error) setError(result.error);
    else setChecklists(result.checklists ?? []);
  }

  useEffect(() => {
    let cancelled = false;

    fetchChecklists(tenantId).then((result) => {
      if (cancelled) return;
      if (result.error) setError(result.error);
      else setChecklists(result.checklists ?? []);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  async function handleCreateChecklist(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const db = createDbClient();
    const { error: insertError } = await db
      .from("checklists")
      .insert({ tenant_id: tenantId, name: newChecklistName });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setNewChecklistName("");
    await reload();
  }

  async function handleAddItem(checklistId: string) {
    setError(null);
    const label = (newItemLabel[checklistId] ?? "").trim();
    if (!label) return;

    const checklist = checklists.find((c) => c.id === checklistId);
    const nextSequence = (checklist?.items.length ?? 0) + 1;

    const db = createDbClient();
    const { error: insertError } = await db
      .from("checklist_items")
      .insert({ checklist_id: checklistId, label, sequence: nextSequence });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setNewItemLabel((current) => ({ ...current, [checklistId]: "" }));
    await reload();
  }

  async function handleToggleItem(item: ItemWithStatus) {
    setError(null);
    const db = createDbClient();

    if (item.done) {
      const today = new Date().toISOString().slice(0, 10);
      const { error: deleteError } = await db
        .from("checklist_item_completions")
        .delete()
        .eq("checklist_item_id", item.id)
        .eq("completed_on", today);

      if (deleteError) {
        setError(deleteError.message);
        return;
      }
    } else {
      const { error: insertError } = await db
        .from("checklist_item_completions")
        .insert({ checklist_item_id: item.id, completed_by: userId });

      if (insertError) {
        setError(insertError.message);
        return;
      }
    }

    await reload();
  }

  async function handleDeleteItem(itemId: string) {
    setError(null);
    const db = createDbClient();
    const { error: deleteError } = await db.from("checklist_items").delete().eq("id", itemId);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    await reload();
  }

  if (loading) {
    return <p className="text-muted">Carregando checklists...</p>;
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Checklists</h1>
        <p className="text-sm text-muted">
          Rotinas de abertura, fechamento e padrão da operação — marque os itens ao longo do dia;
          amanhã todos voltam desmarcados sozinhos.
        </p>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}

      {checklists.map((checklist) => {
        const doneCount = checklist.items.filter((item) => item.done).length;

        return (
          <section key={checklist.id} className="flex flex-col gap-3 rounded-xl border border-border p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-medium">{checklist.name}</h2>
              <span className="text-sm text-muted">
                {doneCount}/{checklist.items.length}
              </span>
            </div>

            <ul className="flex flex-col gap-1.5">
              {checklist.items.map((item) => (
                <li key={item.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleItem(item)}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                      item.done ? "border-brand bg-brand text-white" : "border-border"
                    }`}
                    aria-label={item.done ? "Desmarcar" : "Marcar como feito"}
                  >
                    {item.done && "✓"}
                  </button>
                  <span className={`flex-1 text-sm ${item.done ? "text-muted line-through" : ""}`}>
                    {item.label}
                  </span>
                  <button
                    type="button"
                    className="text-xs text-danger underline underline-offset-2"
                    onClick={() => handleDeleteItem(item.id)}
                  >
                    Remover
                  </button>
                </li>
              ))}
              {checklist.items.length === 0 && (
                <li className="text-sm text-muted">Nenhum item ainda.</li>
              )}
            </ul>

            <div className="flex gap-2">
              <Input
                placeholder="Novo item (ex: Ligar máquina de café)"
                value={newItemLabel[checklist.id] ?? ""}
                onChange={(event) =>
                  setNewItemLabel((current) => ({ ...current, [checklist.id]: event.target.value }))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleAddItem(checklist.id);
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={() => handleAddItem(checklist.id)}>
                Adicionar
              </Button>
            </div>
          </section>
        );
      })}
      {checklists.length === 0 && (
        <p className="text-sm text-muted">Nenhum checklist ainda — crie o primeiro abaixo.</p>
      )}

      <form onSubmit={handleCreateChecklist} className="flex gap-2">
        <Input
          placeholder="Novo checklist (ex: Abertura, Fechamento)"
          value={newChecklistName}
          onChange={(event) => setNewChecklistName(event.target.value)}
          required
        />
        <Button type="submit">Criar</Button>
      </form>
    </div>
  );
}
