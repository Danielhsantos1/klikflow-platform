"use client";

import { useEffect, useState } from "react";

import { createDbClient } from "@/lib/db/client";
import { Button } from "@/components/ui/button";
import type { Role } from "@/lib/permissions/types";
import type { Membership } from "@/types/tenant";

type MembershipWithRelations = Membership & {
  profiles: { full_name: string | null } | null;
  roles: { name: string } | null;
};

async function fetchMembers(tenantId: string) {
  const db = createDbClient();
  const [membershipsRes, rolesRes] = await Promise.all([
    db
      .from("memberships")
      .select("*, profiles(full_name), roles(name)")
      .eq("tenant_id", tenantId)
      .order("created_at"),
    db.from("roles").select("*").eq("tenant_id", tenantId).order("name"),
  ]);

  return { membershipsRes, rolesRes };
}

export function MembersManager({ tenantId }: { tenantId: string }) {
  const [memberships, setMemberships] = useState<MembershipWithRelations[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const { membershipsRes, rolesRes } = await fetchMembers(tenantId);

    if (membershipsRes.error) setError(membershipsRes.error.message);
    else setMemberships((membershipsRes.data as unknown as MembershipWithRelations[]) ?? []);

    if (rolesRes.error) setError(rolesRes.error.message);
    else setRoles(rolesRes.data ?? []);
  }

  useEffect(() => {
    let cancelled = false;

    fetchMembers(tenantId).then(({ membershipsRes, rolesRes }) => {
      if (cancelled) return;

      if (membershipsRes.error) setError(membershipsRes.error.message);
      else setMemberships((membershipsRes.data as unknown as MembershipWithRelations[]) ?? []);

      if (rolesRes.error) setError(rolesRes.error.message);
      else setRoles(rolesRes.data ?? []);

      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  async function handleChangeRole(membershipId: string, roleId: string) {
    setError(null);
    const db = createDbClient();
    const { error: updateError } = await db
      .from("memberships")
      .update({ role_id: roleId })
      .eq("id", membershipId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await reload();
  }

  async function handleToggleStatus(membership: MembershipWithRelations) {
    setError(null);
    const nextStatus = membership.status === "active" ? "suspended" : "active";
    const db = createDbClient();
    const { error: updateError } = await db
      .from("memberships")
      .update({ status: nextStatus })
      .eq("id", membership.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await reload();
  }

  if (loading) {
    return <p className="text-neutral-500">Carregando membros...</p>;
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-medium">Membros</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="flex flex-col gap-2">
        {memberships.map((membership) => (
          <li
            key={membership.id}
            className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-2 text-sm"
          >
            <div className="flex flex-col">
              <span>{membership.profiles?.full_name ?? "Membro sem nome"}</span>
              <span className="text-xs text-neutral-400">
                {membership.status === "active" ? "Ativo" : "Suspenso"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <select
                className="h-8 rounded-md border border-neutral-200 bg-transparent px-2 text-xs"
                value={membership.role_id}
                onChange={(event) => handleChangeRole(membership.id, event.target.value)}
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
              <Button variant="outline" size="sm" onClick={() => handleToggleStatus(membership)}>
                {membership.status === "active" ? "Suspender" : "Ativar"}
              </Button>
            </div>
          </li>
        ))}
        {memberships.length === 0 && (
          <li className="text-sm text-neutral-400">Nenhum membro.</li>
        )}
      </ul>
      <p className="text-xs text-neutral-400">
        Convidar um novo usuário por e-mail ainda não está disponível — fora do escopo desta
        tarefa.
      </p>
    </section>
  );
}
