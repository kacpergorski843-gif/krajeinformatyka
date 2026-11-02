import { createFileRoute, Link } from "@tanstack/react-router";
import { UserPlus, LogIn } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Kraje Informatyka" },
    { name: "description", content: "Kraje Informatyka" },
    { property: "og:title", content: "Kraje Informatyka" },
    { property: "og:description", content: "Kraje Informatyka" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: Landing,
});

function Landing() {
  return <div className="tactical-bg flex min-h-screen items-center justify-center overflow-hidden px-4 py-8 sm:px-6">
    <main className="w-full max-w-xl text-center">
      <h1 className="mb-10 font-display text-4xl font-bold tracking-tight sm:text-6xl">KRAJE INFORMATYKA</h1>
      <div className="flex flex-col justify-center gap-3 sm:flex-row">
        <a href="/auth?mode=signup" className="bg-primary text-primary-foreground flex min-h-12 items-center justify-center gap-2 rounded-lg px-6 py-3.5 text-sm font-semibold tracking-[0.1em] uppercase shadow-lg shadow-primary/10 transition-all hover:-translate-y-0.5 hover:shadow-primary/20"><UserPlus className="size-4" />Utwórz konto</a>
        <Link to="/auth" className="bg-primary text-primary-foreground flex min-h-12 items-center justify-center gap-2 rounded-lg px-6 py-3.5 text-sm font-semibold tracking-[0.1em] uppercase shadow-lg shadow-primary/10 transition-all hover:-translate-y-0.5 hover:shadow-primary/20"><LogIn className="size-4" />Zaloguj się</Link>
      </div>
    </main>
  </div>;
}
