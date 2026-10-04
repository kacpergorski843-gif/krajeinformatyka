import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Coins, Shield, Vote } from "lucide-react";
import { Panel } from "@/components/stat";
import { publicRankingQuery } from "@/lib/api";
import { fmtKR, units } from "@/lib/format";

export const Route = createFileRoute("/ranking-publiczny")({
  head: () => ({
    meta: [
      { title: "Ranking państw — Kraje Informatyka" },
      {
        name: "description",
        content: "Publiczny ranking państw: produkcja KR, głosy wojenne i wartość militarna.",
      },
      { property: "og:title", content: "Ranking państw — Kraje Informatyka" },
      {
        property: "og:description",
        content: "Produkcja KR, głosy wojenne i wartość militarna państw.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PublicRanking,
});

function metrics(country: {
  gross_income: string;
  war_votes: number;
  military_value: string;
}) {
  return [
    { label: "Produkcja KR", value: fmtKR(country.gross_income), Icon: Coins },
    { label: "Głosy", value: units(country.war_votes), Icon: Vote },
    { label: "Wartość militarna", value: fmtKR(country.military_value), Icon: Shield },
  ] as const;
}

function PublicRanking() {
  const { data, isLoading, isError } = useQuery(publicRankingQuery);
  const list = [...(data ?? [])].sort((a, b) => Number(b.gross_income) - Number(a.gross_income));

  return (
    <div className="tactical-bg min-h-screen">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <Link to="/" className="text-muted-foreground inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm hover:bg-secondary/50">
          <ArrowLeft className="size-3.5" strokeWidth={1.5} /> Strona główna
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Ranking państw</h1>
        <p className="label-hud">Podgląd publiczny, tylko do odczytu</p>
        <p className="mt-5 text-sm text-muted-foreground">
          Ranking sortowany według produkcji KR. Produkcja KR, głosy wojenne i wartość militarna są pokazane osobno.
        </p>

        {isLoading ? <p className="text-muted-foreground mt-6 text-sm">Wczytywanie…</p> : null}
        {isError ? <p className="text-destructive mt-6 text-sm">Nie udało się wczytać rankingu.</p> : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {list.slice(0, 3).map((country, i) => (
            <Panel key={country.country_id} className="hud-frame">
              <p className="text-primary font-display text-xs tracking-[0.24em] uppercase">
                RANK {String(i + 1).padStart(2, "0")}
              </p>
              <p className="mt-2 truncate text-base font-semibold">{country.name}</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {metrics(country).map(({ label, value, Icon }) => (
                  <div key={label} className="rounded-sm border border-border/70 bg-secondary/30 px-2.5 py-2">
                    <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                      <Icon className="size-3" />
                      {label}
                    </div>
                    <p className="num mt-1 text-sm font-semibold text-primary">{value}</p>
                  </div>
                ))}
              </div>
            </Panel>
          ))}
        </div>

        <Panel className="divide-border mt-3 divide-y p-0">
          {list.slice(3).map((country, i) => (
            <div key={country.country_id} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 px-3 py-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(300px,auto)]">
              <span className="num text-inactive w-6 shrink-0 text-sm">{i + 4}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{country.name}</span>
                <span className="text-inactive text-[11px] uppercase">Produkcja KR · Głosy · Wartość militarna</span>
              </span>
              <span className="grid grid-cols-3 gap-2 text-right">
                <span><span className="block text-[9px] text-muted-foreground">KR</span><span className="num text-primary text-xs">{fmtKR(country.gross_income)}</span></span>
                <span><span className="block text-[9px] text-muted-foreground">Głosy</span><span className="num text-primary text-xs">{units(country.war_votes)}</span></span>
                <span><span className="block text-[9px] text-muted-foreground">Mil.</span><span className="num text-primary text-xs">{fmtKR(country.military_value)}</span></span>
              </span>
            </div>
          ))}
          {!isLoading && list.length === 0 ? <p className="text-muted-foreground p-3 text-sm">Brak państw w rozgrywce.</p> : null}
        </Panel>
      </div>
    </div>
  );
}
