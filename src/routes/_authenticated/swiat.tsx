import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Panel } from "@/components/stat";
import { Input } from "@/components/ui/input";
import { meQuery, publicCountriesQuery, publicCountryQuery, regionsQuery } from "@/lib/api";
import { BUILDING_LABELS, kr, krShort, units } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/swiat")({
  head: () => ({
    meta: [
      { title: "Świat i państwa — COUNTRY RP" },
      {
        name: "description",
        content: "Przegląd państw, ich gospodarek, regionów i siły militarnej.",
      },
    ],
  }),
  component: World,
});

function World() {
  const { data: me } = useQuery(meQuery);
  const { data: countries } = useQuery(publicCountriesQuery);
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("country"),
  );

  const list = (countries ?? []).filter((country) =>
    country.name.toLowerCase().includes(q.toLowerCase()),
  );

  const selectedQuery = useQuery(publicCountryQuery(selectedId));
  const { data: regions, isError: regionsError, error: regionsErrorValue } = useQuery(
    regionsQuery(selectedId),
  );

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
        title={c ? c.flag + " " + c.name : "Państwo"}
        subtitle={c?.country_id === me?.countryId ? "Twoje państwo" : "Podgląd — tylko do odczytu"}
      >
        <button type="button" onClick={closeCountry} className="mb-4 text-xs text-primary hover:underline">
          ← Wróć do listy państw
        </button>

        {selectedQuery.isError ? (
          <Panel>
            <p className="text-sm text-destructive">
              Nie udało się wczytać państwa:{" "}
              {selectedQuery.error instanceof Error ? selectedQuery.error.message : "nieznany błąd"}.
            </p>
          </Panel>
        ) : !c ? (
          <Panel><p className="text-sm text-muted-foreground">Wczytywanie danych państwa…</p></Panel>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Skarbiec" value={kr(c.balance)} tone="primary" />
              <Stat label="Przychód dobowy" value={kr(c.gross_income)} tone="accent" />
              <Stat label="Głosy wojenne" value={units(c.war_votes)} />
              <Stat label="Wartość militarna" value={krShort(c.military_value)} />
            </div>

            <SectionTitle>Surowce</SectionTitle>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Stat label="Węgiel" value={units(c.coal)} hint={"+" + units(c.coal_prod) + " / doba"} />
              <Stat label="Ropa" value={units(c.oil)} hint={"+" + units(c.oil_prod) + " / doba"} />
              <Stat label="Miedź" value={units(c.copper)} hint={"+" + units(c.copper_prod) + " / doba"} />
              <Stat label="Żelazo" value={units(c.iron)} hint={"+" + units(c.iron_prod) + " / doba"} />
              <Stat label="Uran" value={units(c.uranium)} hint={"+" + units(c.uranium_prod) + " / doba"} />
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
              <Panel><p className="text-sm text-destructive">Nie udało się wczytać regionów: {regionsErrorValue instanceof Error ? regionsErrorValue.message : "nieznany błąd"}.</p></Panel>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(regions ?? []).map((r) => (
                <Panel key={r.id}>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                    <p className="truncate text-sm font-semibold">{r.name}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">{r.slots.length}/9</span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-1.5">
                    {Array.from({ length: 9 }, (_, i) => i + 1).map((idx) => {
                      const slot = r.slots.find((s) => s.slot_index === idx);
                      return (
                        <div
                          key={idx}
                          className={[
                            "flex h-12 items-center justify-center rounded border p-1 text-center text-[9px] leading-tight",
                            slot ? "border-primary/40 bg-primary/10" : "border-border/60 border-dashed text-muted-foreground",
                          ].join(" ")}
                        >
                          {slot ? BUILDING_LABELS[slot.building] : "wolny"}
                        </div>
                      );
                    })}
                  </div>
                </Panel>
              ))}
            </div>
          </>
        )}
      </AppShell>
    );
  }

  return (
    <AppShell
      me={me ?? null}
      title="Świat / Państwa"
      subtitle="Podglądasz dane wszystkich państw"
    >
      <Input
        placeholder="Szukaj państwa…"
        value={q}
        onChange={(event) => setQ(event.target.value)}
        className="mb-4"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((country) => (
          <button
            key={country.country_id}
            type="button"
            onClick={() => openCountry(country.country_id)}
            className="block w-full text-left"
          >
            <Panel className="h-full border-border/80 bg-card/80 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-xl">
              <div className="flex items-center gap-3">
                <span className="shrink-0 text-xl">{country.flag}</span>
                <p className="truncate text-base font-semibold">
                  {country.name}
                  {country.country_id === me?.countryId && (
                    <span className="ml-2 text-[10px] uppercase text-primary">Twoje</span>
                  )}
                </p>
              </div>
              <dl className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Skarbiec</dt><dd className="num">{krShort(country.balance)}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Przychód / doba</dt><dd className="num text-primary">{krShort(country.gross_income)}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Regiony</dt><dd className="num">{units(country.regions_count)}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Wartość militarna</dt><dd className="num text-accent">{krShort(country.military_value)}</dd></div>
              </dl>
            </Panel>
          </button>
        ))}
      </div>

      {list.length === 0 && <p className="text-sm text-muted-foreground">Brak wyników.</p>}
    </AppShell>
  );

}
