import Link from "next/link";

import { appConfig } from "@/config/app";
import { buttonVariants } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
        {appConfig.name}
      </h1>
      <p className="text-lg text-neutral-500">{appConfig.tagline}</p>
      <p className="max-w-md text-sm text-neutral-400">
        {appConfig.description}
      </p>
      <div className="mt-4 flex gap-3">
        <Link href="/login" className={buttonVariants({ variant: "default" })}>
          Entrar
        </Link>
        <Link href="/signup" className={buttonVariants({ variant: "outline" })}>
          Criar conta
        </Link>
      </div>
    </main>
  );
}
