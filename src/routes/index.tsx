import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, UserPlus, LogIn, Trophy, Coins, Swords } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Kraje Informatyka — panel dowodzenia państwem" },
    { name: "description", content: "Zbuduj państwo, rozwijaj gospodarkę, zarządzaj regionami i walcz o pozycję w rankingu Kraje Informatyka." },
    { property: "og:title", content: "Kraje Informatyka — panel dowodzenia państwem" },
    { property: "og:description", content: "Gospodarka, regiony, armia i ranking w jednym panelu dowodzenia." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: Landing,
});

function Landing() {
  return <div className="tactical-bg min-h-screen overflow-hidden">
    <div className="mx-auto flex min-h-screen max-w-6xl items-center px-4 py-8 sm:px-6 sm:py-12 lg:px-8"><div className="w-full"><main className="mx-auto max-w-3xl text-center lg:text-left">
      <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-3 py-1.5"><span className="size-1.5 animate-pulse rounded-full bg-primary" /><span className="text-primary font-display text-[10px] font-semibold tracking-[0.28em] uppercase">Kraje Informatyka</span></div>
      <h1 className="max-w-3xl text-4xl leading-[1.02] font-bold tracking-tight sm:text-6xl">Zbuduj państwo.<span className="text-primary block">Przejmij inicjatywę.</span></h1>
      <p className="text-muted-foreground mt-5 max-w-2xl text-sm leading-6 sm:text-base">Zarządzaj gospodarką, rozwijaj regiony, buduj potencjał militarny i walcz o pozycję w rankingu. Każda decyzja wpływa na rozwój Twojego państwa.</p>
      <div className="mt-7 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap"><a href="/auth?mode=signup" className="bg-primary text-primary-foreground group flex min-h-12 items-center justify-center gap-2 rounded-lg px-6 py-3.5 text-sm font-semibold tracking-[0.1em] uppercase shadow-lg shadow-primary/10 transition-all hover:-translate-y-0.5 hover:shadow-primary/20"><UserPlus className="size-4" />Rozpocznij grę<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></a><Link to="/auth" className="border-primary/50 text-primary flex min-h-12 items-center justify-center gap-2 rounded-lg border px-6 py-3.5 text-sm font-semibold tracking-[0.1em] uppercase transition-colors hover:bg-primary/5"><LogIn className="size-4" />Mam już konto</Link><Link to="/ranking-publiczny" className="text-muted-foreground hover:text-foreground flex min-h-12 items-center justify-center gap-2 rounded-lg px-4 py-3.5 text-xs font-semibold tracking-[0.1em] uppercase transition-colors"><Trophy className="size-4" />Ranking publiczny</Link></div>
      <div className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[10px] text-muted-foreground lg:justify-start"><span className="inline-flex items-center gap-1.5"><Coins className="size-3.5 text-primary" />Ekonomia rozliczana serwerowo</span><span className="inline-flex items-center gap-1.5"><Swords className="size-3.5 text-primary" />Arsenał i obrona</span></div>
    </main></div></div>
  </div>;
}
