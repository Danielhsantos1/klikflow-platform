// Browser-console test for Task 04 (catálogo, estações, locais de
// consumo). Run with https://klikflow.vercel.app open, DevTools Console
// (F12) — type "allow pasting" once if Chrome blocks the paste.
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

  console.log("=== Signing up Owner (A) and an outside user (B) ===");
  const jwtA = await signUpAndGetJwt(`klikflow-cat-a-${stamp}@example.com`, "Owner A");
  const jwtB = await signUpAndGetJwt(`klikflow-cat-b-${stamp}@example.com`, "Outsider B");
  if (!jwtA || !jwtB) { console.log("%cFAIL: could not sign in both users.", "color: red"); return; }

  console.log("\n=== 1. Owner A creates Tenant A and Tenant B (B has no membership in A) ===");
  const tA = await api("/rpc/create_tenant", jwtA, {
    method: "POST",
    body: JSON.stringify({ tenant_name: "Padaria Catalogo", tenant_segment: "other" }),
  });
  const tenantAId = first(tA.body)?.id;
  const tB = await api("/rpc/create_tenant", jwtB, {
    method: "POST",
    body: JSON.stringify({ tenant_name: "Tenant B (outsider)", tenant_segment: "other" }),
  });
  const tenantBId = first(tB.body)?.id;
  (tenantAId && tenantBId) ? ok("Both tenants created") : bad(`Tenant creation failed: ${JSON.stringify({ tA, tB })}`);

  console.log("\n=== 2. Owner A creates a Unit, a Category and a Product with a price ===");
  const unitResp = await api("/units", jwtA, {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ tenant_id: tenantAId, name: "Unidade Centro" }),
  });
  const unitId = first(unitResp.body)?.id;

  const catResp = await api("/categories", jwtA, {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ tenant_id: tenantAId, name: "Doces" }),
  });
  const categoryId = first(catResp.body)?.id;

  const productResp = await api("/products", jwtA, {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ tenant_id: tenantAId, category_id: categoryId, name: "Pão de Queijo", price: 8.5 }),
  });
  const productId = first(productResp.body)?.id;
  const priceOk = Number(first(productResp.body)?.price) === 8.5;
  (unitId && categoryId && productId && priceOk)
    ? ok(`Unit, category and product created (price=${first(productResp.body)?.price})`)
    : bad(`Setup failed: ${JSON.stringify({ unitResp, catResp, productResp })}`);

  console.log("\n=== 3. Owner A creates a Production Station and links it to the Product ===");
  const stationResp = await api("/production_stations", jwtA, {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ tenant_id: tenantAId, name: "Forno" }),
  });
  const stationId = first(stationResp.body)?.id;
  const linkResp = await api("/product_stations", jwtA, {
    method: "POST",
    body: JSON.stringify({ product_id: productId, station_id: stationId, sequence: 1 }),
  });
  (stationId && linkResp.status < 300)
    ? ok("Station created and linked to product")
    : bad(`Station/link failed: ${JSON.stringify({ stationResp, linkResp })}`);

  console.log("\n=== 4. Owner A creates a Consumption Location under the Unit ===");
  const locResp = await api("/consumption_locations", jwtA, {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ unit_id: unitId, label: "Mesa 01" }),
  });
  first(locResp.body)?.id
    ? ok("Consumption location created")
    : bad(`Consumption location failed: ${JSON.stringify(locResp)}`);

  console.log("\n=== 5. Outsider B (no membership in Tenant A) cannot read the catalog ===");
  const leakProducts = await api(`/products?tenant_id=eq.${tenantAId}`, jwtB);
  Array.isArray(leakProducts.body) && leakProducts.body.length === 0
    ? ok("Outsider sees 0 products from Tenant A")
    : bad(`Outsider saw products: ${JSON.stringify(leakProducts.body)}`);

  console.log("\n=== 6. Outsider B cannot create a product in Tenant A (expect blocked) ===");
  const badProduct = await api("/products", jwtB, {
    method: "POST",
    body: JSON.stringify({ tenant_id: tenantAId, name: "Produto Invasor", price: 1 }),
  });
  badProduct.status >= 400
    ? ok(`Cross-tenant product insert blocked (HTTP ${badProduct.status})`)
    : bad(`Cross-tenant product insert succeeded! (HTTP ${badProduct.status})`);

  console.log("\n=== 7. Owner A cannot attach Tenant B's category to a Tenant A product (cross-tenant guard) ===");
  const bCatResp = await api("/categories", jwtB, {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ tenant_id: tenantBId, name: "Categoria B" }),
  });
  const bCategoryId = first(bCatResp.body)?.id;
  const crossProduct = await api("/products", jwtA, {
    method: "POST",
    body: JSON.stringify({ tenant_id: tenantAId, category_id: bCategoryId, name: "Produto Cruzado", price: 1 }),
  });
  crossProduct.status >= 400
    ? ok(`Cross-tenant category attach blocked (HTTP ${crossProduct.status})`)
    : bad(`Cross-tenant category attach succeeded! (HTTP ${crossProduct.status})`);

  console.log("\n==========================================");
  console.log(`Result: ${pass} passed, ${fail} failed`);
  console.log("==========================================");
})();
