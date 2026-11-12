import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { rulerUploadCountryFlag } from "@/lib/admin.functions";
import { CountryFlag } from "@/components/CountryFlag";
import { Panel, SectionTitle, Stat } from "@/components/stat";
import { OperationsHistory, type TxRow } from "@/components/OperationsHistory";
import { SuggestCountryPanel } from "@/components/CountrySuggestions";
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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyCountry,
});

function DailyCycleCountdown() {
  const [countdown, setCountdown] = useState(() => timeToDailyCycle());

  useEffect(() => {
    const timer = window.setInterval(() => setCountdown(timeToDailyCycle()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return <span className="num font-medium text-primary">{countdown}</span>;
}


function MyCountry() {
  const queryClient = useQueryClient();
  const { data: me } = useQuery(meQuery);

  const { data: countries, isLoading: countriesLoading, error: countriesError } = useQuery(countriesQuery);
  const country = countries?.find((c) => c.country_id === me?.countryId);
  const { data: economyBonus } = useQuery(economyBonusQuery(me?.countryId));
  const { data: history } = useQuery(transactionsQuery(me?.countryId ?? null, 50));
  const { data: occupationHistory } = useQuery(regionOccupationsQuery(me?.countryId));
  const occupiedByMe = (occupationHistory ?? []).filter(
    (occupation) => occupation.is_active && occupation.controller_country_id === me?.countryId,
  );
  const hasOccupiedRegions = occupiedByMe.length > 0;
  const { data: regions } = useQuery({
    ...regionsQuery(me?.countryId),
    enabled: !!me?.countryId && hasOccupiedRegions,
  });
  const { data: shop } = useQuery({
    ...shopQuery,
    enabled: hasOccupiedRegions,
  });
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
        {countriesLoading ? (
          <Panel className="p-4"><p className="text-sm">Ładowanie państwa…</p></Panel>
        ) : countriesError ? (
          <Panel className="p-4"><p className="text-sm font-semibold">Nie udało się wczytać państwa</p><p className="mt-2 text-sm text-muted-foreground">{countriesError.message}</p></Panel>
        ) : !me.isMainAdmin ? (
          <Panel className="p-4">
          <p className="text-sm font-semibold">Nie masz jeszcze przypisanego państwa</p>
          <p className="text-muted-foreground mt-2 text-sm">
            Poproś administratora gry o przypisanie państwa do Twojego konta. Do tego czasu możesz
            przeglądać <Link to="/swiat" className="text-primary">świat</Link> i{" "}
            <Link to="/ranking" className="text-primary">ranking</Link>.
          </p>
          </Panel>
        ) : null}
        {!me.isMainAdmin ? <SuggestCountryPanel userId={me.userId} /> : null}
        {claimPanel}
      </AppShell>
    );
  }

  const resources = [
    { key: "coal", label: "Węgiel", value: country.coal, prod: country.coal_prod },
    { key: "oil", label: "Ropa", value: country.oil, prod: country.oil_prod },
    {
      key: "copper",
      label: "Miedź",
      value: country.copper,
      prod: country.copper_prod,
    },
    { key: "iron", label: "Żelazo", value: country.iron, prod: country.iron_prod },
    { key: "uranium", label: "Uran", value: country.uranium, prod: country.uranium_prod },
  ];

  const isTestCountry = country.name === "Testy v1" || country.name === "Testy v2";
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
    <AppShell me={me} title="Państwo">
      <section className="mb-8 flex items-center gap-5 border-b border-border pb-6 sm:gap-7">
        <CountryFlag
          flag={country.flag}
          alt={"Flaga państwa " + country.name}
          className="h-[5.5rem] w-[8.25rem] shrink-0 rounded-lg text-5xl shadow-sm sm:h-28 sm:w-40"
        />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{country.name}</h2>
          <label className="mt-3 inline-flex min-h-9 cursor-pointer items-center rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground">
            {flagSaving ? "Wgrywanie flagi…" : "Zmień flagę"}
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
          {flagSaving && flagFile ? <p className="mt-1 text-[11px] text-muted-foreground">{flagFile.name}</p> : null}
        </div>
      </section>
      <section className="mb-8">
        <p className="mb-2 text-sm font-medium text-muted-foreground">Budżet państwa</p>
        <Panel className="rounded-xl border-border/80 p-6 shadow-sm sm:p-8">
          <p className="num text-4xl font-semibold tracking-tight text-primary sm:text-5xl">{isTestCountry ? "∞" : kr(country.balance)}</p>
          <p className="mt-2 text-xs text-muted-foreground">Aktualny stan skarbca</p>
        </Panel>
        <div className="mt-3">
          <Panel className="rounded-xl border-border/80 p-6 shadow-sm sm:p-8">
            <p className="num text-4xl font-semibold tracking-tight text-primary sm:text-5xl">{kr(country.gross_income)}</p>
            <p className="mt-2 text-xs text-muted-foreground">Przychód na dobę</p>
          </Panel>
          <div className="mt-2 flex items-center gap-2 px-1 text-xs text-muted-foreground">
            <Timer className="size-3.5" strokeWidth={1.5} />
            <span>Do rozliczenia dobowego:</span>
            <DailyCycleCountdown />
          </div>
        </div>
      </section>
      {economyBonus ? <Panel className="mb-4 border-primary/30 bg-primary/5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="label-hud">Bonus ekonomiczny</p><p className="num mt-1 text-2xl font-semibold text-primary">+{economyBonus.percent}% zarobków</p></div><p className="text-sm text-muted-foreground">Aktywny do {new Date(economyBonus.ends_at).toLocaleString("pl-PL")}</p></div></Panel> : null}

      <section className="mb-8">
        <h3 className="mb-4 text-lg font-semibold tracking-tight">Surowce</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {resources.map((r) => {
            const zero = Number(r.value) === 0;
            return (
              <div key={r.key} className="min-w-0 rounded-xl border border-border/80 bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md sm:p-5">
                <p className="text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">{r.label}</p>
                <p className={`num mt-3 text-xl font-semibold tracking-tight sm:text-2xl ${zero ? "text-inactive" : "text-foreground"}`}>
                  {isTestCountry ? "∞" : units(r.value)}
                </p>
                <p className={`mt-2 text-xs ${Number(r.prod) > 0 ? "text-success" : "text-inactive"}`}>
                  +{units(r.prod)} <span className="text-muted-foreground">/ doba</span>
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mb-8">
        <h3 className="mb-4 text-lg font-semibold tracking-tight">Wojsko i obrona</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {military.map((m) => (
            <div key={m.label} className="min-w-0 rounded-xl border border-border/80 bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md sm:p-5">
              <p className="text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                {m.label}
              </p>
              <p className={`num mt-3 text-lg font-semibold tracking-tight sm:text-xl ${m.value === 0 ? "text-inactive" : "text-foreground"}`}>
                {units(m.value)}
              </p>
            </div>
          ))}
        </div>
      </section>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Stat
          label="Potencjał głosów"
          value={units(country.vote_potential)}
          tone="accent"
        />
        <Stat label="Głosy fortyfikacji" value={units(country.fort_votes)} />
      </div>

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
        const isCurrent = occupation.is_active && occupation.controller_country_id === me.countryId;
        const label = occupation.event_type === "REVERT"
          ? "REGION ODBLOKOWANY"
          : isCurrent
            ? "REGION PRZEJĘTY"
            : "REGION OKUPOWANY";
        return (
          <Panel key={occupation.id} className={`mb-3 border-primary/30 ${isCurrent ? "bg-primary/5" : "bg-destructive/5"}`}>
            <p className="label-hud">{label}</p>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{occupation.region_name}</p>
              <p className="text-xs text-muted-foreground">{new Date(occupation.occupied_at).toLocaleString("pl-PL")}</p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {occupation.event_type === "REVERT"
                ? `Region wrócił pod kontrolę: ${countries?.find((countryRow) => countryRow.country_id === occupation.current_country_id)?.name ?? "Nieznane państwo"}`
                : isCurrent
                  ? `Poprzedni kontroler: ${countries?.find((countryRow) => countryRow.country_id === occupation.previous_country_id)?.name ?? "Nieznane państwo"}`
                  : `Nowy kontroler: ${countries?.find((countryRow) => countryRow.country_id === occupation.current_country_id)?.name ?? "Nieznane państwo"}`}
            </p>
          </Panel>
        );
      })}

      <OperationsHistory rows={(history ?? []) as unknown as TxRow[]} />


      {claimPanel}
    </AppShell>
  );
}
