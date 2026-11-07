import Link from "next/link";

import { appConfig } from "@/config/app";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FaqAccordion } from "@/features/marketing/components/faq-accordion";

const PAINS = [
  {
    pain: "Comanda vira bagunça quando o salão enche",
    solution: "Comandas digitais por mesa — lançamento rápido, histórico e fechamento em segundos.",
  },
  {
    pain: "Fila no caixa na hora do rush",
    solution: "Caixa fecha a comanda inteira de uma vez, com forma de pagamento registrada.",
  },
  {
    pain: "Cozinha não sabe o que já está pronto",
    solution: "Produção por estação — item concluído avança o pedido sozinho, sem telefone/grito.",
  },
  {
    pain: "Preço no chute, sem saber o custo real",
    solution: "Ficha técnica por produto: custo, CMV% e margem calculados automaticamente.",
  },
  {
    pain: "Abertura e fechamento sem padrão entre turnos",
    solution: "Checklists diários — cada item marcado fica registrado, volta zerado no dia seguinte.",
  },
  {
    pain: "Fim do mês sem saber quanto realmente entrou",
    solution: "Fluxo de caixa mensal e anual, por forma de pagamento, a partir do que já foi vendido.",
  },
];

const CHANNELS = [
  {
    title: "QR Code",
    description: "O cliente escaneia na mesa, monta o pedido pelo próprio celular — sem app, sem cadastro.",
  },
  {
    title: "Totem",
    description: "Autoatendimento no balcão: o cliente pede e paga sozinho, senha de retirada na hora.",
  },
  {
    title: "Tablet na Mesa",
    description: "Um tablet fixo por mesa, pro cliente que prefere não usar o próprio celular.",
  },
  {
    title: "Atendente",
    description: "A equipe lança o pedido direto em Comandas, pro cliente que prefere ser atendido.",
  },
];

const MODULES = [
  {
    title: "Comandas",
    description: "Cria e acompanha o pedido — nunca mistura isso com cobrar ou preparar.",
  },
  {
    title: "Caixa",
    description: "Recebe o pagamento e fecha a comanda inteira, de uma vez.",
  },
  {
    title: "Produção",
    description: "Fila por estação, do Novo ao Entregue, sem pular etapa.",
  },
  {
    title: "Painel TV",
    description: "Só exibe pedidos prontos pro cliente identificar — leitura, nunca ação.",
  },
  {
    title: "Catálogo & CMV",
    description: "Produtos, categorias, estações de produção e ficha técnica de custo.",
  },
  {
    title: "Checklists",
    description: "Rotinas de abertura e fechamento, marcadas pela equipe todo dia.",
  },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4 sm:px-10">
        <span className="text-lg font-extrabold tracking-tight">
          Klik<span className="text-brand">Flow</span>
        </span>
        <nav className="hidden items-center gap-6 text-sm font-medium sm:flex">
          <a href="#como-funciona" className="hover:text-brand">
            Como funciona
          </a>
          <a href="#faq" className="hover:text-brand">
            FAQ
          </a>
        </nav>
        <div className="flex gap-2">
          <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Entrar
          </Link>
          <Link href="/signup" className={buttonVariants({ variant: "default", size: "sm" })}>
            Começar grátis
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="flex flex-col items-center gap-6 px-6 py-16 text-center sm:py-24">
        <h1 className="max-w-3xl text-4xl font-black uppercase leading-tight tracking-tight sm:text-6xl">
          Menos caos na operação.
          <br />
          <span className="text-brand">Mais controle</span> no seu negócio.
        </h1>
        <p className="max-w-xl text-lg text-muted">{appConfig.description} — comandas, pedidos,
          produção, caixa e custo, tudo no mesmo lugar.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/signup" className={buttonVariants({ size: "lg" })}>
            Criar minha empresa
          </Link>
          <a href="#como-funciona" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Ver como funciona
          </a>
        </div>
        <div className="flex flex-wrap justify-center gap-2 pt-2 text-xs font-semibold uppercase tracking-wide text-muted">
          <span>QR Code</span>
          <span>·</span>
          <span>Totem</span>
          <span>·</span>
          <span>Tablet na Mesa</span>
          <span>·</span>
          <span>Atendente</span>
        </div>
      </section>

      {/* Dores reais */}
      <section className="flex flex-col items-center gap-10 px-6 py-16 sm:px-10">
        <h2 className="text-center text-2xl font-black uppercase tracking-tight sm:text-3xl">
          Dores reais da operação
        </h2>
        <div className="grid w-full max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PAINS.map((item) => (
            <Card key={item.pain}>
              <CardContent className="flex flex-col gap-2 p-5">
                <p className="text-sm font-semibold text-muted line-through decoration-danger/60">
                  {item.pain}
                </p>
                <p className="text-sm font-medium">{item.solution}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Módulos */}
      <section id="como-funciona" className="flex flex-col items-center gap-10 bg-surface px-6 py-16 sm:px-10">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="text-xs font-semibold uppercase tracking-wide text-brand">
            Como o KlikFlow ajuda
          </span>
          <h2 className="text-2xl font-black uppercase tracking-tight sm:text-3xl">
            Um módulo pra cada responsabilidade
          </h2>
          <p className="max-w-xl text-sm text-muted">
            Sem duplicar função entre telas — cada etapa do fluxo tem um dono só.
          </p>
        </div>
        <div className="grid w-full max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((module) => (
            <Card key={module.title}>
              <CardContent className="flex flex-col gap-1 p-5">
                <p className="font-bold">{module.title}</p>
                <p className="text-sm text-muted">{module.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Canais */}
      <section className="flex flex-col items-center gap-10 px-6 py-16 sm:px-10">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="text-xs font-semibold uppercase tracking-wide text-brand">
            Como o cliente pede
          </span>
          <h2 className="text-2xl font-black uppercase tracking-tight sm:text-3xl">
            Quatro portas, um fluxo só
          </h2>
        </div>
        <div className="grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2">
          {CHANNELS.map((channel) => (
            <Card key={channel.title}>
              <CardContent className="flex flex-col gap-1 p-5">
                <p className="font-bold">{channel.title}</p>
                <p className="text-sm text-muted">{channel.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className="flex flex-col items-center gap-6 bg-brand px-6 py-16 text-center text-brand-foreground sm:px-10">
        <h2 className="text-2xl font-black uppercase tracking-tight sm:text-3xl">
          Pronto pra organizar a operação?
        </h2>
        <p className="max-w-md text-brand-foreground/90">
          Crie sua empresa agora e comece a configurar comandas, catálogo e equipe.
        </p>
        <Link
          href="/signup"
          className={buttonVariants({ variant: "secondary", size: "lg", className: "bg-brand-foreground text-brand hover:opacity-90" })}
        >
          Criar minha empresa
        </Link>
      </section>

      {/* FAQ */}
      <section id="faq" className="flex flex-col items-center gap-10 px-6 py-16 sm:px-10">
        <h2 className="text-center text-2xl font-black uppercase tracking-tight sm:text-3xl">
          Perguntas frequentes
        </h2>
        <FaqAccordion />
      </section>

      <footer className="flex flex-col items-center gap-2 border-t border-border px-6 py-10 text-center text-sm text-muted">
        <span className="text-base font-extrabold tracking-tight text-foreground">
          Klik<span className="text-brand">Flow</span>
        </span>
        <p className="max-w-sm">{appConfig.description}</p>
        <div className="flex gap-4 pt-2">
          <Link href="/login" className="underline underline-offset-4 hover:text-brand">
            Entrar
          </Link>
          <Link href="/signup" className="underline underline-offset-4 hover:text-brand">
            Criar conta
          </Link>
        </div>
      </footer>
    </main>
  );
}
