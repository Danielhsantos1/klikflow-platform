"use client";

import { useState } from "react";

import { createDbClient } from "@/lib/db/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import type { TenantSegment } from "@/types/database";

const SEGMENTS: { value: TenantSegment; label: string }[] = [
  { value: "restaurant", label: "Restaurante" },
  { value: "cafeteria", label: "Cafeteria" },
  { value: "bar", label: "Bar" },
  { value: "hotel", label: "Hotel" },
  { value: "clinic", label: "Clínica" },
  { value: "convenience", label: "Conveniência" },
  { value: "other", label: "Outro" },
];

export function CreateTenantForm({
  onCreated,
}: {
  onCreated: (tenant: { id: string; name: string }) => void;
}) {
  const [name, setName] = useState("");
  const [segment, setSegment] = useState<TenantSegment>("restaurant");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const db = createDbClient();
    const { data, error: rpcError } = await db.rpc("create_tenant", {
      tenant_name: name,
      tenant_segment: segment,
    });

    setLoading(false);

    if (rpcError || !data) {
      setError(rpcError?.message ?? "Não foi possível criar a empresa.");
      return;
    }

    onCreated({ id: data.id, name: data.name });
  }

  return (
    <Card className="w-full max-w-sm">
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1 text-center">
            <h2 className="text-lg font-semibold">Cadastre sua empresa</h2>
            <p className="text-sm text-muted">Leva menos de um minuto.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tenant-name" className="text-sm font-medium">
              Nome da empresa
            </label>
            <Input
              id="tenant-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tenant-segment" className="text-sm font-medium">
              Segmento
            </label>
            <select
              id="tenant-segment"
              className="h-10 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              value={segment}
              onChange={(event) => setSegment(event.target.value as TenantSegment)}
            >
              {SEGMENTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {error && <Alert variant="danger">{error}</Alert>}
          <Button type="submit" disabled={loading}>
            {loading ? "Criando..." : "Criar empresa"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
