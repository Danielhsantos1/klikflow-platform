// Browser-console test for Task 03 (configurable roles/permissions).
// Run with https://klikflow.vercel.app open, DevTools Console (F12),
// after typing "allow pasting" once if Chrome blocks the paste.
(async () => {
  const AUTH_URL = "https://ep-winter-shadow-act1di87.neonauth.sa-east-1.aws.neon.tech/klikflow/auth";
  const API_URL = "https://ep-winter-shadow-act1di87.apirest.sa-east-1.aws.neon.tech/klikflow/rest/v1";
  const PASSWORD = "TestPassword123!";
  const stamp = Date.now();

  let pass = 0, fail = 0;
  const ok = (msg) => { console.log("%cOK: " + msg, "color: green"); pass++; };
  const bad = (msg) => { console.log("%cFAIL: " + msg, "color: red"); fail++; };

  async function signUpAndGetJwt(email, name) {
    await fetch(`${AUTH_URL}/sign-up/email`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD, name, callbackURL: location.origin }),
    });
    const res = await fetch(`${AUTH_URL}/get-session`, { credentials: "include" });
    return res.headers.get("set-auth-jwt");
  }

  async function api(path, jwt, opts = {}) {
    const res = await fetch(`${API_URL}${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
        ...(opts.headers || {}),
      },
    });
    let body = null;
    try { body = await res.json(); } catch { /* empty body */ }
    return { status: res.status, body };
  }
  const first = (b) => (Array.isArray(b) ? b[0] : b);

  console.log("=== Signing up Owner (A) and Staff (B) ===");
  const jwtA = await signUpAndGetJwt(`klikflow-perm-a-${stamp}@example.com`, "Owner A");
  const jwtB = await signUpAndGetJwt(`klikflow-perm-b-${stamp}@example.com`, "Staff B");
  if (!jwtA || !jwtB) { console.log("%cFAIL: could not sign in both users.", "color: red"); return; }
  console.log("  Both signed in.");

  console.log("\n=== 1. Owner A creates a tenant ===");
  const t = await api("/rpc/create_tenant", jwtA, {
    method: "POST",
    body: JSON.stringify({ tenant_name: "Padaria Teste Perm", tenant_segment: "other" }),
  });
  const tenantId = first(t.body)?.id;
  tenantId ? ok(`Tenant created (${tenantId})`) : bad(`Tenant creation failed: ${JSON.stringify(t)}`);

  console.log("\n=== 2. Owner role has all 5 permissions ===");
  const ownerRole = await api(`/roles?tenant_id=eq.${tenantId}&is_system=eq.true&select=id,name`, jwtA);
  const ownerRoleId = first(ownerRole.body)?.id;
  const ownerPerms = await api(`/role_permissions?role_id=eq.${ownerRoleId}&select=permission_key`, jwtA);
  Array.isArray(ownerPerms.body) && ownerPerms.body.length === 5
    ? ok("Owner role has all 5 permissions")
    : bad(`Owner role has ${JSON.stringify(ownerPerms.body)}`);

  console.log("\n=== 3. Owner creates a custom role \"Caixa\" with only audit_log.read ===");
  const roleResp = await api("/roles", jwtA, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ tenant_id: tenantId, name: "Caixa" }),
  });
  const caixaRoleId = first(roleResp.body)?.id;
  caixaRoleId ? ok(`Role "Caixa" created (${caixaRoleId})`) : bad(`Role creation failed: ${JSON.stringify(roleResp)}`);

  const grantResp = await api("/role_permissions", jwtA, {
    method: "POST",
    body: JSON.stringify({ role_id: caixaRoleId, permission_key: "audit_log.read" }),
  });
  grantResp.status < 300
    ? ok("Granted audit_log.read to Caixa")
    : bad(`Grant failed: ${JSON.stringify(grantResp)}`);

  console.log("\n=== 4. Owner invites Staff B into the tenant with the Caixa role ===");
  // user_id must be Staff B's real id — fetch it from B's own profile.
  const bProfile = await api("/profiles?select=id", jwtB);
  const bUserId = first(bProfile.body)?.id;
  const memberResp2 = await api("/memberships", jwtA, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ tenant_id: tenantId, user_id: bUserId, role_id: caixaRoleId }),
  });
  first(memberResp2.body)?.id
    ? ok("Staff B added with Caixa role")
    : bad(`Adding Staff B failed: ${JSON.stringify(memberResp2)}`);

  console.log("\n=== 5. Staff B (Caixa) tries to rename the tenant (expect blocked) ===");
  const rename = await api(`/tenants?id=eq.${tenantId}`, jwtB, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ name: "Hijacked" }),
  });
  Array.isArray(rename.body) && rename.body.length === 0
    ? ok("Rename blocked (Caixa lacks tenant.manage)")
    : bad(`Unexpected: ${JSON.stringify(rename)}`);

  console.log("\n=== 6. Staff B (Caixa) tries to create a unit (expect blocked) ===");
  const unitResp = await api("/units", jwtB, {
    method: "POST",
    body: JSON.stringify({ tenant_id: tenantId, name: "Unidade Indevida" }),
  });
  unitResp.status >= 400
    ? ok(`Unit creation blocked (HTTP ${unitResp.status}, Caixa lacks units.manage)`)
    : bad(`Unit creation succeeded! (HTTP ${unitResp.status})`);

  console.log("\n=== 7. Staff B (Caixa) reads audit_log (expect allowed, even if empty) ===");
  const auditResp = await api(`/audit_log?tenant_id=eq.${tenantId}`, jwtB);
  auditResp.status < 300
    ? ok(`audit_log read allowed (HTTP ${auditResp.status}, Caixa has audit_log.read)`)
    : bad(`audit_log read blocked! (HTTP ${auditResp.status})`);

  console.log("\n=== 8. Owner A tries to demote themself (last owner, expect blocked) ===");
  const aMembership = await api(`/memberships?tenant_id=eq.${tenantId}&role_id=eq.${ownerRoleId}&select=id`, jwtA);
  const aMembershipId = first(aMembership.body)?.id;
  const demote = await api(`/memberships?id=eq.${aMembershipId}`, jwtA, {
    method: "PATCH",
    body: JSON.stringify({ role_id: caixaRoleId }),
  });
  demote.status >= 400
    ? ok(`Self-demotion blocked (HTTP ${demote.status}, last owner protection)`)
    : bad(`Self-demotion succeeded! Tenant would have no owner. (HTTP ${demote.status})`);

  console.log("\n=== 9. Owner A tries to remove themself (last owner, expect blocked) ===");
  const leave = await api(`/memberships?id=eq.${aMembershipId}`, jwtA, { method: "DELETE" });
  leave.status >= 400
    ? ok(`Self-removal blocked (HTTP ${leave.status}, last owner protection)`)
    : bad(`Self-removal succeeded! Tenant would have no owner. (HTTP ${leave.status})`);

  console.log("\n==========================================");
  console.log(`Result: ${pass} passed, ${fail} failed`);
  console.log("==========================================");
})();
