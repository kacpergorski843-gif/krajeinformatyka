import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Activity, ArrowUpRight, Atom, CircleDot, Coins, Droplet, Flame, Landmark,
  Map, Magnet, Rocket, Shield, Timer, Users,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Panel } from "@/components/stat";
import { OperationsHistory, type TxRow } from "@/components/OperationsHistory";
import {
  countriesQuery, economyBonusQuery, meQuery, regionsQuery,
  regionOccupationsQuery, rpc, transactionsQuery,
} from "@/lib/api";
import { fmtKR, kr, timeToDailyCycle, units } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/panstwo")({
  head: () => ({
    meta: [
      { title: "Moje państwo — COUNTRY RP" },
      { name: "description", content: "Centrum dowodzenia państwem: finanse, gospodarka, obrona i terytorium." },
      { property: "og:title", content: "Moje państwo — COUNTRY RP" },
      { property: "og:description", content: "Centrum dowodzenia państwem: finanse, gospodarka, obrona i terytorium." },
    ],
  }),
  component: MyCountry,
});

function MyCountry() {
  const queryClient = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const { data: countries } = useQuery(countriesQuery);
  const country = countries?.find((item) => item.country_id === me?.countryId);
  const { data: economyBonus } = useQuery(economyBonusQuery);
  const { data: regions } = useQuery(regionsQuery(me?.countryId));
  const { data: history } = useQuery(transactionsQuery(me?.countryId ?? null, 200));
  const { data: occupationHistory } = useQuery(regionOccupationsQuery(me?.countryId));
  const [countdown, setCountdown] = useState(() => timeToDailyCycle());

  useEffect(() => {
    const timer = setInterval(() => setCountdown(timeToDailyCycle()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!me) return null;

  const claimPanel = !me.mainAdminExists ? (
    <Panel className="command-claim mt-5">
      <div>
        <p className="label-hud">FIRST ADMIN</p>
        <h3 className="mt-1 text-base font-semibold">Rozgrywka nie ma jeszcze głównego administratora</h3>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Jeśli prowadzisz tę rozgrywkę, przejmij rolę głównego administratora. Otrzymasz dostęp do
          zarządzania państwami, regionami, sklepem i uprawnieniami.
        </p>
      </div>
      <button
        className="mt-4 shrink-0 rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
        onClick={async () => {
          try {
            await rpc("claim_main_admin", {});
            toast.success("Jesteś głównym administratorem");
            queryClient.invalidateQueries();
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Nie udało się");
          }
        }}
      >
        Przejmij rolę administratora
      </button>
    </Panel>
  ) : null;

  if (!country) {
    return (
      <AppShell me={me} title="Moje państwo" subtitle="Centrum dowodzenia">
        <Panel className="empty-state-command">
          <div className="empty-state-icon"><Landmark className="size-5" /></div>
          <p className="label-hud">PAŃSTWO NIEPRZYPISANE</p>
          <h2 className="mt-1 text-xl font-semibold">Nie masz jeszcze przypisanego państwa</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Poproś administratora gry o przypisanie państwa do Twojego konta. Do tego czasu możesz
            przeglądać <Link to="/swiat" className="text-primary">świat</Link> i{" "}
            <Link to="/ranking" className="text-primary">ranking</Link>.
          </p>
          {claimPanel}
        </Panel>
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

  const military = [
    { label: "Żołnierze", value: country.soldier_packs * 500000, icon: Users },
    { label: "Czołgi", value: country.tank_packs * 50, icon: Shield },
    { label: "OPL", value: country.region_aa_total, icon: Shield },
    { label: "Rakiety I", value: country.missile_1, icon: Rocket },
    { label: "Rakiety II", value: country.missile_2, icon: Rocket },
    { label: "Rakiety III", value: country.missile_3, icon: Rocket },
  ];

  const shortage = Number(country.coal_upkeep) > Number(country.coal) + Number(country.coal_prod);
  const topRegions = (regions ?? []).slice(0, 5);
  const recentOccupations = occupationHistory?.slice(0, 3) ?? [];

  return (
    <AppShell me={me} title={country.name} subtitle="Centrum dowodzenia">
      <section className="command-hero">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="command-pulse" />
            <p className="label-hud">COMMAND CENTER / ONLINE</p>
          </div>
          <h2 className="command-hero-title">Centrum operacyjne państwa</h2>
          <p className="command-hero-copy">
            Najważniejsze informacje o gospodarce, zasobach, armii i terytorium — gotowe do działania.
          </p>
        </div>
        <div className="command-hero-cycle">
          <Timer className="size-4 text-primary" />
          <div><span>ROZLICZENIE DOBOWE</span><strong>{countdown}</strong></div>
        </div>
      </section>

      {economyBonus ? (
        <section className="command-alert command-alert-positive">
          <div>
            <p className="label-hud">AKTYWNY BONUS EKONOMICZNY</p>
            <strong>+{economyBonus.percent}% do zarobków</strong>
            <p>Aktywny do {new Date(economyBonus.ends_at).toLocaleString("pl-PL")}</p>
          </div>
          <Activity className="size-5 shrink-0 text-primary" />
        </section>
      ) : null}

      {shortage ? (
        <section className="command-alert command-alert-warning">
          <div>
            <p className="label-hud">WYMAGA UWAGI</p>
            <strong>Zapasy węgla są niewystarczające</strong>
            <p>Brak węgla może zatrzymać fabryki IV/V.</p>
          </div>
          <Link to="/sklep" className="command-inline-action">Przejdź do rynku <ArrowUpRight className="size-3.5" /></Link>
        </section>
      ) : null}

      <section className="command-kpi-grid" aria-label="Najważniejsze wskaźniki">
        <div className="command-kpi command-kpi-primary"><div className="command-kpi-icon"><Coins className="size-4" /></div><span>SKARB PAŃSTWA</span><strong>{kr(country.balance)}</strong><small>{fmtKR(country.balance)}</small></div>
        <div className="command-kpi"><div className="command-kpi-icon"><Activity className="size-4" /></div><span>PRZYCHÓD / DOBA</span><strong>{fmtKR(country.gross_income)}</strong><small>dochód brutto</small></div>
        <div className="command-kpi"><div className="command-kpi-icon"><Map className="size-4" /></div><span>TERYTORIUM</span><strong>{regions?.length ?? 0}</strong><small>kontrolowanych regionów</small></div>
        <div className="command-kpi"><div className="command-kpi-icon"><Rocket className="size-4" /></div><span>WARTOŚĆ MILITARNA</span><strong>{fmtKR(country.military_value)}</strong><small>{units(country.vote_potential)} potencjału głosów</small></div>
      </section>

      <div className="command-main-grid">
        <div className="space-y-5">
          <section>
            <div className="command-section-header"><div><p className="label-hud">ECONOMY / RESOURCES</p><h2>Gospodarka i zasoby</h2></div><Link to="/sklep" className="command-inline-action">Rynek <ArrowUpRight className="size-3.5" /></Link></div>
            <Panel className="command-resource-panel p-0">
              <div className="command-resource-grid">
                {resources.map((resource) => {
                  const zero = Number(resource.value) === 0;
                  const Icon = resource.icon;
                  return <div key={resource.key} className="command-resource-card"><div className="flex items-center justify-between gap-2"><div className="command-resource-icon"><Icon className="size-4" /></div><span className={Number(resource.prod) > 0 ? "text-success" : "text-inactive"}>+{units(resource.prod)}</span></div><p>{resource.label}</p><strong className={zero ? "text-inactive" : ""}>{units(resource.value)}</strong><small>produkcja / doba</small></div>;
                })}
              </div>
              <div className="command-resource-footer"><span>Zużycie węgla / doba</span><strong>{units(country.coal_upkeep)}</strong><span className={shortage ? "text-destructive" : "text-success"}>{shortage ? "NIEWYSTARCZAJĄCE ZAPASY" : "ZAPAS W NORMIE"}</span></div>
            </Panel>
          </section>

          <section>
            <div className="command-section-header"><div><p className="label-hud">DEFENSE / FORCE</p><h2>Wojsko i obrona</h2></div><Link to="/arsenal" className="command-inline-action">Arsenał <ArrowUpRight className="size-3.5" /></Link></div>
            <Panel className="command-military-panel p-0">
              <div className="command-military-grid">
                {military.map((item) => { const Icon = item.icon; return <div key={item.label}><Icon className="size-4 text-primary" strokeWidth={1.7} /><span>{item.label}</span><strong className={item.value === 0 ? "text-inactive" : ""}>{units(item.value)}</strong></div>; })}
              </div>
              <div className="command-military-footer"><div><span>Głosy fortyfikacji</span><strong>{units(country.fort_votes)}</strong></div><div><span>Wartość militarna</span><strong>{fmtKR(country.military_value)}</strong></div></div>
            </Panel>
          </section>
        </div>

        <aside className="space-y-5">
          <section>
            <div className="command-section-header"><div><p className="label-hud">TERRITORY / CONTROL</p><h2>Twoje regiony</h2></div><Link to="/regiony" className="command-inline-action">Zarządzaj <ArrowUpRight className="size-3.5" /></Link></div>
            <Panel className="command-regions-panel p-0">
              {topRegions.map((region) => <Link key={region.id} to="/regiony" className="command-region-row"><div className="min-w-0"><strong>{region.name}</strong><span>{region.slots.length} / 9 zajętych slotów</span></div><ArrowUpRight className="size-4 shrink-0 text-muted-foreground" /></Link>)}
              {topRegions.length === 0 ? <div className="p-5 text-sm text-muted-foreground">Brak przypisanych regionów.</div> : null}
              {regions && regions.length > 5 ? <Link to="/regiony" className="command-region-more">Pokaż wszystkie {regions.length} regionów</Link> : null}
            </Panel>
          </section>

          {recentOccupations.length > 0 ? (
            <section>
              <div className="command-section-header"><div><p className="label-hud">RECENT EVENTS</p><h2>Zmiany terytorialne</h2></div></div>
              <div className="space-y-2">
                {recentOccupations.map((occupation) => {
                  const isCurrent = occupation.current_country_id === me.countryId;
                  const otherCountryId = isCurrent ? occupation.previous_country_id : occupation.current_country_id;
                  const otherCountry = countries?.find((item) => item.country_id === otherCountryId)?.name ?? "Nieznane państwo";
                  return <Panel key={occupation.id} className={isCurrent ? "command-event command-event-positive" : "command-event command-event-negative"}><p className="label-hud">{isCurrent ? "REGION PRZEJĘTY" : "REGION OKUPOWANY"}</p><strong>{occupation.region_name}</strong><span>{isCurrent ? "Poprzedni właściciel: " + otherCountry : "Nowy właściciel: " + otherCountry}</span><small>{new Date(occupation.occupied_at).toLocaleString("pl-PL")}</small></Panel>;
                })}
              </div>
            </section>
          ) : null}
        </aside>
      </div>

      <section className="mt-7">
        <div className="command-section-header"><div><p className="label-hud">OPERATIONS / HISTORY</p><h2>Ostatnie operacje</h2></div></div>
        <OperationsHistory rows={(history ?? []) as unknown as TxRow[]} />
      </section>

      {claimPanel}
    </AppShell>
  );
}
