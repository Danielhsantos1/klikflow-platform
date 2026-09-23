"use client";

import { useEffect, useState } from "react";

import { createDbClient } from "@/lib/db/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Permission, Role } from "@/lib/permissions/types";

type RoleWithPermissions = Role & { role_permissions: { permission_key: string }[] };

async function fetchRolesData(tenantId: string) {
  const db = createDbClient();
  const [rolesRes, permissionsRes] = await Promise.all([
    db
      .from("roles")
      .select("*, role_permissions(permission_key)")
      .eq("tenant_id", tenantId)
      .order("name"),
    db.from("permissions").select("*").order("key"),
  ]);

  return { rolesRes, permissionsRes };
}

export function RolesManager({ tenantId }: { tenantId: string }) {
  const [roles, setRoles] = useState<RoleWithPermissions[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newRoleName, setNewRoleName] = useState("");
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);

  async function reload() {
    const { rolesRes, permissionsRes } = await fetchRolesData(tenantId);

    if (rolesRes.error) setError(rolesRes.error.message);
    else setRoles((rolesRes.data as unknown as RoleWithPermissions[]) ?? []);

    if (permissionsRes.error) setError(permissionsRes.error.message);
    else setPermissions(permissionsRes.data ?? []);
  }

  useEffect(() => {
    let cancelled = false;

    fetchRolesData(tenantId).then(({ rolesRes, permissionsRes }) => {
      if (cancelled) return;

      if (rolesRes.error) setError(rolesRes.error.message);
      else setRoles((rolesRes.data as unknown as RoleWithPermissions[]) ?? []);

      if (permissionsRes.error) setError(permissionsRes.error.message);
      else setPermissions(permissionsRes.data ?? []);

      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  async function handleCreateRole(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const db = createDbClient();
    const { error: insertError } = await db
      .from("roles")
      .insert({ tenant_id: tenantId, name: newRoleName });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setNewRoleName("");
    await reload();
  }

  async function handleTogglePermission(
    role: RoleWithPermissions,
    permissionKey: Permission["key"],
    enabled: boolean,
  ) {
    setError(null);
    const db = createDbClient();

    if (enabled) {
      const { error: insertError } = await db
        .from("role_permissions")
        .insert({ role_id: role.id, permission_key: permissionKey });

      if (insertError) {
        setError(insertError.message);
        return;
      }
    } else {
      const { error: deleteError } = await db
        .from("role_permissions")
        .delete()
        .eq("role_id", role.id)
        .eq("permission_key", permissionKey);

      if (deleteError) {
        setError(deleteError.message);
        return;
      }
    }

    await reload();
  }

  if (loading) {
    return <p className="text-neutral-500">Carregando perfis...</p>;
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-medium">Perfis</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="flex flex-col gap-2">
        {roles.map((role) => {
          const grantedKeys = new Set(role.role_permissions.map((rp) => rp.permission_key));
          const expanded = expandedRoleId === role.id;
          return (
            <li key={role.id} className="rounded-md border border-neutral-200">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-sm font-medium">
                  {role.name}
                  {role.is_system && (
                    <span className="ml-2 text-xs text-neutral-400">(padrão)</span>
                  )}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExpandedRoleId(expanded ? null : role.id)}
                >
                  {expanded ? "Fechar" : "Permissões"}
                </Button>
              </div>
              {expanded && (
                <div className="flex flex-col gap-1 border-t border-neutral-200 px-3 py-3">
                  {permissions.map((permission) => (
                    <label key={permission.key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={grantedKeys.has(permission.key)}
                        onChange={(event) =>
                          handleTogglePermission(role, permission.key, event.target.checked)
                        }
                      />
                      <span>{permission.description}</span>
                    </label>
                  ))}
                </div>
              )}
            </li>
          );
        })}
        {roles.length === 0 && (
          <li className="text-sm text-neutral-400">Nenhum perfil ainda.</li>
        )}
      </ul>
      <form onSubmit={handleCreateRole} className="flex gap-2">
        <Input
          placeholder="Novo perfil (ex: Caixa)"
          value={newRoleName}
          onChange={(event) => setNewRoleName(event.target.value)}
          required
        />
        <Button type="submit">Adicionar</Button>
      </form>
    </section>
  );
}
