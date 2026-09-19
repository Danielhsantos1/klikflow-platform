import { appConfig } from "@/config/app";

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
    </main>
  );
}
