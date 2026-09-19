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
    <AppShell me={me} title={country.name} subtitle="Centrum zarządzania">
      <div className="state-screen">
        <header className="state-masthead">
          <div className="state-identity"><div className="state-emblem"><Landmark className="size-6" /></div><div><p className="label-hud">NATION COMMAND / {country.name.toUpperCase()}</p><h1>Centrum zarządzania państwem</h1><p>Decyzje, zasoby i bezpieczeństwo w jednym miejscu.</p></div></div>
          <div className="state-clock"><Timer className="size-4" /><div><span>Następne rozliczenie</span><strong>{countdown}</strong></div></div>
        </header>
        <div className="state-layout">
          <main className="state-main">
            <section className="state-finance">
              <div className="state-finance-main"><p className="label-hud">TREASURY</p><strong>{kr(country.balance)}</strong><span>{fmtKR(country.balance)} dostępnych środków</span></div>
              <div className="state-finance-stat"><span>PRZYCHÓD / DOBA</span><strong>{fmtKR(country.gross_income)}</strong></div>
              <div className="state-finance-stat"><span>WARTOŚĆ ARMII</span><strong>{fmtKR(country.military_value)}</strong></div>
            </section>
            {economyBonus ? <section className="state-status state-status-positive"><div className="state-status-icon"><Activity className="size-4" /></div><div><span>EKONOMIA WZMOCNIONA</span><strong>+{economyBonus.percent}% do zarobków</strong><small>Aktywne do {new Date(economyBonus.ends_at).toLocaleString("pl-PL")}</small></div></section> : null}
            {shortage ? <section className="state-status state-status-warning"><div className="state-status-icon"><Flame className="size-4" /></div><div><span>ALERT OPERACYJNY</span><strong>Zapasy węgla są niewystarczające</strong><small>Uzupełnij zapasy, aby uniknąć problemów z fabrykami.</small></div><Link to="/sklep" className="state-status-action">Rynek <ArrowUpRight className="size-4" /></Link></section> : null}
            <section className="state-module"><div className="state-module-head"><div><p className="label-hud">01 / ECONOMY</p><h2>Zasoby strategiczne</h2></div><Link to="/sklep" className="state-link">Otwórz rynek <ArrowUpRight className="size-3.5" /></Link></div>
              <div className="state-resource-list">{resources.map((resource) => { const Icon=resource.icon; return <div key={resource.key} className="state-resource"><div className="state-resource-top"><Icon className="size-4 text-primary" /><span>{resource.label}</span></div><strong>{units(resource.value)}</strong><small><b>+{units(resource.prod)}</b> / doba</small></div>; })}</div>
            </section>
            <section className="state-module"><div className="state-module-head"><div><p className="label-hud">02 / DEFENSE</p><h2>Siły państwa</h2></div><Link to="/arsenal" className="state-link">Otwórz arsenał <ArrowUpRight className="size-3.5" /></Link></div>
              <div className="state-force-list">{military.map((force) => { const Icon=force.icon; return <div key={force.label}><Icon className="size-4 text-primary" /><span>{force.label}</span><strong>{units(force.value)}</strong></div>; })}</div>
            </section>
            <section className="state-module"><div className="state-module-head"><div><p className="label-hud">03 / ACTIVITY</p><h2>Ostatnie operacje</h2></div></div><OperationsHistory rows={(history ?? []) as unknown as TxRow[]} /></section>
          </main>
          <aside className="state-side">
            <section className="state-side-card state-territory-card"><div className="state-side-head"><span>TERYTORIUM</span><Link to="/regiony"><ArrowUpRight className="size-4" /></Link></div><strong className="state-territory-number">{regions?.length ?? 0}</strong><p>kontrolowanych regionów</p><div className="state-territory-meter"><span style={{width: Math.min(100,(regions?.length ?? 0)*10)+"%"}} /></div><Link to="/regiony" className="state-side-action"><Map className="size-4" /> Zarządzaj regionami</Link></section>
            <section className="state-side-card"><div className="state-side-head"><span>SKRÓTY OPERACYJNE</span></div>
              <Link to="/sklep" className="state-action-row"><div><Coins className="size-4" /><span>Rozbuduj państwo</span></div><ArrowUpRight className="size-4" /></Link>
              <Link to="/transfer" className="state-action-row"><div><Droplet className="size-4" /><span>Wyślij zasoby</span></div><ArrowUpRight className="size-4" /></Link>
              <Link to="/arsenal" className="state-action-row"><div><Shield className="size-4" /><span>Sprawdź obronę</span></div><ArrowUpRight className="size-4" /></Link>
              <Link to="/swiat" className="state-action-row"><div><Map className="size-4" /><span>Przeglądaj świat</span></div><ArrowUpRight className="size-4" /></Link>
            </section>
            {recentOccupations.length > 0 ? <section className="state-side-card"><div className="state-side-head"><span>OSTATNIE ZMIANY TERYTORIALNE</span></div>{recentOccupations.map((event) => { const current=event.current_country_id===me.countryId; const otherId=current?event.previous_country_id:event.current_country_id; const other=countries?.find((item)=>item.country_id===otherId)?.name ?? "Nieznane państwo"; return <div key={event.id} className={current?"state-event state-event-positive":"state-event state-event-negative"}><span>{current?"PRZEJĘTY":"OKUPOWANY"}</span><strong>{event.region_name}</strong><small>{current?"Poprzedni: "+other:"Nowy właściciel: "+other}</small><time>{new Date(event.occupied_at).toLocaleString("pl-PL")}</time></div>; })}</section> : null}
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
