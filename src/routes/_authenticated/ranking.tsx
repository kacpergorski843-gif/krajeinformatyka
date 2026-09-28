import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useMemo, useState } from "react";
import { Coins, Search, Vote } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CountryFlag } from "@/components/CountryFlag";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Panel } from "@/components/stat";
import { Input } from "@/components/ui/input";
import { countriesQuery, meQuery } from "@/lib/api";
import type { CountryStats } from "@/lib/api";
import { fmtKR, units } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/ranking")({
  head: () => ({ meta: [{ title: "Ranking państw — Nation Dynamics" }, { name: "description", content: "Ranking państw: największe zarobki dobowe i potencjał głosów wojennych." }, { property: "og:title", content: "Ranking państw — Nation Dynamics" }, { property: "og:description", content: "Zarobki dobowe i potencjał głosów wojennych wszystkich państw." }] }),
  component: Ranking,
});

type Mode = "income" | "votes";
const value = (c: CountryStats, mode: Mode) => mode === "income" ? fmtKR(c.gross_income) : `${units(c.vote_potential)} gł.`;
const hint = (c: CountryStats, mode: Mode) => mode === "income" ? `Regiony: ${c.regions_count}` : `Żołnierze ${units(c.soldier_packs * 500000)} · Czołgi ${units(c.tank_packs * 50)}`;

function Ranking() {
  const { data: me, isPending: mePending } = useQuery(meQuery);
  const { data: countries, isPending, isError, error } = useQuery(countriesQuery);
  const [mode, setMode] = useState<Mode>("income");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const fullList = useMemo(() => [...(countries ?? [])].sort((a, b) => mode === "income" ? Number(b.gross_income) - Number(a.gross_income) : b.vote_potential - a.vote_potential), [countries, mode]);
  const list = useMemo(() => {
    const query = deferredSearch.trim().toLocaleLowerCase("pl-PL");
    return fullList.filter((country) => !query || country.name.toLocaleLowerCase("pl-PL").includes(query));
  }, [fullList, deferredSearch]);
  const myRank = me?.countryId ? fullList.findIndex((country) => country.country_id === me.countryId) + 1 : 0;

  return (
    <AppShell me={me ?? null} title="Ranking" subtitle="Zarobki dobowe i potencjał głosów wojennych">
      <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
        <div className="relative"><Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Szukaj państwa…" aria-label="Szukaj państwa w rankingu" className="pl-9" /></div>
        <div className="grid grid-cols-2 gap-2">{([["income", "Największe zarobki", Coins], ["votes", "Potencjał głosów", Vote]] as const).map(([key, label, Icon]) => <button key={key} type="button" onClick={() => setMode(key)} className={`flex min-w-[150px] items-center justify-center gap-2 rounded-sm border px-3 py-2.5 text-xs tracking-[0.12em] uppercase transition-colors ${mode === key ? "border-primary/70 bg-secondary text-primary" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"}`} aria-pressed={mode === key}><Icon className="size-4 shrink-0" strokeWidth={1.5} /><span className="truncate">{label}</span></button>)}</div>
      </div>
      {!isPending && !isError && me?.countryId && myRank > 0 ? <Panel className="mt-4 border-primary/30 bg-primary/[0.06] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="label-hud">TWOJA POZYCJA</p><p className="mt-1 text-sm text-muted-foreground">{mode === "income" ? "Według przychodu dobowego" : "Według potencjału głosów"}</p></div><div className="flex items-center gap-3"><span className="font-display text-2xl font-bold text-primary">#{myRank}</span><span className="text-xs text-muted-foreground">z {fullList.length}</span></div></div></Panel> : null}
      {isPending || mePending ? <div className="mt-4"><PageSkeleton rows={5} cards={3} /></div> : null}
      {isError ? <Panel className="mt-4 border-destructive/40 bg-destructive/5 p-5"><p className="font-semibold text-destructive">Nie udało się wczytać rankingu</p><p className="mt-1 text-sm text-muted-foreground">{error instanceof Error ? error.message : "Spróbuj ponownie za chwilę."}</p></Panel> : null}
      {!isPending && !isError ? list.length === 0 ? <Panel className="mt-4 p-8 text-center"><p className="font-semibold">Nie znaleziono państwa</p><p className="mt-1 text-sm text-muted-foreground">Zmień frazę wyszukiwania.</p></Panel> : <> 
        <div className="mt-4 space-y-2">{list.map((country, index) => <Panel key={country.country_id} className="p-3 sm:p-4"><div className="flex items-center gap-3"><span className="w-7 shrink-0 text-center font-display text-sm text-muted-foreground">#{index + 1}</span><CountryFlag countryCode={country.code} countryName={country.name} className="size-7 shrink-0" /><div className="min-w-0 flex-1"><p className="truncate font-semibold">{country.name}</p><p className="truncate text-xs text-muted-foreground">{hint(country, mode)}</p></div><div className="shrink-0 text-right"><p className="font-display font-semibold">{value(country, mode)}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{mode === "income" ? "dobowo" : "potencjał"}</p></div></div></Panel>)}</div>
      </> : null}
    </AppShell>
  );
}
