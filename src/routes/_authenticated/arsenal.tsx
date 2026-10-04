import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Rocket, ShieldCheck, Crosshair, Target, ChevronLeft } from "lucide-react";
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
  const { data: me } = useQuery(meQuery);
  const { data: countries } = useQuery(countriesQuery);
  const { data: myRegions } = useQuery(regionsQuery(me?.countryId));
  const { data: strikes } = useQuery(strikesQuery);
  const queryClient = useQueryClient();

  const country = countries?.find((c) => c.country_id === me?.countryId);

  const [step, setStep] = useState(1);
  const [missile, setMissile] = useState<MissileCode | null>(null);
  const [targetCountry, setTargetCountry] = useState<string | null>(null);
  const targetRegionsQuery = useQuery(regionsQuery(targetCountry));
  const targetRegions = targetRegionsQuery.data ?? [];
  const [regionId, setRegionId] = useState<string | null>(null);
  const [slotIds, setSlotIds] = useState<string[]>([]);
  const [mode, setMode] = useState<"factories" | "mines">("factories");
  const [countText, setCountText] = useState("1");
  const [phase, setPhase] = useState<Phase>("wizard");
  const [result, setResult] = useState<SalvoResult | null>(null);

  const count = Math.min(100, Math.max(1, Math.floor(Number(countText) || 0) || 1));
  const spec = MISSILES.find((m) => m.code === missile) ?? null;
  const region = (myRegions ?? []).find((r) => r.id === regionId) ?? null;
  const enemyCountries = (countries ?? []).filter((c) => c.country_id !== me?.countryId);
  const enemyRegions = targetRegions;
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
      window.setTimeout(() => setPhase("result"), 3000);
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

      <SectionTitle>Wystrzel rakietę</SectionTitle>
      <Panel className="hud-frame p-5">
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
                    className={`panel p-4 text-left ${
                      missile === m.code ? "border-primary/70" : ""
                    }`}
                  >
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                      <p className="truncate text-sm font-semibold">{MISSILE_LABELS[m.code]}</p>
                      <Rocket
                        className={`size-4 shrink-0 ${
                          missile === m.code ? "text-primary" : "text-inactive"
                        }`}
                        strokeWidth={1.5}
                      />
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
                      r.aa_defense === 0 ? "text-inactive" : "text-info"
                    }`}
                  >
                    {units(r.aa_defense)} OPL
                  </span>
                </button>
              ))}
              {enemyRegions.length === 0 ? (
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
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm leading-relaxed">
                Atak na region {region?.name} ({targetCountryName}). Operacja jest nieodwracalna —
                rakiety zużywają się niezależnie od wyniku.
              </p>
              <Button
                className="h-14 w-full text-sm tracking-[0.16em] uppercase"
                disabled={launch.isPending}
                onClick={() => launch.mutate()}
              >
                <Target className="mr-2 size-5" strokeWidth={1.5} />
                {launch.isPending ? "Odpalam…" : "Wystrzel rakietę"}
              </Button>
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
            <>
              <DialogHeader>
                <DialogTitle className="tracking-[0.16em] uppercase">Processing</DialogTitle>
                <DialogDescription>Rakieta w drodze do celu</DialogDescription>
              </DialogHeader>
              <div className="panel relative h-24 overflow-hidden p-4">
                <div className="border-primary/40 absolute inset-x-4 top-1/2 border-t border-dashed" />
                <Rocket
                  className="text-primary absolute top-1/2 size-5 -translate-y-1/2 animate-[flight_2.6s_linear_forwards]"
                  strokeWidth={1.5}
                />
                <Target
                  className="text-destructive absolute top-1/2 right-4 size-5 -translate-y-1/2"
                  strokeWidth={1.5}
                />
              </div>
              <p className="label-hud text-center">
                Processing<span className="animate-pulse">…</span>
              </p>
            </>
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
              <div className="panel space-y-2 p-4 text-sm">
                <Row
                  k="Użyta rakieta"
                  v={`${missile ? (MISSILE_LABELS[missile] ?? missile) : ""} x${units(
                    result.launched ?? count,
                  )}`}
                />
                {(result.impacts ?? 0) > 0 ? (
                  <Row k="Zniszczone budynki" v={units(result.destroyed ?? 0)} />
                ) : (
                  <Row k="Obrona" v="OPL regionu" />
                )}
              </div>
              <Button onClick={reset}>Zamknij</Button>
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
