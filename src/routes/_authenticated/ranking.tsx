import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useMemo, useState } from "react";
import { Coins, Search, Shield, Vote } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CountryFlag } from "@/components/CountryFlag";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Panel } from "@/components/stat";
import { Input } from "@/components/ui/input";
import { countriesQuery, meQuery } from "@/lib/api";
import type { CountryStats } from "@/lib/api";
import { fmtKR, units } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/ranking")({
  head: () => ({ meta: [
    { title: "Ranking państw — Kraje Informatyka" },
    { name: "description", content: "Ranking państw: produkcja KR, głosy wojenne i wartość militarna." },
    { property: "og:title", content: "Ranking państw — Kraje Informatyka" },
    { property: "og:description", content: "Zarobki dobowe i wartość militarna wszystkich państw." },
  ]}),
  component: Ranking,
});

const rankingMetrics = (c: CountryStats) => [
  { label: "Produkcja KR", value: fmtKR(c.gross_income), Icon: Coins },
  { label: "Głosy", value: units(c.war_votes), Icon: Vote },
  { label: "Wartość militarna", value: fmtKR(c.military_value), Icon: Shield },
] as const;

function Ranking() {
  const { data: me, isPending: mePending } = useQuery(meQuery);
  const { data: countries, isPending, isError, error } = useQuery(countriesQuery);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const fullList = useMemo(() => [...(countries ?? [])].sort((a, b) => Number(b.gross_income) - Number(a.gross_income)), [countries]);
  const list = useMemo(() => { const query = deferredSearch.trim().toLocaleLowerCase("pl-PL"); return fullList.filter((country) => !query || country.name.toLocaleLowerCase("pl-PL").includes(query)); }, [fullList, deferredSearch]);
  const myRank = me?.countryId ? fullList.findIndex((country) => country.country_id === me.countryId) + 1 : 0;
  return <AppShell me={me ?? null} title="Ranking" subtitle="Produkcja KR, głosy i wartość militarna">
    <div className="relative"><Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Szukaj państwa…" aria-label="Szukaj państwa w rankingu" className="pl-9" /></div>
    {!isPending && !isError && me?.countryId && myRank > 0 ? <Panel className="mt-4 border-primary/30 bg-primary/[0.06] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="label-hud">TWOJA POZYCJA</p><p className="mt-1 text-sm text-muted-foreground">{"Ranking sortowany według produkcji KR; pozostałe wartości są pokazane osobno"}</p></div><div className="flex items-center gap-3"><span className="font-display text-2xl font-bold text-primary">#{myRank}</span><span className="text-xs text-muted-foreground">z {fullList.length}</span></div></div></Panel> : null}
    {isPending || mePending ? <div className="mt-4"><PageSkeleton rows={5} cards={3} /></div> : null}
    {isError ? <Panel className="mt-4 border-destructive/40 bg-destructive/5 p-5"><p className="font-semibold text-destructive">Nie udało się wczytać rankingu</p><p className="mt-1 text-sm text-muted-foreground">{error instanceof Error ? error.message : "Spróbuj ponownie za chwilę."}</p></Panel> : null}
    {!isPending && !isError ? list.length === 0 ? <Panel className="mt-4 p-8 text-center"><p className="font-semibold">Nie znaleziono państwa</p><p className="mt-1 text-sm text-muted-foreground">Zmień frazę wyszukiwania.</p></Panel> : <><div className="mt-4 grid gap-3 sm:grid-cols-3">{list.slice(0,3).map((c) => { const rank = fullList.findIndex((row) => row.country_id === c.country_id)+1; return <Panel key={c.country_id} className={`hud-frame relative overflow-hidden ${c.country_id === me?.countryId ? "border-primary/60 bg-primary/[0.05]" : ""}`}><div className="flex items-start justify-between gap-3"><p className="text-primary font-display text-xs tracking-[0.24em] uppercase">RANK {String(rank).padStart(2,"0")}</p>{c.country_id === me?.countryId ? <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">Twoje</span> : null}</div><div className="mt-3 flex items-center gap-3"><CountryFlag flag={c.flag} alt={`Flaga państwa ${c.name}`} className="h-8 w-12 shrink-0 rounded-sm text-2xl" /><p className="truncate text-base font-semibold">{c.name}</p></div><div className="mt-4 grid gap-2 sm:grid-cols-3">{rankingMetrics(c).map(({ label, value, Icon }) => <div key={label} className="rounded-sm border border-border/70 bg-secondary/30 px-2.5 py-2"><div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-muted-foreground"><Icon className="size-3" />{label}</div><p className="num mt-1 text-sm font-semibold text-primary">{value}</p></div>)}</div></Panel>; })}</div><Panel className="divide-border mt-3 divide-y p-0">{list.slice(3).map((c) => { const rank = fullList.findIndex((row) => row.country_id === c.country_id)+1; return <div key={c.country_id} className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 transition-colors hover:bg-secondary/40 ${c.country_id === me?.countryId ? "bg-secondary/60" : ""}`}><span className="num text-inactive w-7 shrink-0 text-sm">{rank}</span><span className="flex min-w-0 items-center gap-3"><CountryFlag flag={c.flag} alt="" className="h-6 w-9 shrink-0 rounded-sm text-lg" /><span className="min-w-0"><span className="block truncate text-sm font-semibold">{c.name}{c.country_id === me?.countryId ? <span className="ml-2 text-[9px] uppercase text-primary">Twoje</span> : null}</span><span className="text-inactive text-[11px] uppercase">Produkcja KR · głosy · wartość militarna</span></span></span><span className="grid grid-cols-3 gap-2 text-right"><span><span className="block text-[9px] text-muted-foreground">KR</span><span className="num text-primary text-xs">{fmtKR(c.gross_income)}</span></span><span><span className="block text-[9px] text-muted-foreground">Głosy</span><span className="num text-primary text-xs">{units(c.war_votes)}</span></span><span><span className="block text-[9px] text-muted-foreground">Mil.</span><span className="num text-primary text-xs">{fmtKR(c.military_value)}</span></span></span></div>; })}</Panel></> : null}
  </AppShell>;
}
