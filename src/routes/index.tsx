import { createFileRoute, Link } from "@tanstack/react-router";
import { Globe2, Factory, Shield, LineChart } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sztab — panel dowodzenia państwem | Country Roleplay" },
      {
        name: "description",
        content:
          "Zarządzaj budżetem, surowcami, regionami i armią swojego państwa w roleplayu na WhatsAppie. Dobowa ekonomia, sklep i ranking państw.",
      },
      { property: "og:title", content: "Sztab — panel dowodzenia państwem" },
      {
        property: "og:description",
        content: "Budżet, surowce, regiony, armia i ranking państw w jednym panelu.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { icon: Factory, title: "Ekonomia dobowa", text: "Fabryki i wytwórnie rozliczane codziennie o 20:00." },
  { icon: Globe2, title: "Regiony i sloty", text: "9 slotów w regionie, z pilnowaniem zasad zabudowy." },
  { icon: Shield, title: "Wojsko", text: "OPL, rakiety I–III, żołnierze i czołgi z głosami wojennymi." },
  { icon: LineChart, title: "Ranking", text: "Porównanie państw po produkcji KR i sile militarnej." },
];

function Landing() {
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-5 py-16">
      <p className="text-primary font-display text-xs tracking-[0.3em] uppercase">
        WhatsApp Country Roleplay
      </p>
      <h1 className="mt-3 text-3xl leading-tight font-bold sm:text-5xl">
        Panel dowodzenia Twojego państwa
      </h1>
      <p className="text-muted-foreground mt-4 text-sm sm:text-base">
        Skarbiec, surowce, regiony, armia i historia decyzji — wszystko w jednym miejscu, liczone po
        stronie serwera. Start każdego państwa to 1 500 000 000 000 KR.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          to="/auth"
          className="bg-primary text-primary-foreground rounded-md px-5 py-2.5 text-sm font-semibold"
        >
          Zaloguj się
        </Link>
        <Link
          to="/ranking"
          className="border-border rounded-md border px-5 py-2.5 text-sm font-semibold"
        >
          Zobacz ranking
        </Link>
      </div>
      <div className="mt-12 grid gap-3 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <div key={f.title} className="panel p-4">
            <f.icon className="text-primary size-5" />
            <p className="mt-3 text-sm font-semibold">{f.title}</p>
            <p className="text-muted-foreground mt-1 text-xs">{f.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
