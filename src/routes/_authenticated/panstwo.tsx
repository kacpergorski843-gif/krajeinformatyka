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
import { fmtKR, timeToDailyCycle, units } from "@/lib/format";

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
      <div className="command-v3">
        <section className="command-v3-hero" data-tour="country-hero">
          <div className="command-v3-hero-main">
            <div className="command-v3-country-mark"><Landmark className="size-7" /></div>
            <div className="command-v3-copy">
              <div className="command-v3-eyebrow"><span>PAŃSTWO</span><i /> <span>AKTYWNE</span></div>
              <h1>{country.name}</h1>
              <p>Centrum dowodzenia państwem</p>
            </div>
          </div>
          <div className="command-v3-treasury">
            <span>SKARB PAŃSTWA</span>
            <strong>{fmtKR(country.balance)}</strong>
            <small>{fmtKR(country.balance)} dostępnych środków</small>
          </div>
          <div className="command-v3-cycle">
            <Timer className="size-4" />
            <div><span>KOLEJNY CYKL</span><strong>{countdown}</strong></div>
          </div>
        </section>

        <section className="command-v3-actions">
          <Link to="/sklep" className="command-v3-action command-v3-action-primary"><div><Coins className="size-5" /><span>Rozbuduj gospodarkę</span></div><ArrowUpRight className="size-4" /></Link>
          <Link to="/transfer" className="command-v3-action"><div><Droplet className="size-5" /><span>Transfer zasobów</span></div><ArrowUpRight className="size-4" /></Link>
          <Link to="/arsenal" className="command-v3-action"><div><Shield className="size-5" /><span>Centrum obrony</span></div><ArrowUpRight className="size-4" /></Link>
          <Link to="/regiony" className="command-v3-action"><div><Map className="size-5" /><span>Zarządzaj terytorium</span></div><ArrowUpRight className="size-4" /></Link>
        </section>

        {shortage || economyBonus ? (
          <section className="command-v3-notices">
            {shortage ? <div className="command-v3-notice command-v3-notice-warning"><Flame className="size-4" /><div><span>WYMAGA UWAGI</span><strong>Zapasy węgla nie pokrywają bieżącego utrzymania.</strong></div><Link to="/sklep">Uzupełnij →</Link></div> : null}
            {economyBonus ? <div className="command-v3-notice"><Activity className="size-4" /><div><span>BONUS EKONOMICZNY</span><strong>+{economyBonus.percent}% do zarobków</strong><small>Do {new Date(economyBonus.ends_at).toLocaleString("pl-PL")}</small></div></div> : null}
          </section>
        ) : null}

        <section className="command-v3-grid">
          <div className="command-v3-primary-column">
            <div className="command-v3-section-title"><div><span>GOSPODARKA</span><h2>Przepływ zasobów</h2></div><Link to="/sklep">RYNEK <ArrowUpRight className="size-3.5" /></Link></div>
            <div className="command-v3-economy" data-tour="economy">
              <div className="command-v3-economy-head"><div><span>DOCHÓD DZIENNY</span><strong>{fmtKR(country.gross_income)}</strong></div><div><span>WARTOŚĆ ARMII</span><strong>{fmtKR(country.military_value)}</strong></div></div>
              <div className="command-v3-resource-rows">
                {resources.map((resource) => {
                  const Icon = resource.icon;
                  const current = Number(resource.value);
                  const production = Number(resource.prod);
                  const upkeep = resource.key === "coal" ? Number(country.coal_upkeep) : 0;
                  const ratio = upkeep > 0 ? Math.min(100, (current / Math.max(1, upkeep)) * 100) : Math.min(100, production * 5);
                  return <div key={resource.key} className="command-v3-resource-row">
                    <div className="command-v3-resource-name"><span className="command-v3-resource-icon"><Icon className="size-4" /></span><div><strong>{resource.label}</strong><small>{production > 0 ? "+" + units(resource.prod) + " / doba" : "brak produkcji"}</small></div></div>
                    <div className="command-v3-resource-track"><span style={{width: ratio + "%"}} /></div>
                    <strong className="command-v3-resource-value">{units(resource.value)}</strong>
                  </div>;
                })}
              </div>
            </div>

            <div className="command-v3-section-title command-v3-section-spaced"><div><span>TERYTORIUM</span><h2>Stan kontroli</h2></div><Link to="/regiony">WSZYSTKIE REGIONY <ArrowUpRight className="size-3.5" /></Link></div>
            <div className="command-v3-territory">
              <div className="command-v3-territory-overview">
                <div className="command-v3-territory-count"><strong>{regions?.length ?? 0}</strong><span>regionów pod kontrolą</span></div>
                <div className="command-v3-territory-strip"><span style={{width: Math.min(100,(regions?.length ?? 0)*10) + "%"}} /></div>
                <small>Kontrola terytorialna państwa</small>
              </div>
              <div className="command-v3-region-list">
                {topRegions.length ? topRegions.map((region) => <div key={region.region_id} className="command-v3-region"><div><Map className="size-4" /><strong>{region.name}</strong></div><span>AKTYWNY</span></div>) : <div className="command-v3-region-empty">Brak przypisanych regionów.</div>}
              </div>
            </div>

            <div className="command-v3-section-title command-v3-section-spaced"><div><span>DZIENNIK</span><h2>Ostatnie operacje</h2></div></div>
            <div className="command-v3-history" data-tour="history"><OperationsHistory rows={(history ?? []) as unknown as TxRow[]} /></div>
          </div>

          <aside className="command-v3-rail">
            <div className="command-v3-section-title"><div><span>OBRONA</span><h2>Gotowość sił</h2></div><Link to="/arsenal"><ArrowUpRight className="size-3.5" /></Link></div>
            <div className="command-v3-readiness">
              <div className="command-v3-readiness-ring"><div><strong>{Math.min(99, Math.round((Number(country.tank_packs) + Number(country.soldier_packs) + Number(country.region_aa_total)) / Math.max(1, (regions?.length ?? 1))))}</strong><span>READY</span></div></div>
              <p>Potencjał operacyjny</p>
              <small>Stan aktywnych zasobów wojskowych</small>
            </div>
            <div className="command-v3-force-list">
              {military.map((force) => { const Icon=force.icon; return <div key={force.label}><span className="command-v3-force-icon"><Icon className="size-4" /></span><div><span>{force.label}</span><strong>{units(force.value)}</strong></div></div>; })}
            </div>

            {recentOccupations.length ? <div className="command-v3-rail-block"><div className="command-v3-rail-title">ZMIANY TERYTORIALNE</div>{recentOccupations.map((event) => { const current=event.current_country_id===me.countryId; const otherId=current?event.previous_country_id:event.current_country_id; const other=countries?.find((item)=>item.country_id===otherId)?.name ?? "Nieznane państwo"; return <div key={event.id} className={current?"command-v3-event command-v3-event-positive":"command-v3-event command-v3-event-negative"}><span>{current?"PRZEJĘTO REGION":"REGION OKUPOWANY"}</span><strong>{event.region_name}</strong><small>{current?"Poprzedni właściciel: "+other:"Nowy właściciel: "+other}</small></div>; })}</div> : null}
          </aside>
        </section>
      </div>
    </AppShell>
  );
}
