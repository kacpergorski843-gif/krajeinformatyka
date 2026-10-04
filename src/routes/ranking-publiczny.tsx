import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Coins, Shield, Vote } from "lucide-react";
import { Panel } from "@/components/stat";
import { publicRankingQuery } from "@/lib/api";
import { fmtKR, units } from "@/lib/format";

export const Route = createFileRoute("/ranking-publiczny")({
  head: () => ({ meta: [
    { title: "Rankingi państw — Kraje Informatyka" },
    { name: "description", content: "Trzy osobne rankingi państw: produkcja KR, głosy wojenne i wartość militarna." },
    { property: "og:title", content: "Rankingi państw — Kraje Informatyka" },
    { property: "og:description", content: "Trzy osobne rankingi: produkcja KR, głosy wojenne i wartość militarna." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: PublicRanking,
});

type Row = { country_id: string; name: string; gross_income: string; war_votes: number; military_value: string; flag?: string };
type Metric = { key: "income" | "votes" | "military"; label: string; Icon: typeof Coins; value: (c: Row) => string };

const metrics: Metric[] = [
  { key: "income", label: "Produkcja KR", Icon: Coins, value: (c) => fmtKR(c.gross_income) },
  { key: "votes", label: "Głosy wojenne", Icon: Vote, value: (c) => units(c.war_votes) },
  { key: "military", label: "Wartość militarna", Icon: Shield, value: (c) => fmtKR(c.military_value) },
];

function metricNumber(c: Row, key: Metric["key"]) {
  if (key === "income") return BigInt(c.gross_income || "0");
  if (key === "military") return BigInt(c.military_value || "0");
  return BigInt(c.war_votes || 0);
}

function RankingBlock({ metric, rows }: { metric: Metric; rows: Row[] }) {
  const ranked = [...rows].sort((a, b) => {
    const av = metricNumber(a, metric.key), bv = metricNumber(b, metric.key);
    return bv > av ? 1 : bv < av ? -1 : a.name.localeCompare(b.name, "pl");
  });
  return <Panel className="p-0 overflow-hidden">
    <div className="border-b border-border/70 bg-secondary/20 px-4 py-3 flex items-center gap-2">
      <metric.Icon className="size-4 text-primary" />
      <div><p className="font-display text-sm font-semibold">{metric.label}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Ranking #1 → #N</p></div>
    </div>
    <div className="divide-y divide-border/70">
      {ranked.map((country, index) => <div key={country.country_id} className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5">
        <span className="num text-muted-foreground text-sm">{index + 1}</span>
        <span className="min-w-0 truncate text-sm font-semibold">{country.name}</span>
        <span className="num text-right text-sm font-semibold text-primary">{metric.value(country)}</span>
      </div>)}
    </div>
  </Panel>;
}

function PublicRanking() {
  const { data, isLoading, isError } = useQuery(publicRankingQuery);
  const rows = (data ?? []) as Row[];

  return <div className="tactical-bg min-h-screen">
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <Link to="/" className="text-muted-foreground inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm hover:bg-secondary/50"><ArrowLeft className="size-3.5" strokeWidth={1.5} /> Strona główna</Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Rankingi państw</h1>
      <p className="label-hud">Trzy niezależne rankingi</p>
      <p className="mt-5 text-sm text-muted-foreground">Każda wartość ma własną tabelę i własną kolejność miejsc.</p>
      {isLoading ? <p className="text-muted-foreground mt-6 text-sm">Wczytywanie…</p> : null}
      {isError ? <p className="text-destructive mt-6 text-sm">Nie udało się wczytać rankingów.</p> : null}
      {!isLoading && !isError ? <div className="mt-5 grid gap-4 xl:grid-cols-3">{metrics.map((metric) => <RankingBlock key={metric.key} metric={metric} rows={rows} />)}</div> : null}
    </div>
  </div>;
}
