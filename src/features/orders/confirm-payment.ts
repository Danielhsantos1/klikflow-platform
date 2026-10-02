import { createDbClient } from "@/lib/db/client";

/**
 * Confirma o pagamento de um pedido "Aguardando pagamento" e libera
 * pra produção (status_id -> "new"). Usada tanto por Comandas quanto
 * por Caixa - antes cada tela reimplementava isso de forma idêntica;
 * centralizado aqui pra ter um único ponto de verdade.
 */
export async function confirmOrderPayment(
  tenantId: string,
  orderId: string,
): Promise<{ error: string | null }> {
  const db = createDbClient();

  const { data: newStatus, error: statusError } = await db
    .from("order_statuses")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("key", "new")
    .maybeSingle();

  if (statusError || !newStatus) {
    return { error: statusError?.message ?? "Status 'Novo' não configurado para esta empresa." };
  }

  const { error: updateError } = await db
    .from("orders")
    .update({ status_id: newStatus.id })
    .eq("id", orderId);

  if (updateError) {
    return { error: updateError.message };
  }

  return { error: null };
}
