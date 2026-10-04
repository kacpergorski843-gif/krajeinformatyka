import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Coins, Flame, Droplet, CircleDot, Magnet, Atom, ChevronRight, Timer } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { rulerUploadCountryFlag } from "@/lib/admin.functions";
import { CountryFlag } from "@/components/CountryFlag";
import { Panel, SectionTitle, Stat } from "@/components/stat";
import { OperationsHistory, type TxRow } from "@/components/OperationsHistory";
import { countriesQuery, economyBonusQuery, meQuery, regionsQuery, regionOccupationsQuery, rpc, shopQuery, transactionsQuery } from "@/lib/api";
import { fmtKR, kr, timeToDailyCycle, units, RESOURCE_LABELS } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/panstwo")({
  head: () => ({
    meta: [
      { title: "Moje państwo — COUNTRY RP" },
      {
        name: "description",
        content: "Pulpit dowodzenia: skarbiec, przychód dobowy, surowce, wojsko i regiony.",
      },
      { property: "og:title", content: "Moje państwo — COUNTRY RP" },
      {
        property: "og:description",
        content: "Pulpit dowodzenia: skarbiec, przychód dobowy, surowce, wojsko i regiony.",
      },
    ],
  }),
  component: MyCountry,
});

function MyCountry() {
  const queryClient = useQueryClient();
  const { data: me } = useQuery(meQuery);

  const { data: countries } = useQuery(countriesQuery);
  const country = countries?.find((c) => c.country_id === me?.countryId);
  const { data: economyBonus } = useQuery(economyBonusQuery(me?.countryId));
  const { data: regions } = useQuery(regionsQuery(me?.countryId));
  const { data: history } = useQuery(transactionsQuery(me?.countryId ?? null, 20));
  const { data: occupationHistory } = useQuery(regionOccupationsQuery(me?.countryId));
  const occupiedByMe = [...(occupationHistory ?? []).reduce((map, occupation) => {
    if (!map.has(occupation.region_id)) map.set(occupation.region_id, occupation);
    return map;
  }, new Map<string, NonNullable<typeof occupationHistory>[number]>()).values()].filter(
    (occupation) => occupation.current_country_id === me?.countryId,
  );
  const [flagFile, setFlagFile] = useState<File | null>(null);
  const [flagSaving, setFlagSaving] = useState(false);

  if (!me) return null;

  const claimPanel = !me.mainAdminExists ? (
    <Panel className="hud-frame mt-3 p-4">
      <p className="text-sm font-semibold">Gra nie ma jeszcze głównego administratora</p>
      <p className="text-muted-foreground mt-2 text-sm">
        Jeśli prowadzisz tę rozgrywkę, przejmij rolę głównego administratora — dostaniesz panel do
        zarządzania państwami, regionami, sklepem i uprawnieniami.
      </p>
      <button
        className="bg-primary text-primary-foreground mt-3 rounded-sm px-4 py-2 text-sm font-semibold"
        onClick={async () => {
          try {
            await rpc("claim_main_admin", {});
            toast.success("Jesteś głównym administratorem");
            void queryClient.invalidateQueries({ queryKey: ["me"] });
            void queryClient.invalidateQueries({ queryKey: ["country_stats"] });
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
        <Panel className="p-4">
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
    {
      key: "copper",
      label: "Miedź",
      icon: CircleDot,
      value: country.copper,
      prod: country.copper_prod,
    },
    { key: "iron", label: "Żelazo", icon: Magnet, value: country.iron, prod: country.iron_prod },
    { key: "uranium", label: "Uran", icon: Atom, value: country.uranium, prod: country.uranium_prod },
  ];

  const shortage = Number(country.coal_upkeep) > Number(country.coal) + Number(country.coal_prod);

  const military = [
    { label: "OPL (regiony)", value: country.region_aa_total },
    { label: "Rakiety I", value: country.missile_1 },
    { label: "Rakiety II", value: country.missile_2 },
    { label: "Rakiety III", value: country.missile_3 },
    { label: "Żołnierze", value: country.soldier_packs * 500000 },
    { label: "Czołgi", value: country.tank_packs * 50 },
  ];

  return (
    <AppShell me={me} title={country.name} subtitle="Pulpit dowodzenia">
      <Panel className="mb-4 flex flex-wrap items-center gap-3 p-3">
        <CountryFlag
          flag={country.flag}
          alt={"Flaga państwa " + country.name}
          className="h-12 w-20 rounded-sm text-2xl"
        />
        <div className="min-w-0 flex-1">
          <p className="label-hud">PAŃSTWO</p>
          <p className="font-display text-lg font-semibold">{country.name}</p>
          <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-sm border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10">
            Zmień flagę
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="sr-only"
              disabled={flagSaving}
              onChange={async (event) => {
                const file = event.target.files?.[0] ?? null;
                event.target.value = "";
                if (!file) return;
                if (!file.type.startsWith("image/")) {
                  toast.error("Wybierz plik graficzny.");
                  return;
                }
                if (file.size > 5 * 1024 * 1024) {
                  toast.error("Flaga może mieć maksymalnie 5 MB.");
                  return;
                }

                setFlagFile(file);
                setFlagSaving(true);
                try {
                  const extension = file.name.split(".").pop()?.toLowerCase() || "png";
                  const base64 = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                      const result = String(reader.result ?? "");
                      resolve(result.includes(",") ? result.slice(result.indexOf(",") + 1) : result);
                    };
                    reader.onerror = () => reject(new Error("Nie udało się odczytać pliku."));
                    reader.readAsDataURL(file);
                  });
                  await rulerUploadCountryFlag({
                    data: {
                      countryId: country.country_id,
                      fileBase64: base64,
                      contentType: file.type as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
                      extension: extension as "png" | "jpg" | "jpeg" | "webp" | "gif",
                    },
                  });
                  toast.success("Flaga państwa została zmieniona.");
                  void queryClient.invalidateQueries({ queryKey: ["country_stats"] });
                  void queryClient.invalidateQueries({ queryKey: ["public_countries"] });
                  void queryClient.invalidateQueries({ queryKey: ["countries"] });
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Nie udało się zmienić flagi.");
                } finally {
                  setFlagFile(null);
                  setFlagSaving(false);
                }
              }}
            />
          </label>
          {flagSaving && flagFile ? (
            <p className="mt-1 text-[11px] text-muted-foreground">Wgrywanie: {flagFile.name}</p>
          ) : null}
        </div>
      </Panel>
      {economyBonus ? <Panel className="mb-4 border-primary/30 bg-primary/5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="label-hud">Bonus ekonomiczny</p><p className="num mt-1 text-2xl font-semibold text-primary">+{economyBonus.percent}% zarobków</p></div><p className="text-sm text-muted-foreground">Aktywny do {new Date(economyBonus.ends_at).toLocaleString("pl-PL")}</p></div></Panel> : null}
      {occupiedByMe.length ? (
        <Panel className="mb-4 border-primary/40 bg-primary/5 p-3">
          <p className="label-hud">OKUPOWANE REGIONY — TWOJE ZYSKI</p>
          <div className="mt-3 space-y-2">
            {occupiedByMe.slice(0, 5).map((occupation) => {
              const region = (regions ?? []).find((item) => item.id === occupation.region_id);
              if (!region) return null;
              const effects = (region.slots ?? []).reduce((acc, slot) => {
                const item = (shop ?? []).find((shopItem) => shopItem.building === slot.building);
                if (!item) return acc;
                acc.kr += Number(item.income_kr ?? 0);
                if (item.produces) acc.resources[item.produces] = (acc.resources[item.produces] ?? 0) + Number(item.produces_amount ?? 0);
                return acc;
              }, { kr: 0, resources: {} as Record<string, number> });
              return (
                <div key={occupation.id} className="border border-primary/30 bg-secondary/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div><p className="text-sm font-semibold">OKUPUJESZ: {occupation.region_name}</p><p className="text-xs text-muted-foreground">Region przejęty od {countries?.find((row) => row.country_id === occupation.previous_country_id)?.name ?? "Nieznane państwo"}</p></div>
                    <span className="text-xs font-semibold text-primary">OD {new Date(occupation.occupied_at).toLocaleString("pl-PL")}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="border border-border bg-secondary/30 p-2"><p className="label-hud">ZYSK KR</p><p className="num mt-1 text-sm text-success">+{fmtKR(effects.kr)} / doba</p></div>
                    {Object.entries(effects.resources).map(([resource, value]) => <div key={resource} className="border border-border bg-secondary/30 p-2"><p className="label-hud">ZYSK {RESOURCE_LABELS[resource] ?? resource}</p><p className="num mt-1 text-sm text-success">+{units(value)} / doba</p></div>)}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      ) : null}
      {occupationHistory?.slice(0, 3).map((occupation) => {
        const isCurrent = occupation.current_country_id === me.countryId;
        const label = isCurrent ? "REGION PRZEJĘTY" : "REGION OKUPOWANY";
        return (
          <Panel key={occupation.id} className={`mb-3 border-primary/30 ${isCurrent ? "bg-primary/5" : "bg-destructive/5"}`}>
            <p className="label-hud">{label}</p>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{occupation.region_name}</p>
              <p className="text-xs text-muted-foreground">{new Date(occupation.occupied_at).toLocaleString("pl-PL")}</p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {isCurrent
                ? `Poprzedni właściciel: ${countries?.find((countryRow) => countryRow.country_id === occupation.previous_country_id)?.name ?? "Nieznane państwo"}`
                : `Nowy właściciel: ${countries?.find((countryRow) => countryRow.country_id === occupation.current_country_id)?.name ?? "Nieznane państwo"}`}
            </p>
          </Panel>
        );
      })}

      {/* Skarbiec + przychód */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Skarbiec"
          value={kr(country.balance)}
          hint={fmtKR(country.balance)}
          tone="primary"
          icon={<Coins className="size-4" strokeWidth={1.5} />}
        />
        <Stat label="Przychód / doba" value={fmtKR(country.gross_income)} tone="accent" />
        <Stat
          label="Zużycie węgla / doba"
          value={units(country.coal_upkeep)}
          hint={shortage ? "Brak węgla wstrzyma fabryki IV/V" : "Zapas wystarczający"}
        />
      </div>

      {/* Poziomy pasek zasobów */}
      <Panel className="hud-frame mt-3 overflow-x-auto p-0">
        <div className="divide-border grid min-w-max grid-cols-5 divide-x">
          {resources.map((r) => {
            const zero = Number(r.value) === 0;
            return (
              <div key={r.key} className="min-w-28 px-3 py-2.5">
                <div className="text-muted-foreground flex items-center gap-1.5">
                  <r.icon className="size-3.5" strokeWidth={1.5} />
                  <span className="text-[10px] tracking-[0.14em] uppercase">{r.label}</span>
                </div>
                <p className={`num mt-1 text-sm ${zero ? "text-inactive" : "text-foreground"}`}>
                  {units(r.value)}
                </p>
                <p className={`text-[10px] ${Number(r.prod) > 0 ? "text-success" : "text-inactive"}`}>
                  +{units(r.prod)} / doba
                </p>
              </div>
            );
          })}
        </div>
      </Panel>

      <SectionTitle
        action={
          <Link to="/arsenal" className="text-primary shrink-0 text-xs">
            Arsenał
          </Link>
        }
      >
        Wojsko i obrona
      </SectionTitle>
      <Panel className="p-0">
        <div className="divide-border grid grid-cols-3 divide-x divide-y sm:grid-cols-6 sm:divide-y-0">
          {military.map((m) => (
            <div key={m.label} className="px-3 py-2.5">
              <p className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                {m.label}
              </p>
              <p className={`num mt-1 text-sm ${m.value === 0 ? "text-inactive" : ""}`}>
                {units(m.value)}
              </p>
            </div>
          ))}
        </div>
      </Panel>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Stat
          label="Potencjał głosów"
          value={units(country.vote_potential)}
          hint="Bez limitu — pakiety żołnierzy + czołgów"
          tone="accent"
        />
        <Stat label="Głosy fortyfikacji" value={units(country.fort_votes)} />
      </div>

      {/* Widget regionów */}
      <SectionTitle
        action={
          <Link to="/regiony" className="text-primary flex shrink-0 items-center gap-1 text-xs">
            Zarządzaj <ChevronRight className="size-3.5" strokeWidth={1.5} />
          </Link>
        }
      >
        Regiony ({regions?.length ?? 0})
      </SectionTitle>
      <Panel className="divide-border divide-y p-0">
        {(regions ?? []).slice(0, 4).map((r) => (
          <Link
            key={r.id}
            to="/regiony"
            className="hover:bg-secondary/50 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5"
          >
            <p className="truncate text-sm">{r.name}</p>
            <span
              className={`num shrink-0 text-xs ${(r.slots ?? []).length === 0 ? "text-inactive" : "text-primary"}`}
            >
              {(r.slots ?? []).length}/9
            </span>
          </Link>
        ))}
        {regions && regions.length === 0 ? (
          <p className="text-muted-foreground p-3 text-sm">
            Twoje państwo nie ma jeszcze regionów — administrator może je dodać.
          </p>
        ) : null}
        {regions && regions.length > 4 ? (
          <Link to="/regiony" className="text-primary block px-3 py-2.5 text-xs">
            + {regions.length - 4} kolejnych regionów
          </Link>
        ) : null}
      </Panel>

      <OperationsHistory rows={(history ?? []) as unknown as TxRow[]} />


      <div className="text-inactive mt-3 flex items-center gap-2 text-xs">
        <Timer className="size-3.5" strokeWidth={1.5} /> Do rozliczenia dobowego:{" "}
        <DailyCountdown />
      </div>
      {claimPanel}
    </AppShell>
  );
}

function DailyCountdown() {
  const [countdown, setCountdown] = useState(() => timeToDailyCycle());
  useEffect(() => {
    const t = window.setInterval(() => setCountdown(timeToDailyCycle()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return <span className="num text-primary">{countdown}</span>;
}
