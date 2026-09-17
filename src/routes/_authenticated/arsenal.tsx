import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Rocket, ShieldCheck, Crosshair, Target, ChevronRight } from "lucide-react";
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
        content: "Wystrzel rakiety I–III, prowadź salwy i sprawdzaj obronę OPL w regionach.",
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

type Phase = "idle" | "confirm" | "flight" | "result";

type SalvoResult = {
  launched?: number;
  intercepted?: number;
  impacts?: number;
  destroyed?: number;
  stopped_reason?: string | null;
};

function Arsenal() {
  const { data: me } = useQuery(meQuery);
  const { data: countries } = useQuery(countriesQuery);
  const { data: allRegions } = useQuery(allRegionsQuery);
  const { data: myRegions } = useQuery(regionsQuery(me?.countryId));
  const { data: strikes } = useQuery(strikesQuery);
  const queryClient = useQueryClient();

  const country = countries?.find((c) => c.country_id === me?.countryId);

  const [missile, setMissile] = useState<MissileCode | null>(null);
  const [targetCountry, setTargetCountry] = useState<string | null>(null);
  const [regionId, setRegionId] = useState<string | null>(null);
  const [slotIds, setSlotIds] = useState<string[]>([]);
  const [mode, setMode] = useState<"factories" | "mines">("factories");
  const [countText, setCountText] = useState("1");
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<SalvoResult | null>(null);

  const count = Math.min(100, Math.max(1, Math.floor(Number(countText) || 0) || 1));
  const spec = MISSILES.find((m) => m.code === missile) ?? null;
  const region = (allRegions ?? []).find((r) => r.id === regionId) ?? null;
  const enemyRegions = (allRegions ?? []).filter((r) => r.country_id === targetCountry);
  const stock = missile && country ? Number(country[missile]) : 0;

  function reset() {
    setMissile(null);
    setTargetCountry(null);
    setRegionId(null);
    setSlotIds([]);
    setCountText("1");
    setPhase("idle");
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
      setPhase("flight");
      window.setTimeout(() => setPhase("result"), 1900);
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => {
      setPhase("idle");
      toast.error(e.message);
    },
  });

  const targetsPicked =
    spec?.code === "missile_3" ? true : slotIds.length > 0 && slotIds.length <= (spec?.targets ?? 0);
  const canLaunch = !!missile && !!regionId && targetsPicked && stock >= count;

  const modeSlots = (r: RegionWithSlots) =>
    r.slots.filter((s) =>
      mode === "factories" ? s.building.startsWith("factory_") : s.building.startsWith("mine_"),
    );

  return (
    <AppShell me={me ?? null} title="Arsenał" subtitle="Rakiety, salwy i obrona OPL">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Rakiety I" value={units(country?.missile_1 ?? 0)} tone="primary" />
        <Stat label="Rakiety II" value={units(country?.missile_2 ?? 0)} tone="primary" />
        <Stat label="Rakiety III" value={units(country?.missile_3 ?? 0)} tone="primary" />
      </div>

      <SectionTitle>Obrona OPL w Twoich regionach</SectionTitle>
      <Panel className="divide-border divide-y p-0">
        {(myRegions ?? []).map((r) => (
          <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2.5">
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
          <p className="text-muted-foreground p-3 text-sm">Brak regionów do obrony.</p>
        ) : null}
      </Panel>
      <p className="text-inactive mt-2 text-xs">
        OPL kupujesz w sklepie dla wybranego regionu. Rakieta I wymaga 1 OPL, II — 2 OPL, III — 10
        OPL w atakowanym regionie. Za mało OPL: żadne nie zostaje zużyte, cele padają.
      </p>

      <SectionTitle>Wystrzel rakietę</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-3">
        {MISSILES.map((m) => (
          <button
            key={m.code}
            type="button"
            onClick={() => {
              setMissile(m.code);
              setSlotIds([]);
            }}
            className={`panel hud-frame p-4 text-left ${
              missile === m.code ? "border-primary/70" : ""
            }`}
          >
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <p className="truncate text-sm font-semibold">{MISSILE_LABELS[m.code]}</p>
              <Rocket
                className={`size-4 shrink-0 ${missile === m.code ? "text-primary" : "text-inactive"}`}
                strokeWidth={1.5}
              />
            </div>
            <p className="text-muted-foreground mt-1 text-xs">{m.effect}</p>
            <p className="text-info mt-1 text-xs">Przechwycenie od {m.requiredAa} OPL</p>
            <p className={`num mt-2 text-xs ${Number(country?.[m.code] ?? 0) === 0 ? "text-inactive" : "text-primary"}`}>
              W arsenale: {units(country?.[m.code] ?? 0)}
            </p>
          </button>
        ))}
      </div>

      {missile ? (
        <>
          <SectionTitle>Cel — państwo</SectionTitle>
          <Panel className="divide-border divide-y p-0">
            {(countries ?? [])
              .filter((c) => c.country_id !== me?.countryId)
              .map((c) => (
                <button
                  key={c.country_id}
                  type="button"
                  onClick={() => {
                    setTargetCountry(c.country_id);
                    setRegionId(null);
                    setSlotIds([]);
                  }}
                  className={`hover:bg-secondary/50 grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 text-left ${
                    targetCountry === c.country_id ? "bg-secondary" : ""
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{c.name}</span>
                    <span className="text-inactive text-[11px] uppercase">
                      Regiony: {c.regions_count} · OPL łącznie: {units(c.region_aa_total)}
                    </span>
                  </span>
                  <ChevronRight className="text-inactive size-4 shrink-0" strokeWidth={1.5} />
                </button>
              ))}
          </Panel>
        </>
      ) : null}

      {targetCountry ? (
        <>
          <SectionTitle>Cel — region</SectionTitle>
          <Panel className="divide-border divide-y p-0">
            {enemyRegions.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setRegionId(r.id);
                  setSlotIds([]);
                }}
                className={`hover:bg-secondary/50 grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 text-left ${
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
                  className={`num shrink-0 text-xs ${r.aa_defense === 0 ? "text-inactive" : "text-info"}`}
                >
                  {units(r.aa_defense)} OPL
                </span>
              </button>
            ))}
            {enemyRegions.length === 0 ? (
              <p className="text-muted-foreground p-3 text-sm">To państwo nie ma regionów.</p>
            ) : null}
          </Panel>
        </>
      ) : null}

      {region && spec ? (
        <>
          <SectionTitle>Cel — obiekty</SectionTitle>
          {spec.code === "missile_3" ? (
            <div className="grid grid-cols-2 gap-2">
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
                  className={`rounded-sm border px-3 py-2.5 text-xs tracking-[0.1em] uppercase ${
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
            <Panel className="divide-border divide-y p-0">
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
                    className={`hover:bg-secondary/50 grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 text-left ${
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
                <p className="text-muted-foreground p-3 text-sm">Region jest pusty.</p>
              ) : null}
            </Panel>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <label htmlFor="salvo" className="label-hud">
                Salwa — liczba rakiet
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
            <Button
              className="sm:w-48"
              disabled={!canLaunch}
              onClick={() => setPhase("confirm")}
            >
              <Target className="mr-1.5 size-4" strokeWidth={1.5} /> Wystrzel
            </Button>
          </div>
        </>
      ) : null}

      <SectionTitle>Dziennik operacji rakietowych</SectionTitle>
      <Panel className="divide-border divide-y p-0">
        {(strikes ?? []).slice(0, 15).map((s) => (
          <div key={s.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm">
                {MISSILE_LABELS[s.missile_code]} — region {s.region_name}
              </p>
              <p className="text-inactive text-[11px]">
                {dateTime(s.created_at)} · OPL regionu {units(s.region_aa ?? s.aa_defense)} / wymagane{" "}
                {units(s.required_aa ?? 0)}
              </p>
            </div>
            <p
              className={`shrink-0 text-xs tracking-[0.1em] uppercase ${
                s.result === "PRZECHWYCONA" ? "text-info" : "text-destructive"
              }`}
            >
              {s.result}
            </p>
          </div>
        ))}
        {strikes && strikes.length === 0 ? (
          <p className="text-muted-foreground p-3 text-sm">Brak operacji rakietowych.</p>
        ) : null}
      </Panel>

      <Dialog
        open={phase !== "idle"}
        onOpenChange={(o) => {
          if (!o) {
            setPhase("idle");
            if (phase === "result") reset();
          }
        }}
      >
        <DialogContent className="admin-dialog max-h-[85vh] overflow-y-auto">
          {phase === "confirm" ? (
            <>
              <DialogHeader>
                <DialogTitle className="tracking-[0.14em] uppercase">
                  Autoryzacja odpalenia
                </DialogTitle>
                <DialogDescription>
                  Operacja jest nieodwracalna. Rakiety zużywają się niezależnie od wyniku.
                </DialogDescription>
              </DialogHeader>
              <div className="panel hud-frame space-y-1.5 p-3 text-xs">
                <Row k="Rakieta" v={missile ? (MISSILE_LABELS[missile] ?? missile) : ""} />
                <Row k="Liczba rakiet" v={units(count)} />
                <Row
                  k="Cel"
                  v={`${countries?.find((c) => c.country_id === targetCountry)?.name ?? ""} — ${region?.name ?? ""}`}
                />
                <Row
                  k="Obiekty"
                  v={
                    spec?.code === "missile_3"
                      ? mode === "factories"
                        ? "Wszystkie fabryki"
                        : "Wszystkie zakłady surowcowe"
                      : `${slotIds.length} wybranych`
                  }
                />
                <Row k="OPL regionu" v={units(region?.aa_defense ?? 0)} />
                <Row k="Wymagane OPL do przechwycenia" v={units(spec?.requiredAa ?? 0)} />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setPhase("idle")}>
                  Anuluj
                </Button>
                <Button
                  className="flex-1"
                  disabled={launch.isPending}
                  onClick={() => launch.mutate()}
                >
                  {launch.isPending ? "Odpalam…" : "Odpal"}
                </Button>
              </div>
            </>
          ) : null}

          {phase === "flight" ? (
            <>
              <DialogHeader>
                <DialogTitle className="tracking-[0.14em] uppercase">
                  Trajektoria — w powietrzu
                </DialogTitle>
                <DialogDescription>Namierzanie regionu {region?.name}</DialogDescription>
              </DialogHeader>
              <div className="panel relative h-24 overflow-hidden p-3">
                <div className="border-primary/40 absolute inset-x-3 top-1/2 border-t border-dashed" />
                <Rocket
                  className="text-primary absolute top-1/2 size-5 -translate-y-1/2 animate-[flight_1.8s_linear_forwards]"
                  strokeWidth={1.5}
                />
                <Target className="text-destructive absolute top-1/2 right-3 size-5 -translate-y-1/2" strokeWidth={1.5} />
              </div>
              <p className="label-hud text-center">Analiza obrony przeciwlotniczej…</p>
            </>
          ) : null}

          {phase === "result" && result ? (
            <>
              <DialogHeader>
                <DialogTitle className="tracking-[0.14em] uppercase">Raport operacji</DialogTitle>
                <DialogDescription>Region {region?.name}</DialogDescription>
              </DialogHeader>
              <div className="panel hud-frame space-y-1.5 p-3 text-xs">
                <Row k="Wystrzelone" v={units(result.launched ?? 0)} />
                <Row k="Przechwycone (INTERCEPTED)" v={units(result.intercepted ?? 0)} />
                <Row k="Trafienia (IMPACT)" v={units(result.impacts ?? 0)} />
                <Row k="Zniszczone obiekty" v={units(result.destroyed ?? 0)} />
                {result.stopped_reason ? (
                  <p className="text-destructive pt-1">{result.stopped_reason}</p>
                ) : null}
              </div>
              <Button
                onClick={() => {
                  setPhase("idle");
                  reset();
                }}
              >
                Zamknij raport
              </Button>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground uppercase">{k}</span>
      <span className="num text-foreground text-right">{v}</span>
    </div>
  );
}
