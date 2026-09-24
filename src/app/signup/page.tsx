import Link from "next/link";

import { SignupForm } from "@/features/auth/components/signup-form";
import { Card, CardContent } from "@/components/ui/card";

export default function SignupPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight">
          Klik<span className="text-brand">Flow</span>
        </h1>
        <p className="text-sm text-muted">Simples. Ágil. Conforme.</p>
      </div>

      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-6 p-6">
          <SignupForm />
          <p className="text-center text-sm text-muted">
            Já tem conta?{" "}
            <Link href="/login" className="font-medium text-brand underline underline-offset-4">
              Entrar
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
