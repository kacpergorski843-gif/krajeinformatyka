import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { CountryFlag } from "@/components/CountryFlag";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Panel, SectionTitle, Stat } from "@/components/stat";
import { Input } from "@/components/ui/input";
import { meQuery, publicCountriesQuery, publicCountryQuery, regionsQuery } from "@/lib/api";
import { BUILDING_LABELS, kr, krShort, units } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/swiat")({
  head: () => ({
    meta: [
      { title: "Świat i państwa — COUNTRY RP" },
      { name: "description", content: "Przegląd państw, ich gospodarek, regionów i siły militarnej." },
    ],
  }),
  component: World,
});

function World() {
  const { data: me } = useQuery(meQuery);
  const { data: countries, isPending, isError, error } = useQuery(publicCountriesQuery);
  const [q, setQ] = useState("");
  const deferredQ = useDeferredValue(q);
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("country"),
  );

  const list = (countries ?? []).filter((country) =>
    country.name.toLocaleLowerCase("pl-PL").includes(deferredQ.trim().toLocaleLowerCase("pl-PL")),
  );
  const selectedQuery = useQuery(publicCountryQuery(selectedId));
  const { data: regions, isPending: regionsPending, isError: regionsError, error: regionsErrorValue } = useQuery(regionsQuery(selectedId));

  const openCountry = (countryId: string) => {
    setSelectedId(countryId);
    window.history.replaceState(null, "", "/swiat?country=" + encodeURIComponent(countryId));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const closeCountry = () => {
    setSelectedId(null);
    window.history.replaceState(null, "", "/swiat");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (selectedId) {
    const c = selectedQuery.data;
    return (
      <AppShell
        me={me ?? null}
        title={c ? c.name : "Państwo"}
        subtitle={c?.country_id === me?.countryId ? "Twoje państwo" : "Podgląd — tylko do odczytu"}
      >
        <button type="button" onClick={closeCountry} className="mb-4 inline-flex items-center gap-2 text-xs font-medium text-primary transition-colors hover:text-primary/80 hover:underline">
          ← Wróć do listy państw
        </button>

        {selectedQuery.isPending ? <PageSkeleton rows={6} cards={4} /> : null}
        {selectedQuery.isError ? (
          <Panel className="border-destructive/40 bg-destructive/5 p-5">
            <p className="font-semibold text-destructive">Nie udało się wczytać państwa</p>
            <p className="mt-1 text-sm text-muted-foreground">{selectedQuery.error instanceof Error ? selectedQuery.error.message : "Nieznany błąd."}</p>
          </Panel>
        ) : null}
        {c ? (
          <>
            <Panel className="hud-frame mb-5 overflow-hidden p-0">
              <div className="flex flex-wrap items-center gap-4 bg-secondary/20 p-5 sm:p-6">
                <CountryFlag flag={c.flag} alt={`Flaga państwa ${c.name}`} className="h-12 w-20 shrink-0 rounded-md text-4xl shadow-sm" />
                <div className="min-w-0 flex-1">
                  <p className="label-hud">NATIONAL PROFILE</p>
                  <h2 className="mt-1 truncate text-2xl font-semibold">{c.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{c.country_id === me?.countryId ? "To jest Twoje państwo." : "Dane publiczne — tryb tylko do odczytu."}</p>
                </div>
                {c.country_id === me?.countryId ? <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">Twoje państwo</span> : null}
              </div>
            </Panel>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Skarbiec" value={kr(c.balance)} tone="primary" />
              <Stat label="Przychód dobowy" value={kr(c.gross_income)} tone="accent" />
              <Stat label="Głosy wojenne" value={units(c.war_votes)} />
              <Stat label="Wartość militarna" value={krShort(c.military_value)} />
            </div>

            <SectionTitle>Surowce</SectionTitle>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Stat label="Węgiel" value={units(c.coal)} hint={`+${units(c.coal_prod)} / doba`} />
              <Stat label="Ropa" value={units(c.oil)} hint={`+${units(c.oil_prod)} / doba`} />
              <Stat label="Miedź" value={units(c.copper)} hint={`+${units(c.copper_prod)} / doba`} />
              <Stat label="Żelazo" value={units(c.iron)} hint={`+${units(c.iron_prod)} / doba`} />
              <Stat label="Uran" value={units(c.uranium)} hint={`+${units(c.uranium_prod)} / doba`} />
            </div>

            <SectionTitle>Wojsko</SectionTitle>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="OPL" value={units(c.aa_defense)} />
              <Stat label="Rakiety I" value={units(c.missile_1)} />
              <Stat label="Rakiety II" value={units(c.missile_2)} />
              <Stat label="Rakiety III" value={units(c.missile_3)} />
              <Stat label="Żołnierze" value={units(c.soldier_packs * 500000)} />
              <Stat label="Czołgi" value={units(c.tank_packs * 50)} />
            </div>

            <SectionTitle>Regiony ({regions?.length ?? 0})</SectionTitle>
            {regionsError ? (
              <Panel className="border-destructive/40 bg-destructive/5 p-4"><p className="text-sm text-destructive">Nie udało się wczytać regionów: {regionsErrorValue instanceof Error ? regionsErrorValue.message : "nieznany błąd"}.</p></Panel>
            ) : regionsPending ? (
              <PageSkeleton rows={3} cards={3} />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(regions ?? []).map((r) => (
                  <Panel key={r.id} className="transition-colors hover:border-primary/30">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                      <p className="truncate text-sm font-semibold">{r.name}</p>
                      <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{r.slots.length}/9</span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-1.5">
                      {Array.from({ length: 9 }, (_, i) => i + 1).map((idx) => {
                        const slot = r.slots.find((s) => s.slot_index === idx);
                        return (
                          <div key={idx} className={`flex h-12 items-center justify-center rounded border p-1 text-center text-[9px] leading-tight transition-colors ${slot ? "border-primary/40 bg-primary/10 text-foreground" : "border-border/60 border-dashed text-muted-foreground"}`}>
                            {slot ? BUILDING_LABELS[slot.building] : "wolny"}
                          </div>
                        );
                      })}
                    </div>
                  </Panel>
                ))}
              </div>
            )}
          </>
        ) : null}
      </AppShell>
    );
  }

  return (
    <AppShell me={me ?? null} title="Świat / Państwa" subtitle="Podglądasz dane wszystkich państw">
      <div className="relative mb-4">
        <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
        <Input placeholder="Szukaj państwa…" value={q} onChange={(event) => setQ(event.target.value)} aria-label="Szukaj państwa" className="pl-9" />
      </div>

      {isPending ? <PageSkeleton rows={3} cards={6} /> : null}
      {isError ? (
        <Panel className="border-destructive/40 bg-destructive/5 p-5">
          <p className="font-semibold text-destructive">Nie udało się wczytać państw</p>
          <p className="mt-1 text-sm text-muted-foreground">{error instanceof Error ? error.message : "Spróbuj ponownie za chwilę."}</p>
        </Panel>
      ) : null}

      {!isPending && !isError ? (
        <>
          <div className="mb-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>{list.length} {list.length === 1 ? "państwo" : "państw"}</span>
            {q ? <button type="button" onClick={() => setQ("")} className="text-primary hover:underline">Wyczyść wyszukiwanie</button> : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((country) => (
              <button key={country.country_id} type="button" onClick={() => openCountry(country.country_id)} className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                <Panel className={`h-full border-border/80 bg-card/80 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-xl ${country.country_id === me?.countryId ? "border-primary/50 bg-primary/[0.04]" : ""}`}>
                  <div className="flex items-center gap-3">
                    <CountryFlag flag={country.flag} alt={`Flaga państwa ${country.name}`} className="h-8 w-12 shrink-0 rounded-sm text-2xl" />
                    <p className="min-w-0 flex-1 truncate text-base font-semibold">{country.name}</p>
                    {country.country_id === me?.countryId ? <span className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[9px] font-semibold uppercase text-primary">Twoje</span> : null}
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div><dt className="text-muted-foreground">Skarbiec</dt><dd className="num mt-0.5">{krShort(country.balance)}</dd></div>
                    <div><dt className="text-muted-foreground">Przychód / doba</dt><dd className="num mt-0.5 text-primary">{krShort(country.gross_income)}</dd></div>
                    <div><dt className="text-muted-foreground">Regiony</dt><dd className="num mt-0.5">{units(country.regions_count)}</dd></div>
                    <div><dt className="text-muted-foreground">Wartość militarna</dt><dd className="num mt-0.5 text-accent">{krShort(country.military_value)}</dd></div>
                  </dl>
                  <div className="mt-4 border-t border-border/60 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">Otwórz profil państwa →</div>
                </Panel>
              </button>
            ))}
          </div>
          {list.length === 0 ? <Panel className="p-8 text-center"><p className="font-semibold">Brak wyników</p><p className="mt-1 text-sm text-muted-foreground">Nie znaleziono państwa pasującego do „{q}”.</p></Panel> : null}
        </>
      ) : null}
    </AppShell>
  );
}
