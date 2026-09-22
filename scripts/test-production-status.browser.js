// Browser-console test for Task 06 (configurable order status +
// production tracking). Run with https://klikflow.vercel.app open,
// DevTools Console (F12) — type "allow pasting" once if Chrome blocks
// the paste. Remember to refresh the Neon Data API's schema cache after
// applying db/migrations/0009_production_status.sql.
(async () => {
  const AUTH_URL = "https://ep-winter-shadow-act1di87.neonauth.sa-east-1.aws.neon.tech/klikflow/auth";
  const API_URL = "https://ep-winter-shadow-act1di87.apirest.sa-east-1.aws.neon.tech/klikflow/rest/v1";
  const PASSWORD = "TestPassword123!";
  const stamp = Date.now();

  let pass = 0, fail = 0;
  const ok = (msg) => { console.log("%cOK: " + msg, "color: green"); pass++; };
  const bad = (msg) => { console.log("%cFAIL: " + msg, "color: red"); fail++; };
  const first = (b) => (Array.isArray(b) ? b[0] : b);

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

  console.log("=== Signing up Owner (A) ===");
  const jwtA = await signUpAndGetJwt(`klikflow-prod-a-${stamp}@example.com`, "Owner A");
  if (!jwtA) { console.log("%cFAIL: could not sign in.", "color: red"); return; }

  console.log("\n=== 1. Setup: tenant (seeds default status flow), unit, location, category, product, station ===");
  const t = await api("/rpc/create_tenant", jwtA, {
    method: "POST", body: JSON.stringify({ tenant_name: "Restaurante Producao Teste", tenant_segment: "restaurant" }),
  });
  const tenantId = first(t.body)?.id;

  const statusesResp = await api(`/order_statuses?tenant_id=eq.${tenantId}&select=id,key,sequence&order=sequence.asc`, jwtA);
  const statuses = statusesResp.body || [];
  const byKey = Object.fromEntries(statuses.map((s) => [s.key, s.id]));
  (statuses.length === 7 && byKey.new && byKey.completed && byKey.cancelled)
    ? ok(`Default status flow seeded (${statuses.length} statuses)`)
    : bad(`Unexpected statuses: ${JSON.stringify(statusesResp.body)}`);

  const unitResp = await api("/units", jwtA, {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ tenant_id: tenantId, name: "Unidade Centro" }),
  });
  const unitId = first(unitResp.body)?.id;
  const locResp = await api("/consumption_locations", jwtA, {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ unit_id: unitId, label: "Mesa 03" }),
  });
  const locationId = first(locResp.body)?.id;
  const catResp = await api("/categories", jwtA, {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ tenant_id: tenantId, name: "Pratos" }),
  });
  const categoryId = first(catResp.body)?.id;
  const productResp = await api("/products", jwtA, {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ tenant_id: tenantId, category_id: categoryId, name: "Feijoada", price: 35.0 }),
  });
  const productId = first(productResp.body)?.id;
  const stationResp = await api("/production_stations", jwtA, {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ tenant_id: tenantId, name: "Cozinha" }),
  });
  const stationId = first(stationResp.body)?.id;
  await api("/product_stations", jwtA, {
    method: "POST", body: JSON.stringify({ product_id: productId, station_id: stationId, sequence: 1 }),
  });

  const profResp = await api("/profiles?select=id", jwtA);
  const myUserId = first(profResp.body)?.id;
  const tabResp = await api("/tabs", jwtA, {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ tenant_id: tenantId, consumption_location_id: locationId, opened_by: myUserId }),
  });
  const tabId = first(tabResp.body)?.id;

  console.log("\n=== 2. Create an Order WITHOUT specifying a status (expect default 'new') ===");
  const orderResp = await api("/orders", jwtA, {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ tenant_id: tenantId, tab_id: tabId, created_by: myUserId }),
  });
  const order = first(orderResp.body);
  order?.status_id === byKey.new
    ? ok("Order defaulted to the 'new' status")
    : bad(`Order status wrong: ${JSON.stringify(orderResp)}`);

  console.log("\n=== 3. Adding an item seeds order_item_stations at 'Cozinha' with status pending ===");
  const itemResp = await api("/order_items", jwtA, {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ order_id: order?.id, product_id: productId, quantity: 1 }),
  });
  const itemId = first(itemResp.body)?.id;
  const stationsResp = await api(`/order_item_stations?order_item_id=eq.${itemId}`, jwtA);
  const seeded = first(stationsResp.body);
  seeded?.status === "pending"
    ? ok("order_item_stations seeded automatically (pending)")
    : bad(`Seeding failed: ${JSON.stringify(stationsResp)}`);

  console.log("\n=== 4. Valid transition: new -> accepted ===");
  const validTransition = await api(`/orders?id=eq.${order?.id}`, jwtA, {
    method: "PATCH", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status_id: byKey.accepted }),
  });
  first(validTransition.body)?.status_id === byKey.accepted
    ? ok("Valid transition (new -> accepted) succeeded")
    : bad(`Valid transition failed: ${JSON.stringify(validTransition)}`);

  console.log("\n=== 5. Invalid transition: accepted -> completed, skipping steps (expect blocked) ===");
  const invalidTransition = await api(`/orders?id=eq.${order?.id}`, jwtA, {
    method: "PATCH",
    body: JSON.stringify({ status_id: byKey.completed }),
  });
  invalidTransition.status >= 400
    ? ok(`Skipping steps blocked (HTTP ${invalidTransition.status})`)
    : bad(`Skipping steps succeeded! (HTTP ${invalidTransition.status})`);

  console.log("\n=== 6. Mark the item's station as done ===");
  const markDone = await api(`/order_item_stations?id=eq.${seeded?.id}`, jwtA, {
    method: "PATCH", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "done", completed_at: new Date().toISOString() }),
  });
  first(markDone.body)?.status === "done"
    ? ok("Production station marked done")
    : bad(`Marking done failed: ${JSON.stringify(markDone)}`);

  console.log("\n==========================================");
  console.log(`Result: ${pass} passed, ${fail} failed`);
  console.log("==========================================");
})();
