import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useMemo, useState } from "react";
import { Coins, Search, Shield, Vote } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CountryFlag } from "@/components/CountryFlag";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Panel } from "@/components/stat";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { countriesQuery, meQuery } from "@/lib/api";
import type { CountryStats } from "@/lib/api";
import { fmtKR, units } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/ranking")({
  head: () => ({ meta: [
    { title: "Rankingi państw — Kraje Informatyka" },
    { name: "description", content: "Trzy osobne rankingi państw: produkcja KR, głosy wojenne i wartość militarna." },
    { property: "og:title", content: "Rankingi państw — Kraje Informatyka" },
    { property: "og:description", content: "Trzy osobne rankingi: produkcja KR, głosy wojenne i wartość militarna." },
  ]}),
  component: Ranking,
});

type Metric = { key: "income" | "votes" | "military"; label: string; Icon: typeof Coins; value: (c: CountryStats) => string };

const metrics: Metric[] = [
  { key: "income", label: "Produkcja KR", Icon: Coins, value: (c) => fmtKR(c.gross_income) },
  { key: "votes", label: "Głosy wojenne", Icon: Vote, value: (c) => units(c.war_votes) },
  { key: "military", label: "Wartość militarna", Icon: Shield, value: (c) => fmtKR(c.military_value) },
];

function metricNumber(c: CountryStats, key: Metric["key"]) {
  if (key === "income") return BigInt(c.gross_income || "0");
  if (key === "military") return BigInt(c.military_value || "0");
  return BigInt(c.war_votes || 0);
}

function RankingBlock({ metric, countries, myCountryId }: { metric: Metric; countries: CountryStats[]; myCountryId: string | null }) {
  const ranked = [...countries].sort((a, b) => {
    const av = metricNumber(a, metric.key);
    const bv = metricNumber(b, metric.key);
    return bv > av ? 1 : bv < av ? -1 : a.name.localeCompare(b.name, "pl");
  });
  const myRank = myCountryId ? ranked.findIndex((c) => c.country_id === myCountryId) + 1 : 0;
  return (
    <Panel className="p-0 overflow-hidden">
      <div className="border-b border-border/70 bg-secondary/20 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <metric.Icon className="size-4 text-primary" />
          <div><p className="font-display text-sm font-semibold">{metric.label}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Ranking #1 → #N</p></div>
        </div>
        {myRank > 0 ? <span className="text-xs text-primary font-semibold">Twoje miejsce: #{myRank}</span> : null}
      </div>
      <div className="divide-y divide-border/70">
        {ranked.map((c, index) => (
          <div key={c.country_id} className={`grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 ${c.country_id === myCountryId ? "bg-primary/[0.06]" : ""}`}>
            <span className="num text-muted-foreground text-sm">{index + 1}</span>
            <span className="flex min-w-0 items-center gap-2.5">
              <CountryFlag flag={c.flag} alt="" className="h-8 w-12 shrink-0 rounded-sm text-xl" />
              <span className="min-w-0 truncate text-sm font-semibold">{c.name}</span>
            </span>
            <span className="num text-right text-sm font-semibold text-primary">{metric.value(c)}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Ranking() {
  const { data: me, isPending: mePending } = useQuery(meQuery);
  const { data: countries, isPending, isError, error } = useQuery(countriesQuery);
  const [search, setSearch] = useState("");
  const [activeMetric, setActiveMetric] = useState<Metric["key"]>("income");
  const deferredSearch = useDeferredValue(search);
  const filtered = useMemo(() => {
    const query = deferredSearch.trim().toLocaleLowerCase("pl-PL");
    return (countries ?? []).filter((c) => !query || c.name.toLocaleLowerCase("pl-PL").includes(query));
  }, [countries, deferredSearch]);

  return <AppShell me={me ?? null} title="Rankingi" subtitle="Trzy niezależne rankingi: produkcja KR, głosy i wartość militarna">
    <div className="relative"><Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Szukaj państwa…" aria-label="Szukaj państwa w rankingach" className="pl-9" /></div>
    {isPending || mePending ? <div className="mt-4"><PageSkeleton rows={5} cards={3} /></div> : null}
    {isError ? <Panel className="mt-4 border-destructive/40 bg-destructive/5 p-5"><p className="font-semibold text-destructive">Nie udało się wczytać rankingów</p><p className="mt-1 text-sm text-muted-foreground">{error instanceof Error ? error.message : "Spróbuj ponownie za chwilę."}</p></Panel> : null}
    {!isPending && !isError ? (
      <>
        <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl border border-border/70 bg-secondary/20 p-1">
          {metrics.map((metric) => {
            const active = activeMetric === metric.key;
            return (
              <Button
                key={metric.key}
                type="button"
                variant={active ? "default" : "ghost"}
                size="sm"
                className="min-h-10 rounded-lg px-2 text-xs sm:text-sm"
                onClick={() => setActiveMetric(metric.key)}
                aria-pressed={active}
              >
                <metric.Icon className="size-4 shrink-0" />
                <span className="truncate">{metric.label}</span>
              </Button>
            );
          })}
        </div>
        <div className="mt-4">
          {metrics.filter((metric) => metric.key === activeMetric).map((metric) => (
            <RankingBlock key={metric.key} metric={metric} countries={filtered} myCountryId={me?.countryId ?? null} />
          ))}
        </div>
      </>
    ) : null}
  </AppShell>;
}
