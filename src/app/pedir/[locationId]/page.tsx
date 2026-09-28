import type { Metadata } from "next";

import { CustomerOrderPage } from "@/features/customer-orders/components/customer-order-page";

/**
 * A tradução automática do Chrome inventava nomes de produto/categoria
 * aqui (ex: "Bebidas" virou "Êxodo") — nomes de cardápio não são texto
 * pra traduzir. `google: "notranslate"` pede pro Chrome não oferecer
 * tradução nessa página; `translate="no"` no elemento raiz
 * (customer-order-page.tsx) reforça mesmo quando o usuário já tinha
 * "sempre traduzir" ativado pro domínio.
 */
export const metadata: Metadata = {
  other: { google: "notranslate" },
};

/**
 * Public entry point for all three customer channels — `?channel=totem`
 * for a shared totem at the counter, `?channel=tablet_mesa` for a
 * tablet fixed at that table, everything else (including the plain QR
 * Code/link with no query string) defaults to `qr_code`. No auth guard:
 * this route is meant to be opened by someone with no KlikFlow account.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locationId: string }>;
  searchParams: Promise<{ channel?: string }>;
}) {
  const { locationId } = await params;
  const { channel } = await searchParams;
  const resolvedChannel =
    channel === "totem" ? "totem" : channel === "tablet_mesa" ? "tablet_mesa" : "qr_code";

  return <CustomerOrderPage locationId={locationId} channel={resolvedChannel} />;
}
