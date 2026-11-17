import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Rocket, ShieldCheck, Crosshair, Target, ChevronLeft, ChevronRight, LoaderCircle, Search, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { MissileFlight } from "@/components/MissileFlight";
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
import { BUILDING_LABELS, MISSILE_LABELS, big, dateTime, units } from "@/lib/format";

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
  { code: "missile_2", targets: 2, requiredAa: 2, effect: "Niszczy do 2 wybranych budynków" },
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
  const [countrySearch, setCountrySearch] = useState("");

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
  const stock = missile && country ? big(country[missile]) : 0n;
  const hasMixedResult = (result?.impacts ?? 0) > 0 && (result?.intercepted ?? 0) > 0;
  const isPartialSalvo = (result?.launched ?? count) < count;
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
    onMutate: () => setPhase("processing"),
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
      void queryClient.invalidateQueries({ queryKey: ["all_regions"] });
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
      ? !!missile && stock >= BigInt(count)
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

      <div className="arsenal-heading"><div><p className="label-hud">Operacje rakietowe</p><SectionTitle>Nowy wystrzał</SectionTitle></div><div className="arsenal-live"><span /> Arsenał gotowy</div></div>
      <Panel className={"hud-frame arsenal-wizard p-5 " + (missile === "missile_3" ? "arsenal-wizard-heavy" : "")}>
        <div className="flex items-center justify-between gap-3">
          <p className="label-hud">
            Krok {step}/6 — {STEP_TITLES[step - 1]}
          </p>
          {step > 1 ? (
            <Button variant="ghost"
              type="button"
              className="text-muted-foreground flex items-center gap-1 text-xs"
              onClick={() => setStep(step - 1)}
            >
              <ChevronLeft className="size-3.5" strokeWidth={1.5} /> Wstecz
            </Button>
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
                  <Button variant="ghost"
                    key={m.code}
                    type="button"
                    onClick={() => {
                      setMissile(m.code);
                      setSlotIds([]);
                    }}
                    aria-pressed={missile === m.code}
                    className={`missile-select-card missile-select-${m.code} p-4 text-left ${missile === m.code ? "missile-select-active" : ""}`}
                  >
                    <div className="missile-card-top">
                      <span className="label-hud">RAKIETA / {m.code.slice(-1)}</span>
                      <span className="missile-card-status">{missile === m.code ? "WYBRANA" : "DOSTĘPNA"}</span>
                    </div>
                    <div className="missile-card-art">
                      <Rocket className="missile-card-icon" strokeWidth={1.25} />
                      {m.code === "missile_3" ? <span className="missile-card-orbit" /> : null}
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                      <p className="truncate text-sm font-semibold">{MISSILE_LABELS[m.code]}</p>
                      <span className="missile-level">POZIOM {m.code.slice(-1)}</span>
                    </div>
                    <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
                      {m.effect}
                    </p>
                    <p className="text-info mt-2 text-xs">Przechwycenie od {m.requiredAa} OPL</p>
                    <p
                      className={`num mt-2 text-xs ${
                        big(country?.[m.code] ?? 0) === 0n ? "text-inactive" : "text-primary"
                      }`}
                    >
                      W arsenale: {units(country?.[m.code] ?? 0)}
                    </p>
                  </Button>
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
            <div className="space-y-2">
              <div className="relative"><Search className="text-muted-foreground absolute left-3 top-3 size-4" /><Input aria-label="Szukaj państwa" placeholder="Szukaj państwa…" value={countrySearch} onChange={(e) => setCountrySearch(e.target.value)} className="pl-9" /></div>
              {enemyCountries.filter((c) => c.name.toLocaleLowerCase("pl").includes(countrySearch.toLocaleLowerCase("pl"))).map((c) => (
                <Button variant="ghost"
                  key={c.country_id}
                  aria-pressed={targetCountry === c.country_id}
                  type="button"
                  onClick={() => {
                    setTargetCountry(c.country_id);
                    setRegionId(null);
                    setSlotIds([]);
                  }}
                  className={`arsenal-choice hover:bg-secondary/50 grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-1 py-3 text-left ${
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
                </Button>
              ))}
              {enemyCountries.length === 0 ? (
                <p className="text-muted-foreground py-3 text-sm">Brak innych państw.</p>
              ) : null}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="divide-border divide-y">
              {enemyRegions.map((r) => (
                <Button variant="ghost"
                  key={r.id}
                  aria-pressed={regionId === r.id}
                  type="button"
                  onClick={() => {
                    setRegionId(r.id);
                    setSlotIds([]);
                  }}
                  className={`arsenal-choice hover:bg-secondary/50 grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-1 py-3 text-left ${
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
                </Button>
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
                  <Button variant="ghost"
                    key={key}
                    aria-pressed={mode === key}
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
                  </Button>
                ))}
              </div>
            ) : (
              <div className="divide-border divide-y">
                <p className="text-muted-foreground pb-2 text-xs">
                  Wybierz {spec.targets === 1 ? "1 budynek" : `maksymalnie ${spec.targets} budynki`} (
                  {slotIds.length}/{spec.targets})
                </p>
                {region.slots.map((s) => {
                  const picked = slotIds.includes(s.id);
                  return (
                    <Button variant="ghost"
                      key={s.id}
                      aria-pressed={picked}
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
                      className={`arsenal-choice hover:bg-secondary/50 grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-1 py-3 text-left ${
                        picked ? "bg-secondary" : ""
                      }`}
                    >
                      <span className="num text-inactive text-xs">{s.slot_index}</span>
                      <span className="truncate text-sm">{BUILDING_LABELS[s.building]}</span>
                      <Crosshair
                        className={`size-4 shrink-0 ${picked ? "text-destructive" : "text-inactive"}`}
                        strokeWidth={1.5}
                      />
                    </Button>
                  );
                })}
                {region.slots.length === 0 ? (
                  <p className="text-muted-foreground py-3 text-sm">Region jest pusty.</p>
                ) : null}
              </div>
            )
          ) : null}

          {step === 5 ? (
            <div className="launch-summary space-y-3 text-sm">
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
                  <p className="label-hud">Ostatnie potwierdzenie</p>
                  <p className="launch-console-title">Potwierdź wystrzał</p>
                </div>
                <span className="launch-ready"><span /> GOTOWA DO STARTU</span>
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
                <span>Nieodwracalne — wystrzelone rakiety zostaną zużyte, także po przechwyceniu.</span>
              </div>
              <Button
                variant={missile === "missile_3" ? "destructive" : "default"}
                type="button"
                className={missile === "missile_3" ? "launch-confirm launch-confirm-heavy" : "launch-confirm"}
                disabled={launch.isPending}
                onClick={() => {
                  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(missile === "missile_3" ? 45 : 18);
                  launch.mutate();
                }}
              >
                <span className="launch-confirm-inner">
                  
                  <Target className={missile === "missile_3" ? "size-5" : "size-4"} />
                  <span>{launch.isPending ? "PRZEKAZYWANIE ROZKAZU…" : missile === "missile_3" ? "URUCHOM PROCEDURĘ STARTU" : "POTWIERDŹ I WYSTRZEL"}</span>
                  
                </span>
              </Button>
              
            </div>
          ) : null}

          {step < 6 ? (
            <Button
              className="arsenal-next w-full sm:w-48"
              disabled={!canGoNext}
              onClick={() => setStep(step + 1)}
            >
              {step === 5 ? "Przejdź do potwierdzenia" : "Dalej"} <ChevronRight />
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
                r.aa_defense === "0" ? "text-inactive" : "text-info"
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
            <div className="launch-flight-stage">
              <DialogHeader className="launch-flight-heading">
                <DialogTitle>{result ? "Rakieta w locie" : "Przekazywanie rozkazu…"}</DialogTitle>
                <DialogDescription>{targetCountryName} · {region?.name}</DialogDescription>
              </DialogHeader>
              {result ? <MissileFlight heavy={missile === "missile_3"} intercepted={(result.impacts ?? 0) === 0 && (result.intercepted ?? 0) > 0} /> : <div className="launch-sending" role="status"><LoaderCircle className="size-8 animate-spin" /><span>Oczekiwanie na potwierdzenie wystrzału</span></div>}
              <div className="launch-flight-telemetry">
                <div><span>Rakieta</span><strong>{missile ? MISSILE_LABELS[missile] : "—"}</strong></div>
                <div><span>Liczba</span><strong>{units(result?.launched ?? count)} szt.</strong></div>
                <div><span>Cel</span><strong title={region?.name}>{region?.name ?? "—"}</strong></div>
              </div>
              <p className="launch-flight-status" role="status">{result ? "Trwa lot · przygotowywanie raportu" : "Rozkaz jest przetwarzany"}</p>
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
                  {isPartialSalvo ? "Salwa niepełna" : hasMixedResult ? "Salwa częściowo skuteczna" : (result.impacts ?? 0) > 0 ? "Cel zniszczony" : "Rakiety przechwycone"}
                </DialogTitle>
                <DialogDescription>
                  {region?.name} — {targetCountryName}
                </DialogDescription>
              </DialogHeader>
              <div className={`launch-result-banner ${(result.impacts ?? 0) > 0 ? "launch-result-hit" : "launch-result-blocked"}`}>
                {(result.impacts ?? 0) > 0 ? <CheckCircle2 /> : <XCircle />}
                <div>
                  <p className="label-hud">RAPORT SYSTEMU</p>
                  <strong>{isPartialSalvo ? "SALWA NIEPEŁNA" : hasMixedResult ? "CZĘŚCIOWY SUKCES" : (result.impacts ?? 0) > 0 ? "CEL TRAFIONY" : "RAKIETY PRZECHWYCONO"}</strong>
                </div>
              </div>
              <div className="launch-summary space-y-3 text-sm">
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
    <div className="launch-detail-row">
      <span className="text-muted-foreground">{k}</span>
      <span className="num text-foreground text-right">{v}</span>
    </div>
  );
}
