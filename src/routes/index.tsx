import { createFileRoute, Link } from "@tanstack/react-router";
import { Globe2, Factory, Shield, LineChart, UserPlus, LogIn, Trophy } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nation Dynamics — panel dowodzenia państwem" },
      {
        name: "description",
        content:
          "Zarządzaj budżetem, surowcami, regionami i armią swojego państwa. Dobowa ekonomia o 20:00, arsenał rakietowy i publiczny ranking państw.",
      },
      { property: "og:title", content: "Nation Dynamics — panel dowodzenia państwem" },
      {
        property: "og:description",
        content: "Budżet, surowce, regiony, armia i ranking państw w jednym panelu.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: Factory,
    title: "Ekonomia dobowa",
    text: "Fabryki i zakłady surowcowe rozliczane codziennie o 20:00.",
  },
  { icon: Globe2, title: "Regiony i sloty", text: "9 slotów w regionie z pilnowaniem zasad zabudowy." },
  { icon: Shield, title: "Arsenał", text: "OPL przypisane do regionów, rakiety I–III i salwy." },
  { icon: LineChart, title: "Ranking", text: "Zarobki dzienne i potencjał głosów wojennych." },
];

function Landing() {
  return (
    <div className="tactical-bg min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-5 py-16">
        <p className="text-primary font-display text-xs tracking-[0.3em] uppercase">
          Nation Dynamics
        </p>
        <h1 className="mt-3 text-3xl leading-tight font-bold sm:text-5xl">
          Panel dowodzenia Twojego państwa
        </h1>
        <p className="text-muted-foreground mt-4 text-sm sm:text-base">
          Skarbiec, surowce, regiony, armia i historia decyzji — wszystko w jednym miejscu, liczone
          po stronie serwera. Start każdego państwa to 1 500 000 000 000 KR.
        </p>

        <div className="mt-8 grid gap-3">
          <a
            href="/auth?mode=signup"
            className="bg-primary text-primary-foreground flex min-h-12 items-center justify-center gap-2 rounded-lg px-5 py-3.5 text-sm font-semibold tracking-[0.1em] uppercase"
          >
            <UserPlus className="size-4" strokeWidth={1.5} /> Nowy użytkownik? Zarejestruj się
          </a>
          <Link
            to="/auth"
            className="border-primary/60 text-primary flex min-h-12 items-center justify-center gap-2 rounded-lg border px-5 py-3.5 text-sm font-semibold tracking-[0.1em] uppercase"
          >
            <LogIn className="size-4" strokeWidth={1.5} /> Masz już konto? Zaloguj się
          </Link>
          <Link
            to="/ranking-publiczny"
            className="border-border text-muted-foreground flex min-h-12 items-center justify-center gap-2 rounded-lg border px-5 py-3.5 text-sm font-semibold tracking-[0.1em] uppercase"
          >
            <Trophy className="size-4" strokeWidth={1.5} /> Ranking
          </Link>
        </div>

        <div className="mt-12 grid gap-3 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="panel hud-frame p-4">
              <f.icon className="text-primary size-5" strokeWidth={1.5} />
              <p className="mt-3 text-sm font-semibold">{f.title}</p>
              <p className="text-muted-foreground mt-1 text-xs">{f.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
