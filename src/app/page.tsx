import Link from "next/link";

import { appConfig } from "@/config/app";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const FEATURES = [
  {
    title: "Painel da equipe",
    description: "Comandas por mesa, lançamento rápido, histórico e fechamento em segundos.",
  },
  {
    title: "QR Code na mesa",
    description: "Cliente escaneia, monta o pedido pelo celular, sem baixar app e sem cadastro.",
  },
  {
    title: "Totem e tablet",
    description: "Autoatendimento no balcão ou na mesa, com senha de retirada gerada na hora.",
  },
  {
    title: "Produção por estação",
    description: "A cozinha e o balcão veem só o que produzem. Item pronto avança o pedido sozinho.",
  },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-6 py-4 sm:px-10">
        <span className="text-lg font-extrabold tracking-tight">
          Klik<span className="text-brand">Flow</span>
        </span>
        <div className="flex gap-2">
          <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Entrar
          </Link>
          <Link href="/signup" className={buttonVariants({ variant: "default", size: "sm" })}>
            Começar grátis
          </Link>
        </div>
      </header>

      <section className="flex flex-col items-center gap-6 px-6 py-16 text-center sm:py-24">
        <Badge variant="brand">{appConfig.tagline}</Badge>
        <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">
          O sistema que unifica <span className="text-brand">equipe</span>, cliente e cozinha.
        </h1>
        <p className="max-w-xl text-lg text-muted">
          Comandas digitais, QR Code na mesa, totem e produção por estação — tudo no mesmo motor,
          para restaurantes, cafeterias, bares e lanchonetes.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/signup" className={buttonVariants({ size: "lg" })}>
            Criar minha empresa
          </Link>
          <Link href="/login" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Já tenho conta
          </Link>
        </div>
        <div className="flex flex-wrap justify-center gap-2 pt-2 text-xs text-muted">
          <span>🔒 Isolamento multi-tenant reforçado no banco</span>
          <span>·</span>
          <span>📱 Cliente pede sem cadastro</span>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 pb-20 sm:px-10">
        <div className="flex flex-col gap-1 text-center">
          <span className="text-xs font-semibold uppercase tracking-wide text-brand">
            Um motor, três portas de entrada
          </span>
          <h2 className="text-2xl font-bold tracking-tight">
            Feito para operar rápido, sem duplicar sistema.
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <Card key={feature.title}>
              <CardContent className="p-5">
                <p className="font-semibold">{feature.title}</p>
                <p className="mt-1 text-sm text-muted">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
