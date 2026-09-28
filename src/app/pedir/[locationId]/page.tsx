import { CustomerOrderPage } from "@/features/customer-orders/components/customer-order-page";

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
