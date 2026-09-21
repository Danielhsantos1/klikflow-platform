#!/usr/bin/env bash
# Repeats, over real HTTP against the live Neon Auth + Data API, the same
# 9 isolation/security scenarios that were validated locally (with a
# stubbed auth.uid()) during Task 02 — see docs/database.md. Run this
# from a machine with normal internet access (this sandbox's outbound
# network policy blocks the Neon Auth/Data API host, which is exactly
# why this script exists instead of Claude running it directly).
#
# Usage:
#   chmod +x scripts/test-tenant-isolation.sh
#   ./scripts/test-tenant-isolation.sh
#
# Requires: curl, jq (for pretty JSON; falls back to raw output if
# missing is not handled — install jq if you don't have it).
#
# Safe to re-run: uses randomized emails each run, so it never collides
# with a previous run's test users. Nothing here touches real tenants.

set -euo pipefail

AUTH_URL="https://ep-winter-shadow-act1di87.neonauth.sa-east-1.aws.neon.tech/klikflow/auth"
API_URL="https://ep-winter-shadow-act1di87.apirest.sa-east-1.aws.neon.tech/klikflow/rest/v1"
ORIGIN="http://localhost:3000"
PASS="TestPassword123!"
STAMP=$(date +%s)

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

pass=0
fail=0

ok() { echo "  OK: $1"; pass=$((pass+1)); }
bad() { echo "  FAIL: $1"; fail=$((fail+1)); }

sign_up() {
  local email="$1" name="$2" jar="$3"
  curl -s -o /dev/null -c "$jar" \
    -X POST "$AUTH_URL/sign-up/email" \
    -H "Content-Type: application/json" \
    -H "Origin: $ORIGIN" \
    -d "{\"email\":\"$email\",\"password\":\"$PASS\",\"name\":\"$name\",\"callbackURL\":\"$ORIGIN\"}"
}

get_jwt() {
  local jar="$1"
  curl -s -D - -o /dev/null -b "$jar" \
    -H "Origin: $ORIGIN" \
    "$AUTH_URL/get-session" \
    | grep -i '^set-auth-jwt:' | sed 's/^[Ss]et-[Aa]uth-[Jj]wt: *//' | tr -d '\r'
}

echo "=== Signing up two test users ==="
EMAIL_A="klikflow-test-a-$STAMP@example.com"
EMAIL_B="klikflow-test-b-$STAMP@example.com"
JAR_A="$TMP/cookies_a.txt"
JAR_B="$TMP/cookies_b.txt"

sign_up "$EMAIL_A" "Owner A" "$JAR_A"
sign_up "$EMAIL_B" "Owner B" "$JAR_B"

JWT_A=$(get_jwt "$JAR_A")
JWT_B=$(get_jwt "$JAR_B")

if [ -z "$JWT_A" ] || [ -z "$JWT_B" ]; then
  echo "FAIL: could not obtain a JWT for one or both test users — aborting."
  echo "      (check AUTH_URL and that email/password sign-up is enabled)"
  exit 1
fi
echo "  Both users signed in, JWTs obtained."

echo ""
echo "=== 1. User A creates Tenant A ==="
TENANT_A_JSON=$(curl -s -X POST "$API_URL/rpc/create_tenant" \
  -H "Authorization: Bearer $JWT_A" -H "Content-Type: application/json" \
  -d '{"tenant_name":"Cafeteria da Ana (teste)","tenant_segment":"cafeteria"}')
TENANT_A_ID=$(echo "$TENANT_A_JSON" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$TENANT_A_ID" ]; then ok "Tenant A created ($TENANT_A_ID)"; else
  bad "Tenant A creation failed: $TENANT_A_JSON"; fi

echo ""
echo "=== 2. User A creates a unit in Tenant A ==="
UNIT_A_JSON=$(curl -s -X POST "$API_URL/units" \
  -H "Authorization: Bearer $JWT_A" -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d "{\"tenant_id\":\"$TENANT_A_ID\",\"name\":\"Unidade Centro\"}")
UNIT_A_ID=$(echo "$UNIT_A_JSON" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$UNIT_A_ID" ]; then ok "Unit created in Tenant A ($UNIT_A_ID)"; else
  bad "Unit creation in Tenant A failed: $UNIT_A_JSON"; fi

echo ""
echo "=== 3. User B creates Tenant B ==="
TENANT_B_JSON=$(curl -s -X POST "$API_URL/rpc/create_tenant" \
  -H "Authorization: Bearer $JWT_B" -H "Content-Type: application/json" \
  -d '{"tenant_name":"Restaurante do Beto (teste)","tenant_segment":"restaurant"}')
TENANT_B_ID=$(echo "$TENANT_B_JSON" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$TENANT_B_ID" ]; then ok "Tenant B created ($TENANT_B_ID)"; else
  bad "Tenant B creation failed: $TENANT_B_JSON"; fi

echo ""
echo "=== 4. User B should see only Tenant B (expect count=1) ==="
COUNT_B=$(curl -s "$API_URL/tenants?select=id" -H "Authorization: Bearer $JWT_B" | grep -o '"id"' | wc -l | tr -d ' ')
[ "$COUNT_B" = "1" ] && ok "User B sees exactly 1 tenant" || bad "User B sees $COUNT_B tenants (expected 1)"

echo ""
echo "=== 5. User B must NOT see Tenant A's units (expect empty) ==="
UNITS_LEAK=$(curl -s "$API_URL/units?tenant_id=eq.$TENANT_A_ID" -H "Authorization: Bearer $JWT_B")
[ "$UNITS_LEAK" = "[]" ] && ok "User B sees 0 units from Tenant A" || bad "User B sees Tenant A units: $UNITS_LEAK"

echo ""
echo "=== 6. User B tries to rename Tenant A (expect 0 rows affected) ==="
RENAME_RESP=$(curl -s -X PATCH "$API_URL/tenants?id=eq.$TENANT_A_ID" \
  -H "Authorization: Bearer $JWT_B" -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d '{"name":"Hijacked"}')
[ "$RENAME_RESP" = "[]" ] && ok "Update blocked (0 rows affected)" || bad "Unexpected response: $RENAME_RESP"

echo ""
echo "=== 7. Confirm Tenant A's name is untouched ==="
NAME_CHECK=$(curl -s "$API_URL/tenants?id=eq.$TENANT_A_ID&select=name" -H "Authorization: Bearer $JWT_A")
echo "$NAME_CHECK" | grep -q "Cafeteria da Ana" && ok "Tenant A name intact" || bad "Tenant A name changed! $NAME_CHECK"

echo ""
echo "=== 8. User B tries to INSERT a unit directly into Tenant A (expect error) ==="
INSERT_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/units" \
  -H "Authorization: Bearer $JWT_B" -H "Content-Type: application/json" \
  -d "{\"tenant_id\":\"$TENANT_A_ID\",\"name\":\"invasão\"}")
[ "$INSERT_HTTP" -ge 400 ] && ok "Cross-tenant insert blocked (HTTP $INSERT_HTTP)" || bad "Cross-tenant insert succeeded! (HTTP $INSERT_HTTP)"

echo ""
echo "=== 9. Anonymous request must not read tenants ==="
ANON_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/tenants")
[ "$ANON_HTTP" -ge 400 ] && ok "Anonymous access blocked (HTTP $ANON_HTTP)" || bad "Anonymous request succeeded! (HTTP $ANON_HTTP)"

echo ""
echo "=========================================="
echo "Result: $pass passed, $fail failed"
echo "=========================================="
[ "$fail" -eq 0 ] && exit 0 || exit 1
