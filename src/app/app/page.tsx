import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { SignOutButton } from "@/features/auth/components/sign-out-button";

export const dynamic = "force-dynamic";

export default async function AppHomePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        Bem-vindo, {user.name}
      </h1>
      <p className="text-neutral-500">{user.email}</p>
      <SignOutButton />
    </main>
  );
}
