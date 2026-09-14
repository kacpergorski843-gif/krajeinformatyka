import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Coins, Flame, Droplet, CircleDot, Magnet, Atom, Map } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Panel, SectionTitle, Stat } from "@/components/stat";
import { countriesQuery, meQuery, regionsQuery, rpc, transactionsQuery } from "@/lib/api";
import { BUILDING_LABELS, dateTime, kr, krShort, units } from "@/lib/format";


export const Route = createFileRoute("/_authenticated/panstwo")({
  component: MyCountry,
});

function MyCountry() {
  const queryClient = useQueryClient();
  const { data: me } = useQuery(meQuery);

  const { data: countries } = useQuery(countriesQuery);
  const country = countries?.find((c) => c.country_id === me?.countryId);
  const { data: regions } = useQuery(regionsQuery(me?.countryId));
  const { data: history } = useQuery(transactionsQuery(me?.countryId ?? null, 15));

  if (!me) return null;

  const claimPanel = !me.mainAdminExists ? (
    <Panel className="mt-3">
      <p className="text-sm font-semibold">Gra nie ma jeszcze głównego administratora</p>
      <p className="text-muted-foreground mt-2 text-sm">
        Jeśli prowadzisz tę rozgrywkę, przejmij rolę głównego administratora — dostaniesz panel do
        zarządzania państwami, regionami, sklepem i uprawnieniami.
      </p>
      <button
        className="bg-primary text-primary-foreground mt-3 rounded-md px-4 py-2 text-sm font-semibold"
        onClick={async () => {
          try {
            await rpc("claim_main_admin", {});
            toast.success("Jesteś głównym administratorem");
            queryClient.invalidateQueries();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Nie udało się");
          }
        }}
      >
        Przejmij rolę głównego administratora
      </button>
    </Panel>
  ) : null;

  if (!country) {
    return (
      <AppShell me={me} title="Moje państwo">
        <Panel>
          <p className="text-sm font-semibold">Nie masz jeszcze przypisanego państwa</p>
          <p className="text-muted-foreground mt-2 text-sm">
            Poproś administratora gry o przypisanie państwa do Twojego konta. Do tego czasu możesz
            przeglądać <Link to="/swiat" className="text-primary">świat</Link> i{" "}
            <Link to="/ranking" className="text-primary">ranking</Link>.
          </p>
        </Panel>
        {claimPanel}
      </AppShell>
    );
  }


  const resources = [
    { key: "coal", label: "Węgiel", icon: Flame, value: country.coal, prod: country.coal_prod },
    { key: "oil", label: "Ropa", icon: Droplet, value: country.oil, prod: country.oil_prod },
    { key: "copper", label: "Miedź", icon: CircleDot, value: country.copper, prod: country.copper_prod },
    { key: "iron", label: "Żelazo", icon: Magnet, value: country.iron, prod: country.iron_prod },
    { key: "uranium", label: "Uran", icon: Atom, value: country.uranium, prod: country.uranium_prod },
  ];

  const shortage = Number(country.coal_upkeep) > Number(country.coal) + Number(country.coal_prod);

  return (
    <AppShell me={me} title={`${country.flag} ${country.name}`} subtitle="Pulpit rządowy">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Skarbiec" value={kr(country.balance)} tone="primary" icon={<Coins className="size-4" />} />
        <Stat
          label="Przychód dobowy"
          value={kr(country.gross_income)}
          hint={krShort(country.gross_income)}
          tone="accent"
        />
        <Stat
          label="Zużycie węgla / doba"
          value={units(country.coal_upkeep)}
          hint={shortage ? "Uwaga: brak węgla wstrzyma fabryki IV/V" : "Zapas wystarczający"}
        />
      </div>

      <SectionTitle>Surowce</SectionTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {resources.map((r) => (
          <Stat
            key={r.key}
            label={r.label}
            value={units(r.value)}
            hint={`+${units(r.prod)} / doba`}
            icon={<r.icon className="size-4" />}
          />
        ))}
      </div>

      <SectionTitle>Wojsko i obrona</SectionTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="OPL" value={units(country.aa_defense)} />
        <Stat label="Rakiety I" value={units(country.missile_1)} />
        <Stat label="Rakiety II" value={units(country.missile_2)} />
        <Stat label="Rakiety III" value={units(country.missile_3)} />
        <Stat
          label="Żołnierze"
          value={units(country.soldier_packs * 500000)}
          hint={`${country.soldier_packs}/6 pakietów`}
        />
        <Stat
          label="Czołgi"
          value={units(country.tank_packs * 50)}
          hint={`${country.tank_packs}/4 pakiety`}
        />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Stat label="Głosy wojenne" value={units(country.war_votes)} tone="accent" />
        <Stat label="Wartość militarna" value={krShort(country.military_value)} />
      </div>

      <SectionTitle
        action={
          <Link to="/regiony" className="text-primary shrink-0 text-xs">
            Zarządzaj
          </Link>
        }
      >
        Regiony ({regions?.length ?? 0})
      </SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(regions ?? []).map((r) => (
          <Panel key={r.id}>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <p className="truncate text-sm font-semibold">{r.name}</p>
              <span className="text-muted-foreground shrink-0 text-xs">
                {r.slots.length}/9 slotów
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              {Array.from({ length: 9 }, (_, i) => i + 1).map((idx) => {
                const slot = r.slots.find((s) => s.slot_index === idx);
                return (
                  <div
                    key={idx}
                    className={`flex h-12 items-center justify-center rounded border p-1 text-center text-[9px] leading-tight ${
                      slot
                        ? "border-primary/40 bg-primary/10 text-foreground"
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
        {regions && regions.length === 0 ? (
          <Panel className="sm:col-span-2 lg:col-span-3">
            <p className="text-muted-foreground text-sm">
              Twoje państwo nie ma jeszcze regionów. Administrator może je dodać w panelu.
            </p>
          </Panel>
        ) : null}
      </div>

      <SectionTitle>Ostatnie operacje</SectionTitle>
      <Panel className="divide-border divide-y p-0">
        {((history ?? []) as unknown as { id: string; label: string; amount_kr: string; created_at: string }[]).map(
          (t) => (
            <div key={t.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm">{t.label}</p>
                <p className="text-muted-foreground text-xs">{dateTime(t.created_at)}</p>
              </div>
              <p
                className={`num shrink-0 text-sm ${
                  Number(t.amount_kr) > 0
                    ? "text-primary"
                    : Number(t.amount_kr) < 0
                      ? "text-destructive"
                      : "text-muted-foreground"
                }`}
              >
                {Number(t.amount_kr) > 0 ? "+" : ""}
                {krShort(t.amount_kr)}
              </p>
            </div>
          ),
        )}
        {history && history.length === 0 ? (
          <p className="text-muted-foreground p-3 text-sm">Brak operacji.</p>
        ) : null}
      </Panel>
      <div className="text-muted-foreground mt-3 flex items-center gap-2 text-xs">
        <Map className="size-3.5" /> Cykl dobowy rozliczany codziennie o 20:00.
      </div>
    </AppShell>
  );
}
