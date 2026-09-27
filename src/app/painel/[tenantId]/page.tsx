import { ReadyPanel } from "@/features/ready-panel/components/ready-panel";

/**
 * Rota pública, sem login — pensada pra abrir numa TV do balcão da
 * loja e ficar exibindo indefinidamente.
 */
export default async function Page({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;

  return <ReadyPanel tenantId={tenantId} />;
}
