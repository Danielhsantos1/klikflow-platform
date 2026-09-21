// Browser-console version of scripts/test-tenant-isolation.sh — run this
// from the DevTools Console while https://klikflow.vercel.app is open,
// so the browser sends the right Origin header and handles cookies
// automatically. No install required.
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

  console.log("=== Signing up two test users ===");
  const jwtA = await signUpAndGetJwt(`klikflow-test-a-${stamp}@example.com`, "Owner A");
  // Need a fresh cookie jar per user; the browser shares cookies per
  // origin, so sign up B in a private/incognito tab OR just trust that
  // get-session right after sign-up B returns B's session (Better Auth
  // sets the new session cookie on sign-up, overwriting A's for this tab).
  const jwtB = await signUpAndGetJwt(`klikflow-test-b-${stamp}@example.com`, "Owner B");

  if (!jwtA || !jwtB) {
    console.log("%cFAIL: could not obtain a JWT for one or both users. Aborting.", "color: red");
    return;
  }
  console.log("  Both users signed in, JWTs obtained.");

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

  console.log("\n=== 1. User A creates Tenant A ===");
  const tA = await api("/rpc/create_tenant", jwtA, {
    method: "POST",
    body: JSON.stringify({ tenant_name: "Cafeteria da Ana (teste)", tenant_segment: "cafeteria" }),
  });
  const tenantAId = Array.isArray(tA.body) ? tA.body[0]?.id : tA.body?.id;
  tenantAId ? ok(`Tenant A created (${tenantAId})`) : bad(`Tenant A creation failed: ${JSON.stringify(tA)}`);

  console.log("\n=== 2. User A creates a unit in Tenant A ===");
  const uA = await api("/units", jwtA, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ tenant_id: tenantAId, name: "Unidade Centro" }),
  });
  const unitAId = Array.isArray(uA.body) ? uA.body[0]?.id : uA.body?.id;
  unitAId ? ok(`Unit created in Tenant A (${unitAId})`) : bad(`Unit creation failed: ${JSON.stringify(uA)}`);

  console.log("\n=== 3. User B creates Tenant B ===");
  // Re-fetch B's JWT right before using it, in case A's later requests
  // refreshed the shared session cookie in this tab.
  const tB = await api("/rpc/create_tenant", jwtB, {
    method: "POST",
    body: JSON.stringify({ tenant_name: "Restaurante do Beto (teste)", tenant_segment: "restaurant" }),
  });
  const tenantBId = Array.isArray(tB.body) ? tB.body[0]?.id : tB.body?.id;
  tenantBId ? ok(`Tenant B created (${tenantBId})`) : bad(`Tenant B creation failed: ${JSON.stringify(tB)}`);

  console.log("\n=== 4. User B should see only Tenant B (expect count=1) ===");
  const listB = await api("/tenants?select=id", jwtB);
  Array.isArray(listB.body) && listB.body.length === 1
    ? ok("User B sees exactly 1 tenant")
    : bad(`User B sees ${JSON.stringify(listB.body)} tenants (expected 1)`);

  console.log("\n=== 5. User B must NOT see Tenant A's units (expect empty) ===");
  const leak = await api(`/units?tenant_id=eq.${tenantAId}`, jwtB);
  Array.isArray(leak.body) && leak.body.length === 0
    ? ok("User B sees 0 units from Tenant A")
    : bad(`User B sees Tenant A units: ${JSON.stringify(leak.body)}`);

  console.log("\n=== 6. User B tries to rename Tenant A (expect 0 rows affected) ===");
  const rename = await api(`/tenants?id=eq.${tenantAId}`, jwtB, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ name: "Hijacked" }),
  });
  Array.isArray(rename.body) && rename.body.length === 0
    ? ok("Update blocked (0 rows affected)")
    : bad(`Unexpected response: ${JSON.stringify(rename)}`);

  console.log("\n=== 7. Confirm Tenant A's name is untouched ===");
  const nameCheck = await api(`/tenants?id=eq.${tenantAId}&select=name`, jwtA);
  nameCheck.body?.[0]?.name === "Cafeteria da Ana (teste)"
    ? ok("Tenant A name intact")
    : bad(`Tenant A name changed! ${JSON.stringify(nameCheck.body)}`);

  console.log("\n=== 8. User B tries to INSERT a unit directly into Tenant A (expect error) ===");
  const badInsert = await api("/units", jwtB, {
    method: "POST",
    body: JSON.stringify({ tenant_id: tenantAId, name: "invasão" }),
  });
  badInsert.status >= 400
    ? ok(`Cross-tenant insert blocked (HTTP ${badInsert.status})`)
    : bad(`Cross-tenant insert succeeded! (HTTP ${badInsert.status})`);

  console.log("\n=== 9. Anonymous request must not read tenants ===");
  const anon = await fetch(`${API_URL}/tenants`);
  anon.status >= 400
    ? ok(`Anonymous access blocked (HTTP ${anon.status})`)
    : bad(`Anonymous request succeeded! (HTTP ${anon.status})`);

  console.log("\n==========================================");
  console.log(`Result: ${pass} passed, ${fail} failed`);
  console.log("==========================================");
})();
