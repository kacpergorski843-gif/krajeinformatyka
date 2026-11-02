import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useMemo, useState } from "react";
import { Coins, Search, Vote } from "lucide-react";
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
    { name: "description", content: "Rankingi państw: produkcja KR i głosy wojenne." },
    { property: "og:title", content: "Rankingi państw — Kraje Informatyka" },
    { property: "og:description", content: "Rankingi produkcji KR i głosów wojennych." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: Ranking,
});

type Metric = { key: "income" | "votes"; label: string; shortLabel: string; Icon: typeof Coins; value: (c: CountryStats) => string };

const metrics: Metric[] = [
  { key: "income", label: "Produkcja KR", shortLabel: "Produkcja", Icon: Coins, value: (c) => fmtKR(c.gross_income) },
  { key: "votes", label: "Głosy wojenne", shortLabel: "Głosy", Icon: Vote, value: (c) => units(c.war_votes) },
];

function metricNumber(c: CountryStats, key: Metric["key"]) {
  if (key === "income") return BigInt(c.gross_income || "0");
  return BigInt(c.war_votes || 0);
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

  const active = metrics.find((metric) => metric.key === activeMetric) ?? metrics[0];
  const ranked = useMemo(() => [...filtered].sort((a, b) => {
    const av = metricNumber(a, activeMetric);
    const bv = metricNumber(b, activeMetric);
    return bv > av ? 1 : bv < av ? -1 : a.name.localeCompare(b.name, "pl");
  }), [filtered, activeMetric]);
  const myRank = me?.countryId ? ranked.findIndex((c) => c.country_id === me.countryId) + 1 : 0;

  return (
    <AppShell me={me ?? null} title="Rankingi">
      <div className="mx-auto w-full max-w-5xl">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj państwa…"
            aria-label="Szukaj państwa w rankingach"
            className="h-11 rounded-xl pl-9"
          />
        </div>

        {isPending || mePending ? <div className="mt-4"><PageSkeleton rows={5} cards={3} /></div> : null}
        {isError ? (
          <Panel className="mt-4 border-destructive/40 bg-destructive/5 p-5">
            <p className="font-semibold text-destructive">Nie udało się wczytać rankingów</p>
            <p className="mt-1 text-sm text-muted-foreground">{error instanceof Error ? error.message : "Spróbuj ponownie za chwilę."}</p>
          </Panel>
        ) : null}

        {!isPending && !isError ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-1.5 rounded-xl border border-border/70 bg-card p-1.5 sm:mt-6 sm:gap-2 sm:p-2">
              {metrics.map((metric) => {
                const selected = metric.key === activeMetric;
                return (
                  <Button
                    key={metric.key}
                    type="button"
                    variant={selected ? "default" : "ghost"}
                    size="sm"
                    className="h-12 min-w-0 gap-1.5 rounded-lg px-1.5 text-xs sm:h-11 sm:gap-2 sm:px-3 sm:text-sm"
                    onClick={() => setActiveMetric(metric.key)}
                    aria-pressed={selected}
                  >
                    <metric.Icon className="size-4 shrink-0" />
                    <span className="truncate sm:hidden">{metric.shortLabel}</span>
                    <span className="hidden sm:inline">{metric.label}</span>
                  </Button>
                );
              })}
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm sm:mt-5">
              <div className="flex min-h-14 items-center justify-between gap-3 border-b border-border/70 px-3.5 py-3 sm:px-5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <active.Icon className="size-4 shrink-0 text-primary" />
                  <h2 className="truncate text-sm font-semibold sm:text-base">{active.label}</h2>
                </div>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{ranked.length} {ranked.length === 1 ? "państwo" : "państw"}</span>
              </div>

              {myRank > 0 ? (
                <div className="flex items-center justify-between gap-3 border-b border-primary/20 bg-primary/[0.055] px-3.5 py-2.5 text-xs sm:px-5">
                  <span className="font-medium text-foreground">Twoje państwo</span>
                  <span className="font-semibold tabular-nums text-primary">Miejsce #{myRank}</span>
                </div>
              ) : null}

              {ranked.length > 0 ? (
                <div className="divide-y divide-border/60">
                  {ranked.map((country, index) => {
                    const isMine = country.country_id === me?.countryId;
                    return (
                      <div
                        key={country.country_id}
                        className={`grid min-h-[3.75rem] grid-cols-[1.5rem_2rem_minmax(0,1fr)_auto] items-center gap-2.5 px-3.5 py-2.5 sm:min-h-16 sm:grid-cols-[2rem_2.25rem_minmax(0,1fr)_auto] sm:gap-3 sm:px-5 ${isMine ? "bg-primary/[0.045]" : "hover:bg-secondary/30"}`}
                      >
                        <span className={`text-center text-xs font-semibold tabular-nums ${index < 3 ? "text-primary" : "text-muted-foreground"}`}>{index + 1}</span>
                        <CountryFlag flag={country.flag} alt="" className="h-5 w-8 shrink-0 rounded-sm text-lg sm:h-6 sm:w-9" />
                        <span className="min-w-0 truncate text-[13px] font-medium sm:text-sm">{country.name}</span>
                        <span className="max-w-[42vw] truncate text-right text-xs font-semibold tabular-nums text-foreground sm:max-w-none sm:text-sm">{active.value(country)}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="px-5 py-12 text-center">
                  <p className="text-sm font-medium">Nie znaleziono państw</p>
                  <p className="mt-1 text-xs text-muted-foreground">Zmień frazę wyszukiwania i spróbuj ponownie.</p>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
