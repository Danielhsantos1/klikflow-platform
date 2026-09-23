"use client";

import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth/client";
import { createDbClient } from "@/lib/db/client";
import { CreateTenantForm } from "@/features/tenants/components/create-tenant-form";
import { CatalogManager } from "@/features/catalog/components/catalog-manager";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { Button } from "@/components/ui/button";

type ActiveTenant = { id: string; name: string };

const STUCK_TIMEOUT_MS = 8000;

export function TenantDashboard() {
  const session = authClient.useSession();
  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState<ActiveTenant | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stuck, setStuck] = useState(false);

  const userId = session.data?.user?.id;
  const isWaiting = session.isPending || (Boolean(userId) && loading);

  useEffect(() => {
    if (!isWaiting) return;

    const timer = setTimeout(() => setStuck(true), STUCK_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isWaiting]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    async function loadTenant() {
      try {
        const db = createDbClient();
        const { data, error: fetchError } = await db
          .from("memberships")
          .select("tenant_id, tenants(name)")
          .eq("user_id", userId!)
          .eq("status", "active")
          .limit(1)
          .maybeSingle();

        if (cancelled) return;

        if (fetchError) {
          setError(fetchError.message);
        } else if (data) {
          const tenantRow = data.tenants as unknown as { name: string } | null;
          setTenant({ id: data.tenant_id, name: tenantRow?.name ?? "" });
        }
      } catch (thrown) {
        if (!cancelled) {
          setError(thrown instanceof Error ? thrown.message : "Erro ao carregar a empresa.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadTenant();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (isWaiting) {
    if (stuck) {
      return (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <p className="text-neutral-500">
            Isso está demorando mais do que devia.
          </p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Tentar de novo
          </Button>
        </div>
      );
    }
    return <p className="text-neutral-500">Carregando...</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (!tenant) {
    return (
      <div className="flex flex-col items-center gap-6 px-6 py-16">
        <CreateTenantForm onCreated={setTenant} />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center">
      <div className="flex w-full max-w-2xl justify-end px-6 pt-6">
        <SignOutButton />
      </div>
      <CatalogManager tenantId={tenant.id} tenantName={tenant.name} />
    </div>
  );
}
