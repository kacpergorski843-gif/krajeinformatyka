import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Factory, Globe2, Shield, LineChart, UserPlus, LogIn, Trophy, Coins, Swords, Building2 } from "lucide-react";

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

const FEATURES = [
  { icon: Factory, title: "Gospodarka", text: "Rozwijaj produkcję i buduj dochód państwa.", stat: "+4.2B KR / doba" },
  { icon: Globe2, title: "Regiony", text: "Rozwijaj infrastrukturę i kontroluj swoje terytorium.", stat: "9 slotów / region" },
  { icon: Shield, title: "Arsenał", text: "Buduj obronę i zarządzaj arsenałem rakietowym.", stat: "OPL + rakiety I–III" },
  { icon: LineChart, title: "Ranking", text: "Śledź pozycję swojego państwa i rywali.", stat: "Ranking państw" },
];

function Landing() {
  return <div className="institutional-entry tactical-bg min-h-screen overflow-hidden">
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-6 sm:py-8 lg:px-10">
      <header className="entry-header"><div className="brand-block"><div className="brand-mark"><Building2 className="size-5" /></div><div><p className="font-display text-sm font-bold">KRAJE INFORMATYKA</p><p className="label-hud">System zarządzania strategicznego</p></div></div><Link to="/ranking-publiczny" className="entry-ranking"><Trophy className="size-4" />Ranking publiczny</Link></header>
      <main className="entry-main"><section className="entry-copy"><p className="label-hud text-primary">CENTRUM DECYZYJNE</p><h1>Zarządzaj państwem.<span>Buduj przewagę.</span></h1><p className="entry-lead">Zintegrowany panel gospodarki, regionów i obrony dla rozgrywek Country Roleplay.</p><div className="entry-actions"><a href="/auth?mode=signup" className="entry-primary"><UserPlus className="size-4" />Utwórz konto<ArrowRight className="size-4" /></a><Link to="/auth" className="entry-secondary"><LogIn className="size-4" />Zaloguj się</Link></div><div className="entry-signals"><span><Coins className="size-4" />Ekonomia dobowa</span><span><Swords className="size-4" />Obrona regionalna</span></div></section><section className="entry-modules" aria-label="Moduły systemu">{FEATURES.map((f, index) => <div key={f.title} className="entry-module"><div className="entry-module-icon"><f.icon className="size-5" strokeWidth={1.6} /></div><div><span>MODUŁ 0{index + 1}</span><h2>{f.title}</h2><p>{f.text}</p></div><strong>{f.stat}</strong></div>)}</section></main>
    </div>
  </div>;
}
