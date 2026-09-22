import Link from "next/link";

import { LoginForm } from "@/features/auth/components/login-form";

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Entrar</h1>
      <LoginForm />
      <p className="text-sm text-neutral-500">
        Ainda não tem conta?{" "}
        <Link href="/signup" className="font-medium underline underline-offset-4">
          Criar conta
        </Link>
      </p>
    </main>
  );
}
