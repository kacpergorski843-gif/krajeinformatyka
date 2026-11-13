import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Rocket, ShieldCheck, Crosshair, Target, ChevronLeft, Activity, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Panel, SectionTitle, Stat } from "@/components/stat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  allRegionsQuery,
  countriesQuery,
  meQuery,
  regionsQuery,
  rpc,
  strikesQuery,
} from "@/lib/api";
import type { RegionWithSlots } from "@/lib/api";
import { BUILDING_LABELS, MISSILE_LABELS, dateTime, units } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/arsenal")({
  head: () => ({
    meta: [
      { title: "Arsenał — Nation Dynamics" },
      {
        name: "description",
        content: "Wystrzel rakiety I–III krok po kroku i sprawdzaj obronę OPL w regionach.",
      },
      { property: "og:title", content: "Arsenał — Nation Dynamics" },
      {
        property: "og:description",
        content: "Rakiety, salwy i obrona przeciwlotnicza regionów.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Arsenal,
});

type MissileCode = "missile_1" | "missile_2" | "missile_3";

const MISSILES: {
  code: MissileCode;
  targets: number;
  requiredAa: number;
  effect: string;
}[] = [
  { code: "missile_1", targets: 1, requiredAa: 1, effect: "Niszczy 1 wybrany budynek" },
  { code: "missile_2", targets: 2, requiredAa: 2, effect: "Niszczy 2 wybrane budynki" },
  {
    code: "missile_3",
    targets: 0,
    requiredAa: 10,
    effect: "Niszczy wszystkie fabryki LUB wszystkie zakłady surowcowe",
  },
];

type Phase = "wizard" | "processing" | "result";

type SalvoResult = {
  launched?: number;
  intercepted?: number;
  impacts?: number;
  destroyed?: number;
  stopped_reason?: string | null;
};

const STEP_TITLES = [
  "Wybierz rakietę",
  "Wybierz państwo",
  "Wybierz region",
  "Wybierz cel",
  "Podsumowanie",
  "Potwierdzenie",
];

function Arsenal() {
  const [step, setStep] = useState(1);
  const [missile, setMissile] = useState<MissileCode | null>(null);
  const [targetCountry, setTargetCountry] = useState<string | null>(null);
  const [regionId, setRegionId] = useState<string | null>(null);
  const [slotIds, setSlotIds] = useState<string[]>([]);
  const [mode, setMode] = useState<"factories" | "mines">("factories");
  const [countText, setCountText] = useState("1");
  const [phase, setPhase] = useState<Phase>("wizard");
  const [result, setResult] = useState<SalvoResult | null>(null);

  const { data: me } = useQuery(meQuery);
  const { data: countries } = useQuery(countriesQuery);
  const { data: allRegions, isPending: allRegionsPending } = useQuery({
    ...allRegionsQuery,
    enabled: step >= 3 && !!targetCountry,
  });
  const { data: myRegions } = useQuery(regionsQuery(me?.countryId));
  const { data: strikes } = useQuery(strikesQuery(me?.countryId));
  const queryClient = useQueryClient();

  const country = countries?.find((c) => c.country_id === me?.countryId);

  const count = Math.min(100, Math.max(1, Math.floor(Number(countText) || 0) || 1));
  const spec = MISSILES.find((m) => m.code === missile) ?? null;
  const region = (allRegions ?? []).find((r) => r.id === regionId) ?? null;
  const enemyCountries = (countries ?? []).filter((c) => c.country_id !== me?.countryId);
  const enemyRegions = (allRegions ?? []).filter((r) => r.country_id === targetCountry);
  const stock = missile && country ? Number(country[missile]) : 0;
  const targetCountryName =
    countries?.find((c) => c.country_id === targetCountry)?.name ?? "";

  function reset() {
    setStep(1);
    setMissile(null);
    setTargetCountry(null);
    setRegionId(null);
    setSlotIds([]);
    setCountText("1");
    setPhase("wizard");
    setResult(null);
  }

  const launch = useMutation({
    mutationFn: () =>
      rpc<SalvoResult>("launch_salvo", {
        p_country_id: me?.countryId,
        p_missile_code: missile,
        p_region_id: regionId,
        p_slot_ids: slotIds,
        p_mode: mode,
        p_count: count,
      }),
    onSuccess: (data) => {
      setResult(data);
      setPhase("processing");
      window.setTimeout(() => setPhase("result"), missile === "missile_3" ? 5600 : 4200);
      void queryClient.invalidateQueries({ queryKey: ["country_stats"] });
      void queryClient.invalidateQueries({ queryKey: ["regions"] });
      void queryClient.invalidateQueries({ queryKey: ["strikes"] });
    },
    onError: (e: Error) => {
      setPhase("wizard");
      toast.error(e.message);
    },
  });

  const modeSlots = (r: RegionWithSlots) =>
    r.slots.filter((s) =>
      mode === "factories" ? s.building.startsWith("factory_") : s.building.startsWith("mine_"),
    );

  const targetsPicked =
    spec?.code === "missile_3"
      ? true
      : slotIds.length > 0 && slotIds.length <= (spec?.targets ?? 0);

  const canGoNext =
    step === 1
      ? !!missile && stock >= count
      : step === 2
        ? !!targetCountry
        : step === 3
          ? !!regionId
          : step === 4
            ? targetsPicked
            : true;

  const targetsLabel =
    spec?.code === "missile_3"
      ? mode === "factories"
        ? "Wszystkie fabryki"
        : "Wszystkie zakłady surowcowe"
      : slotIds
          .map((id) => region?.slots.find((s) => s.id === id)?.building)
          .filter(Boolean)
          .map((b) => BUILDING_LABELS[b as string] ?? b)
          .join(", ");

  return (
    <AppShell me={me ?? null} title="Arsenał" subtitle="Rakiety i obrona OPL">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Rakiety I" value={units(country?.missile_1 ?? 0)} tone="primary" />
        <Stat label="Rakiety II" value={units(country?.missile_2 ?? 0)} tone="primary" />
        <Stat label="Rakiety III" value={units(country?.missile_3 ?? 0)} tone="primary" />
      </div>

      <div className="arsenal-heading"><div><p className="label-hud">Strategic weapons command</p><SectionTitle>Procedura odpalenia</SectionTitle><p className="text-muted-foreground -mt-2 text-xs">Wybierz uzbrojenie, wyznacz cel i zatwierdź rozkaz startu.</p></div><div className="arsenal-live"><span /> SYSTEM GOTOWY</div></div>
      <Panel className={"hud-frame arsenal-wizard p-5 " + (missile === "missile_3" ? "arsenal-wizard-heavy" : "")}>
        <div className="flex items-center justify-between gap-3">
          <p className="label-hud">
            Krok {step}/6 — {STEP_TITLES[step - 1]}
          </p>
          {step > 1 ? (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
              onClick={() => setStep(step - 1)}
            >
              <ChevronLeft className="size-3.5" strokeWidth={1.5} /> Wstecz
            </button>
          ) : null}
        </div>
        <div className="bg-secondary mt-3 h-1 w-full overflow-hidden rounded-full">
          <div
            className="bg-primary h-full transition-all"
            style={{ width: `${(step / 6) * 100}%` }}
          />
        </div>

        <div className="mt-5 space-y-4">
          {step === 1 ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                {MISSILES.map((m) => (
                  <button
                    key={m.code}
                    type="button"
                    onClick={() => {
                      setMissile(m.code);
                      setSlotIds([]);
                    }}
                    className={`panel missile-select-card missile-select-${m.code} p-4 text-left ${missile === m.code ? "missile-select-active" : ""}`}
                  >
                    <div className="missile-card-top">
                      <span className="label-hud">WEAPON / {m.code.slice(-1)}</span>
                      <span className="missile-card-status">{missile === m.code ? "WYBRANA" : "GOTOWA"}</span>
                    </div>
                    <div className="missile-card-art">
                      <Rocket className="missile-card-icon" strokeWidth={1.25} />
                      {m.code === "missile_3" ? <span className="missile-card-orbit" /> : null}
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                      <p className="truncate text-sm font-semibold">{MISSILE_LABELS[m.code]}</p>
                      <span className="missile-level">LVL {m.code.slice(-1)}</span>
                    </div>
                    <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
                      {m.effect}
                    </p>
                    <p className="text-info mt-2 text-xs">Przechwycenie od {m.requiredAa} OPL</p>
                    <p
                      className={`num mt-2 text-xs ${
                        Number(country?.[m.code] ?? 0) === 0 ? "text-inactive" : "text-primary"
                      }`}
                    >
                      W arsenale: {units(country?.[m.code] ?? 0)}
                    </p>
                  </button>
                ))}
              </div>
              <div className="max-w-xs space-y-2">
                <label htmlFor="salvo" className="label-hud">
                  Ilość rakiet
                </label>
                <Input
                  id="salvo"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  value={countText}
                  onChange={(e) => setCountText(e.target.value)}
                  onBlur={() => setCountText(String(count))}
                  className="num"
                />
                <p className={`text-xs ${stock < count ? "text-destructive" : "text-inactive"}`}>
                  W arsenale: {units(stock)} / potrzeba {units(count)}
                </p>
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <div className="divide-border divide-y">
              {enemyCountries.map((c) => (
                <button
                  key={c.country_id}
                  type="button"
                  onClick={() => {
                    setTargetCountry(c.country_id);
                    setRegionId(null);
                    setSlotIds([]);
                  }}
                  className={`hover:bg-secondary/50 grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-1 py-3 text-left ${
                    targetCountry === c.country_id ? "bg-secondary" : ""
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{c.name}</span>
                    <span className="text-inactive text-[11px] uppercase">
                      Regiony: {c.regions_count} · OPL łącznie: {units(c.region_aa_total)}
                    </span>
                  </span>
                  <Crosshair className="text-inactive size-4 shrink-0" strokeWidth={1.5} />
                </button>
              ))}
              {enemyCountries.length === 0 ? (
                <p className="text-muted-foreground py-3 text-sm">Brak innych państw.</p>
              ) : null}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="divide-border divide-y">
              {enemyRegions.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setRegionId(r.id);
                    setSlotIds([]);
                  }}
                  className={`hover:bg-secondary/50 grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-1 py-3 text-left ${
                    regionId === r.id ? "bg-secondary" : ""
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{r.name}</span>
                    <span className="text-inactive text-[11px] uppercase">
                      Sloty {r.slots.length}/9
                    </span>
                  </span>
                  <span
                    className={`num shrink-0 text-xs ${
                      r.aa_defense === "0" ? "text-inactive" : "text-info"
                    }`}
                  >
                    {units(r.aa_defense)} OPL
                  </span>
                </button>
              ))}
              {allRegionsPending ? (
                <p className="text-muted-foreground py-3 text-sm">Wczytywanie regionów…</p>
              ) : enemyRegions.length === 0 ? (
                <p className="text-muted-foreground py-3 text-sm">To państwo nie ma regionów.</p>
              ) : null}
            </div>
          ) : null}

          {step === 4 && region && spec ? (
            spec.code === "missile_3" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ["factories", "Wszystkie fabryki"],
                    ["mines", "Wszystkie zakłady surowcowe"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setMode(key)}
                    className={`rounded-sm border px-4 py-3 text-xs tracking-[0.1em] uppercase ${
                      mode === key
                        ? "border-primary/70 text-primary bg-secondary"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {label}
                    <span className="num text-inactive mt-1 block">
                      {modeSlots(region).length} obiektów
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="divide-border divide-y">
                <p className="text-muted-foreground pb-2 text-xs">
                  Wybierz {spec.targets === 1 ? "1 budynek" : `${spec.targets} budynki`} (
                  {slotIds.length}/{spec.targets})
                </p>
                {region.slots.map((s) => {
                  const picked = slotIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() =>
                        setSlotIds((prev) =>
                          prev.includes(s.id)
                            ? prev.filter((x) => x !== s.id)
                            : prev.length >= spec.targets
                              ? prev
                              : [...prev, s.id],
                        )
                      }
                      className={`hover:bg-secondary/50 grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-1 py-3 text-left ${
                        picked ? "bg-secondary" : ""
                      }`}
                    >
                      <span className="num text-inactive text-xs">{s.slot_index}</span>
                      <span className="truncate text-sm">{BUILDING_LABELS[s.building]}</span>
                      <Crosshair
                        className={`size-4 shrink-0 ${picked ? "text-destructive" : "text-inactive"}`}
                        strokeWidth={1.5}
                      />
                    </button>
                  );
                })}
                {region.slots.length === 0 ? (
                  <p className="text-muted-foreground py-3 text-sm">Region jest pusty.</p>
                ) : null}
              </div>
            )
          ) : null}

          {step === 5 ? (
            <div className="panel space-y-2 p-4 text-xs">
              <Row k="Rakieta" v={missile ? (MISSILE_LABELS[missile] ?? missile) : ""} />
              <Row k="Ilość" v={units(count)} />
              <Row k="Państwo" v={targetCountryName} />
              <Row k="Region" v={region?.name ?? ""} />
              <Row k="Celowane obiekty" v={targetsLabel || "—"} />
              <Row k="OPL regionu" v={units(region?.aa_defense ?? 0)} />
              <Row k="Wymagane OPL do przechwycenia" v={units(spec?.requiredAa ?? 0)} />
            </div>
          ) : null}

          {step === 6 ? (
            <div className={`launch-console ${missile === "missile_3" ? "launch-console-heavy" : ""}`}>
              <div className="launch-console-header">
                <div>
                  <p className="label-hud">Final authorization / step 06</p>
                  <p className="launch-console-title">Stanowisko odpalania</p>
                </div>
                <span className="launch-ready"><span /> GOTOWOŚĆ BOJOWA</span>
              </div>
              <div className="launch-console-body">
                <div className="launch-schematic-wrap">
                  <div className="launch-schematic-grid" />
                  <div className={`launch-schematic-rocket launch-schematic-${missile ?? "missile_1"}`}>
                    <Rocket strokeWidth={1.15} />
                    <span />
                  </div>
                  <span className="launch-schematic-crosshair"><Target /></span>
                  {missile === "missile_3" ? <span className="launch-schematic-orbit launch-orbit-one" /> : null}
                  {missile === "missile_3" ? <span className="launch-schematic-orbit launch-orbit-two" /> : null}
                </div>
                <div className="launch-command-details">
                  <p className="label-hud">Potwierdź rozkaz</p>
                  <p className="launch-command-name">{missile ? MISSILE_LABELS[missile] : "Brak uzbrojenia"}</p>
                  <div className="launch-command-lines">
                    <Row k="Cel" v={`${targetCountryName} / ${region?.name ?? "—"}`} />
                    <Row k="Liczba" v={`${units(count)} szt.`} />
                    <Row k="Obiekty" v={targetsLabel || "—"} />
                    <Row k="Obrona OPL" v={`${units(region?.aa_defense ?? 0)} pkt`} />
                  </div>
                </div>
              </div>
              <div className="launch-warning">
                <span className="launch-warning-light" />
                <span>ROZKAZ NIEODWRACALNY — AMUNICJA ZOSTANIE ZUŻYTA PO ZATWIERDZENIU</span>
              </div>
              <button
                type="button"
                className="launch-red-button"
                disabled={launch.isPending}
                onClick={() => {
                  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(45);
                  launch.mutate();
                }}
              >
                <span className="launch-red-button-inner">
                  <span className="launch-red-button-light" />
                  <Target className="size-5" />
                  <span>{launch.isPending ? "PRZEKAZYWANIE ROZKAZU…" : "URUCHOM PROCEDURĘ STARTU"}</span>
                  <span className="launch-red-button-key">EXECUTE</span>
                </span>
              </button>
              <p className="launch-footnote">Naciśnięcie przycisku natychmiast przekazuje rozkaz do centrum dowodzenia.</p>
            </div>
          ) : null}

          {step < 6 ? (
            <Button
              className="w-full sm:w-48"
              disabled={!canGoNext}
              onClick={() => setStep(step + 1)}
            >
              Dalej
            </Button>
          ) : null}
        </div>
      </Panel>

      <SectionTitle>Obrona OPL w Twoich regionach</SectionTitle>
      <Panel className="divide-border divide-y p-0">
        {(myRegions ?? []).map((r) => (
          <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3">
            <p className="truncate text-sm">{r.name}</p>
            <p
              className={`num flex shrink-0 items-center gap-1.5 text-sm ${
                r.aa_defense === 0 ? "text-inactive" : "text-info"
              }`}
            >
              <ShieldCheck className="size-3.5" strokeWidth={1.5} /> {units(r.aa_defense)} OPL
            </p>
          </div>
        ))}
        {myRegions && myRegions.length === 0 ? (
          <p className="text-muted-foreground p-4 text-sm">Brak regionów do obrony.</p>
        ) : null}
      </Panel>

      <SectionTitle>Historia operacji</SectionTitle>
      <Panel className="divide-border divide-y p-0">
        {(strikes ?? []).slice(0, 10).map((s) => (
          <div key={s.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm">
                {MISSILE_LABELS[s.missile_code]} — region {s.region_name}
              </p>
              <p className="text-inactive text-[11px]">{dateTime(s.created_at)}</p>
            </div>
            <p
              className={`shrink-0 text-xs tracking-[0.1em] uppercase ${
                s.result === "PRZECHWYCONA" ? "text-info" : "text-destructive"
              }`}
            >
              {s.result === "PRZECHWYCONA" ? "Rakieta przechwycona" : "Cel zniszczony"}
            </p>
          </div>
        ))}
        {strikes && strikes.length === 0 ? (
          <p className="text-muted-foreground p-4 text-sm">Brak operacji rakietowych.</p>
        ) : null}
      </Panel>

      <Dialog
        open={phase !== "wizard"}
        onOpenChange={(o) => {
          if (!o && phase === "result") reset();
        }}
      >
        <DialogContent className="admin-dialog max-h-[85vh] overflow-y-auto">
          {phase === "processing" ? (
            <div className={`launch-flight-stage ${missile === "missile_3" ? "launch-flight-heavy" : ""}`}>
              <div className="launch-flight-topline">
                <span className="label-hud">STRATEGIC COMMAND / LIVE OPERATION</span>
                <span className="launch-flight-live"><span /> TRANSMISJA</span>
              </div>
              <DialogHeader className="launch-flight-heading">
                <DialogTitle className="tracking-[0.12em] uppercase">
                  {missile === "missile_3" ? "START RAKIETY STRATEGICZNEJ" : "ROZPOCZĘTO PROCEDURĘ STARTU"}
                </DialogTitle>
                <DialogDescription>{region?.name} / {targetCountryName}</DialogDescription>
              </DialogHeader>
              <div className={`launch-flight-visual launch-flight-visual-${missile ?? "missile_1"}`}>
                <div className="launch-flight-stars" />
                <div className="launch-flight-radar launch-radar-a" />
                <div className="launch-flight-radar launch-radar-b" />
                <div className="launch-flight-horizon" />
                <div className="launch-flight-target"><Target /></div>
                <div className="launch-flight-trail" />
                <div className="launch-flight-rocket"><Rocket strokeWidth={1.1} /><span className="launch-flight-flame" /></div>
                {missile === "missile_3" ? <div className="launch-flight-afterburner" /> : null}
              </div>
              <div className="launch-flight-telemetry">
                <div><span>WEAPON</span><strong>{missile?.toUpperCase()}</strong></div>
                <div><span>PAYLOAD</span><strong>{units(result?.launched ?? count)} / {units(count)}</strong></div>
                <div><span>DESTINATION</span><strong>{region?.name ?? "—"}</strong></div>
              </div>
              <div className="launch-flight-status">
                <Activity className="size-4" />
                <span>{missile === "missile_3" ? "RAKIETA STRATEGICZNA W LOCIE" : "RAKIETA W LOCIE"}</span>
                <span className="launch-flight-status-dots">•••</span>
              </div>
            </div>
          ) : null}

          {phase === "result" && result ? (
            <>
              <DialogHeader>
                <DialogTitle
                  className={`tracking-[0.16em] uppercase ${
                    (result.impacts ?? 0) > 0 ? "text-destructive" : "text-info"
                  }`}
                >
                  {(result.impacts ?? 0) > 0 ? "Cel zniszczony" : "Rakieta przechwycona"}
                </DialogTitle>
                <DialogDescription>
                  {region?.name} — {targetCountryName}
                </DialogDescription>
              </DialogHeader>
              <div className={`launch-result-banner ${(result.impacts ?? 0) > 0 ? "launch-result-hit" : "launch-result-blocked"}`}>
                {(result.impacts ?? 0) > 0 ? <CheckCircle2 /> : <XCircle />}
                <div>
                  <p className="label-hud">RAPORT SYSTEMU</p>
                  <strong>{(result.impacts ?? 0) > 0 ? "CEL TRAFIONY" : "RAKIETA PRZECHWYCONA"}</strong>
                </div>
              </div>
              <div className="panel space-y-2 p-4 text-sm">
                <Row k="Użyta rakieta" v={`${missile ? (MISSILE_LABELS[missile] ?? missile) : ""} x${units(result.launched ?? count)}`} />
                <Row k="Wystrzelono" v={units(result.launched ?? count)} />
                <Row k="Przechwycono" v={units(result.intercepted ?? 0)} />
                <Row k="Uderzenia" v={units(result.impacts ?? 0)} />
                <Row k="Zniszczone budynki" v={units(result.destroyed ?? 0)} />
                {result.stopped_reason ? <Row k="Powód zatrzymania" v={result.stopped_reason} /> : null}
              </div>
              <Button onClick={reset} className="w-full">ZAMKNIJ RAPORT OPERACJI</Button>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground uppercase">{k}</span>
      <span className="num text-foreground text-right">{v}</span>
    </div>
  );
}
