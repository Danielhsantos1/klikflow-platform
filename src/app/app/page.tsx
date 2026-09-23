import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { TenantDashboard } from "@/features/tenants/components/tenant-dashboard";

export const dynamic = "force-dynamic";

export default async function AppHomePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="flex flex-1 flex-col">
      <TenantDashboard />
    </main>
  );
}
