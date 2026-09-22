// Browser-console test for Task 05 (Comanda + Pedidos, price/name
// snapshot). Run with https://klikflow.vercel.app open, DevTools
// Console (F12) — type "allow pasting" once if Chrome blocks the paste.
// Remember to refresh the Neon Data API's schema cache after applying
// db/migrations/0008_tabs_orders.sql (see docs/development.md) before
// running this.
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
  const jwtA = await signUpAndGetJwt(`klikflow-order-a-${stamp}@example.com`, "Owner A");
  if (!jwtA) { console.log("%cFAIL: could not sign in.", "color: red"); return; }

  console.log("\n=== 1. Setup: tenant, unit, consumption location, category, product ===");
  const t = await api("/rpc/create_tenant", jwtA, {
    method: "POST", body: JSON.stringify({ tenant_name: "Bar Pedidos Teste", tenant_segment: "bar" }),
  });
  const tenantId = first(t.body)?.id;
  const unitResp = await api("/units", jwtA, {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ tenant_id: tenantId, name: "Unidade Centro" }),
  });
  const unitId = first(unitResp.body)?.id;
  const locResp = await api("/consumption_locations", jwtA, {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ unit_id: unitId, label: "Mesa 07" }),
  });
  const locationId = first(locResp.body)?.id;
  const catResp = await api("/categories", jwtA, {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ tenant_id: tenantId, name: "Bebidas" }),
  });
  const categoryId = first(catResp.body)?.id;
  const productResp = await api("/products", jwtA, {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ tenant_id: tenantId, category_id: categoryId, name: "Chopp", price: 12.0 }),
  });
  const productId = first(productResp.body)?.id;
  (tenantId && unitId && locationId && categoryId && productId)
    ? ok("Setup complete")
    : bad(`Setup failed: ${JSON.stringify({ t, unitResp, locResp, catResp, productResp })}`);

  console.log("\n=== 2. Open a Tab at the Consumption Location ===");
  const profResp = await api("/profiles?select=id", jwtA);
  const myUserId = first(profResp.body)?.id;
  const tabResp = await api("/tabs", jwtA, {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ tenant_id: tenantId, consumption_location_id: locationId, opened_by: myUserId }),
  });
  const tabId = first(tabResp.body)?.id;
  tabId ? ok(`Tab opened (${tabId})`) : bad(`Tab open failed: ${JSON.stringify(tabResp)}`);

  console.log("\n=== 3. Cannot open a second Tab at the same location (expect blocked) ===");
  const tabDup = await api("/tabs", jwtA, {
    method: "POST",
    body: JSON.stringify({ tenant_id: tenantId, consumption_location_id: locationId, opened_by: myUserId }),
  });
  tabDup.status >= 400
    ? ok(`Duplicate open tab blocked (HTTP ${tabDup.status})`)
    : bad(`Duplicate open tab succeeded! (HTTP ${tabDup.status})`);

  console.log("\n=== 4. Create an Order on the Tab, add an Item (price snapshot) ===");
  const orderResp = await api("/orders", jwtA, {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ tenant_id: tenantId, tab_id: tabId, created_by: myUserId }),
  });
  const orderId = first(orderResp.body)?.id;
  const itemResp = await api("/order_items", jwtA, {
    method: "POST", headers: { Prefer: "return=representation" },
    // Client tries to lie about the price — must be ignored.
    body: JSON.stringify({ order_id: orderId, product_id: productId, quantity: 2, unit_price: 0.01, product_name: "Free beer" }),
  });
  const item = first(itemResp.body);
  (orderId && item?.product_name === "Chopp" && Number(item?.unit_price) === 12)
    ? ok(`Order item created with real snapshot (name=${item?.product_name}, price=${item?.unit_price}, client-supplied values ignored)`)
    : bad(`Order/item creation failed or snapshot wrong: ${JSON.stringify({ orderResp, itemResp })}`);

  console.log("\n=== 5. Product price changes afterward; existing item keeps the old price ===");
  await api(`/products?id=eq.${productId}`, jwtA, {
    method: "PATCH", body: JSON.stringify({ price: 25.0 }),
  });
  const itemCheck = await api(`/order_items?order_id=eq.${orderId}&select=unit_price,product_name`, jwtA);
  Number(first(itemCheck.body)?.unit_price) === 12
    ? ok("Historical item price unaffected by later price change")
    : bad(`Item price changed! ${JSON.stringify(itemCheck.body)}`);

  console.log("\n=== 6. Close the Tab, then cannot add a new Order to it (expect blocked) ===");
  await api(`/tabs?id=eq.${tabId}`, jwtA, {
    method: "PATCH", body: JSON.stringify({ status: "closed", closed_by: myUserId, closed_at: new Date().toISOString() }),
  });
  const orderAfterClose = await api("/orders", jwtA, {
    method: "POST",
    body: JSON.stringify({ tenant_id: tenantId, tab_id: tabId, created_by: myUserId }),
  });
  orderAfterClose.status >= 400
    ? ok(`Order on closed tab blocked (HTTP ${orderAfterClose.status})`)
    : bad(`Order on closed tab succeeded! (HTTP ${orderAfterClose.status})`);

  console.log("\n==========================================");
  console.log(`Result: ${pass} passed, ${fail} failed`);
  console.log("==========================================");
})();
