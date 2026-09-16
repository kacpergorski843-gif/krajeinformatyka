import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Panel, SectionTitle, Stat } from "@/components/stat";
import { countriesQuery, meQuery, regionsQuery } from "@/lib/api";
import { BUILDING_LABELS, kr, krShort, units } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/swiat/$id")({
  head: () => ({
    meta: [
      { title: "Dane państwa — COUNTRY RP" },
      { name: "description", content: "Szczegółowy podgląd gospodarki, wojska, surowców i regionów państwa." },
      { property: "og:title", content: "Dane państwa — COUNTRY RP" },
      { property: "og:description", content: "Szczegółowy podgląd gospodarki, wojska, surowców i regionów państwa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CountryDetail,
});

function CountryDetail() {
  const { id } = Route.useParams();
  const { data: me } = useQuery(meQuery);
  const { data: countries } = useQuery(countriesQuery);
  const { data: regions } = useQuery(regionsQuery(id));
  const c = countries?.find((x) => x.country_id === id);

  if (!c) {
    return (
      <AppShell me={me ?? null} title="Państwo">
        <Panel>
          <p className="text-muted-foreground text-sm">Wczytywanie danych państwa…</p>
        </Panel>
      </AppShell>
    );
  }

  const own = c.country_id === me?.countryId;

  return (
    <AppShell
      me={me ?? null}
      title={`${c.flag} ${c.name}`}
      subtitle={own ? "Twoje państwo" : "Podgląd — tylko do odczytu"}
    >
      <Link to="/swiat" className="text-primary mb-4 inline-block text-xs">
        ← Wróć do listy państw
      </Link>
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(regions ?? []).map((r) => (
          <Panel key={r.id}>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <p className="truncate text-sm font-semibold">{r.name}</p>
              <span className="text-muted-foreground shrink-0 text-xs">{r.slots.length}/9</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              {Array.from({ length: 9 }, (_, i) => i + 1).map((idx) => {
                const slot = r.slots.find((s) => s.slot_index === idx);
                return (
                  <div
                    key={idx}
                    className={`flex h-12 items-center justify-center rounded border p-1 text-center text-[9px] leading-tight ${
                      slot
                        ? "border-primary/40 bg-primary/10"
                        : "border-border/60 text-muted-foreground border-dashed"
                    }`}
                  >
                    {slot ? BUILDING_LABELS[slot.building] : "wolny"}
                  </div>
                );
              })}
            </div>
          </Panel>
        ))}
      </div>
    </AppShell>
  );
}
