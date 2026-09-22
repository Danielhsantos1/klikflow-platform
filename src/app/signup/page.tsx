import Link from "next/link";

import { SignupForm } from "@/features/auth/components/signup-form";

export default function SignupPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Criar conta</h1>
      <SignupForm />
      <p className="text-sm text-neutral-500">
        Já tem conta?{" "}
        <Link href="/login" className="font-medium underline underline-offset-4">
          Entrar
        </Link>
      </p>
    </main>
  );
}
