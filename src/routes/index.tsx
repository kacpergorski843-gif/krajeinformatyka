import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Factory, Globe2, Shield, LineChart, UserPlus, LogIn, Trophy, Coins, Swords } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nation Dynamics — panel dowodzenia państwem" },
      { name: "description", content: "Zbuduj państwo, rozwijaj gospodarkę, zarządzaj regionami i walcz o pozycję w rankingu Nation Dynamics." },
      { property: "og:title", content: "Nation Dynamics — panel dowodzenia państwem" },
      { property: "og:description", content: "Gospodarka, regiony, armia i ranking w jednym panelu dowodzenia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { icon: Factory, title: "Gospodarka", text: "Rozwijaj produkcję i buduj dochód państwa.", stat: "+4.2B KR / doba" },
  { icon: Globe2, title: "Regiony", text: "Rozwijaj infrastrukturę i kontroluj swoje terytorium.", stat: "9 slotów / region" },
  { icon: Shield, title: "Arsenał", text: "Buduj obronę i zarządzaj arsenałem rakietowym.", stat: "OPL + rakiety I–III" },
  { icon: LineChart, title: "Ranking", text: "Śledź pozycję swojego państwa i rywali.", stat: "Ranking państw" },
];

function Landing() {
  return (
    <div className="tactical-bg min-h-screen overflow-hidden">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <div className="w-full">
          <main className="mx-auto max-w-3xl text-center lg:text-left">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-3 py-1.5">
              <span className="size-1.5 animate-pulse rounded-full bg-primary" />
              <span className="text-primary font-display text-[10px] font-semibold tracking-[0.28em] uppercase">Nation Dynamics</span>
            </div>
            <h1 className="max-w-3xl text-4xl leading-[1.02] font-bold tracking-tight sm:text-6xl">Zbuduj państwo.<span className="text-primary block">Przejmij inicjatywę.</span></h1>
            <p className="text-muted-foreground mt-5 max-w-2xl text-sm leading-6 sm:text-base">Zarządzaj gospodarką, rozwijaj regiony, buduj potencjał militarny i walcz o pozycję w rankingu. Każda decyzja wpływa na rozwój Twojego państwa.</p>
            <div className="mt-7 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
              <a href="/auth?mode=signup" className="bg-primary text-primary-foreground group flex min-h-12 items-center justify-center gap-2 rounded-lg px-6 py-3.5 text-sm font-semibold tracking-[0.1em] uppercase shadow-lg shadow-primary/10 transition-all hover:-translate-y-0.5 hover:shadow-primary/20"><UserPlus className="size-4" />Rozpocznij grę<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></a>
              <Link to="/auth" className="border-primary/50 text-primary flex min-h-12 items-center justify-center gap-2 rounded-lg border px-6 py-3.5 text-sm font-semibold tracking-[0.1em] uppercase transition-colors hover:bg-primary/5"><LogIn className="size-4" />Mam już konto</Link>
              <Link to="/ranking-publiczny" className="text-muted-foreground hover:text-foreground flex min-h-12 items-center justify-center gap-2 rounded-lg px-4 py-3.5 text-xs font-semibold tracking-[0.1em] uppercase transition-colors"><Trophy className="size-4" />Ranking publiczny</Link>
            </div>
            <div className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[10px] text-muted-foreground lg:justify-start"><span className="inline-flex items-center gap-1.5"><Coins className="size-3.5 text-primary" />Ekonomia rozliczana serwerowo</span><span className="inline-flex items-center gap-1.5"><Swords className="size-3.5 text-primary" />Arsenał i obrona</span></div>
          </main>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 pb-8 sm:px-6 lg:px-8"><div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">{FEATURES.map((f) => <div key={f.title} className="panel hud-frame group p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30"><f.icon className="text-primary size-5" strokeWidth={1.5} /><div className="mt-3 flex items-center justify-between gap-2"><p className="text-sm font-semibold">{f.title}</p><span className="text-primary/80 font-display text-[9px] uppercase">{f.stat}</span></div><p className="text-muted-foreground mt-1 text-xs leading-5">{f.text}</p></div>)}</div></div>
    </div>
  );
}
