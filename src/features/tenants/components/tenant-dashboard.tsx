"use client";

import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth/client";
import { createDbClient } from "@/lib/db/client";
import { CreateTenantForm } from "@/features/tenants/components/create-tenant-form";
import { CatalogManager } from "@/features/catalog/components/catalog-manager";
import { OperationsBoard } from "@/features/tabs/components/operations-board";
import { ProductionBoard } from "@/features/production/components/production-board";
import { RolesManager } from "@/features/roles/components/roles-manager";
import { MembersManager } from "@/features/members/components/members-manager";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { AppShell, type NavSection } from "@/components/layout/app-shell";

type ActiveTenant = { id: string; name: string };
type View = "operations" | "production" | "catalog" | "team";

const STUCK_TIMEOUT_MS = 8000;

export function TenantDashboard() {
  const session = authClient.useSession();
  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState<ActiveTenant | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stuck, setStuck] = useState(false);
  const [view, setView] = useState<View>("operations");

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
          <p className="text-muted">Isso está demorando mais do que devia.</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Tentar de novo
          </Button>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-3 px-6 py-16">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full max-w-2xl" />
        <Skeleton className="h-32 w-full max-w-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-6 py-16">
        <Alert variant="danger">Algo não saiu como esperado. {error}</Alert>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="flex flex-col items-center gap-6 px-6 py-16">
        <CreateTenantForm onCreated={setTenant} />
      </div>
    );
  }

  const navSections: NavSection[] = [
    {
      items: [
        { key: "operations", label: "Comandas", available: true },
        { key: "production", label: "Produção", available: true },
      ],
    },
    {
      label: "Catálogo",
      items: [{ key: "catalog", label: "Produtos e categorias", available: true }],
    },
    {
      label: "Configurações",
      items: [{ key: "team", label: "Equipe", available: true }],
    },
    {
      label: "Em breve",
      items: [
        { key: "clients", label: "Clientes", available: false },
        { key: "financial", label: "Financeiro", available: false },
        { key: "reports", label: "Relatórios", available: false },
      ],
    },
  ];

  return (
    <AppShell
      companyName={tenant.name}
      unitName="Unidade Principal"
      userName={session.data?.user?.name ?? session.data?.user?.email ?? "Usuário"}
      sections={navSections}
      activeKey={view}
      onSelect={(key) => setView(key as View)}
      userMenu={<SignOutButton />}
    >
      <div className="flex flex-1 flex-col items-center">
        {view === "operations" && <OperationsBoard tenantId={tenant.id} />}
        {view === "production" && <ProductionBoard />}
        {view === "catalog" && (
          <CatalogManager tenantId={tenant.id} tenantName={tenant.name} />
        )}
        {view === "team" && (
          <div className="flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
            <RolesManager tenantId={tenant.id} />
            <MembersManager tenantId={tenant.id} />
          </div>
        )}
      </div>
    </AppShell>
  );
}
