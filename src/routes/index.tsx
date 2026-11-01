import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Factory, Globe2, Shield, LineChart, UserPlus, LogIn, Trophy, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import worldImage from "@/assets/strategic-world.jpg";

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
  { icon: Factory, title: "Gospodarka", text: "Produkcja, surowce i finanse państwa." },
  { icon: Globe2, title: "Regiony", text: "Terytorium i rozwój infrastruktury." },
  { icon: Shield, title: "Wojsko", text: "Arsenał i obrona Twoich regionów." },
  { icon: LineChart, title: "Ranking", text: "Pozycja państw w rozgrywce." },
];

function Landing() {
  return <div className="entry-page">
    <header className="entry-nav">
      <Link to="/" className="brand-block" aria-label="Kraje Informatyka — strona główna">
        <span className="brand-mark"><Landmark className="size-5" /></span>
        <span className="brand-name">KRAJE INFORMATYKA</span>
      </Link>
      <Button variant="ghost" asChild><Link to="/ranking-publiczny"><Trophy />Ranking</Link></Button>
    </header>
    <main className="entry-hero">
      <img src={worldImage} alt="Mapa świata w sali dowodzenia" width={1600} height={1008} fetchPriority="high" />
      <div className="entry-copy">
        <p className="label-hud mb-4">Rozgrywka państwowa</p>
        <h1>Kraje Informatyka</h1>
        <p>Twoje państwo. Twoje decyzje.<br />Rozwijaj gospodarkę, zarządzaj regionami i buduj swoją pozycję w świecie.</p>
        <div className="entry-actions">
          <Button size="lg" asChild><a href="/auth?mode=signup"><UserPlus />Rozpocznij grę<ArrowRight /></a></Button>
          <Button size="lg" variant="outline" className="border-cover-foreground/40 text-cover-foreground hover:bg-cover-foreground/10 hover:text-cover-foreground" asChild><Link to="/auth"><LogIn />Mam już konto</Link></Button>
        </div>
      </div>
    </main>
    <section className="entry-modules" aria-label="Rozgrywka">
      {FEATURES.map((feature) => <div key={feature.title} className="entry-module">
        <feature.icon className="size-5 text-primary" strokeWidth={1.7} />
        <h2>{feature.title}</h2><p>{feature.text}</p>
      </div>)}
    </section>
  </div>;
}
