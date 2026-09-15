import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Rocket, ShieldCheck, Target } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Panel, SectionTitle, Stat } from "@/components/stat";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { allRegionsQuery, countriesQuery, meQuery, rpc, strikesQuery } from "@/lib/api";
import type { RegionWithSlots } from "@/lib/api";
import { BUILDING_LABELS, MISSILE_LABELS, dateTime, units } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/arsenal")({
  head: () => ({
    meta: [
      { title: "Arsenał — COUNTRY RP" },
      {
        name: "description",
        content: "Rakiety, obrona przeciwlotnicza i dziennik operacji rakietowych twojego państwa.",
      },
      { property: "og:title", content: "Arsenał — COUNTRY RP" },
      {
        property: "og:description",
        content: "Rakiety, obrona przeciwlotnicza i dziennik operacji rakietowych.",
      },
    ],
  }),
  component: Arsenal,
});

const MISSILES = [
  {
    code: "missile_1",
    targets: 1,
    aa: 1,
    desc: "Niszczy 1 wybrany budynek w regionie.",
  },
  {
    code: "missile_2",
    targets: 2,
    aa: 2,
    desc: "Niszczy 2 wybrane budynki w regionie.",
  },
  {
    code: "missile_3",
    targets: 0,
    aa: 10,
    desc: "Niszczy wszystkie fabryki ALBO wszystkie wytwórnie surowców w regionie.",
  },
] as const;

type Step = "missile" | "country" | "region" | "target" | "confirm";

function Arsenal() {
  const { data: me } = useQuery(meQuery);
  const { data: countries } = useQuery(countriesQuery);
  const { data: regions } = useQuery(allRegionsQuery);
  const { data: strikes } = useQuery(strikesQuery);
  const queryClient = useQueryClient();

  const country = countries?.find((c) => c.country_id === me?.countryId);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("missile");
  const [missile, setMissile] = useState<string | null>(null);
  const [targetCountry, setTargetCountry] = useState<string | null>(null);
  const [region, setRegion] = useState<RegionWithSlots | null>(null);
  const [slotIds, setSlotIds] = useState<string[]>([]);
  const [mode, setMode] = useState<"factories" | "mines">("factories");

  const spec = MISSILES.find((m) => m.code === missile);
  const defender = countries?.find((c) => c.country_id === targetCountry);

  const countryRegions = useMemo(
    () => (regions ?? []).filter((r) => r.country_id === targetCountry),
    [regions, targetCountry],
  );

  const modeTargets = useMemo(() => {
    if (!region) return [];
    return region.slots.filter((s) =>
      mode === "factories" ? s.building.startsWith("factory_") : s.building.startsWith("mine_"),
    );
  }, [region, mode]);

  function reset() {
    setStep("missile");
    setMissile(null);
    setTargetCountry(null);
    setRegion(null);
    setSlotIds([]);
    setMode("factories");
  }

  const launch = useMutation({
    mutationFn: () =>
      rpc<{ result: string }>("launch_missile", {
        p_country_id: me?.countryId,
        p_missile_code: missile,
        p_region_id: region?.id,
        p_slot_ids: slotIds,
        p_mode: mode,
      }),
    onSuccess: (res) => {
      if (res?.result === "PRZECHWYCONA") toast.error("Rakieta PRZECHWYCONA przez OPL celu");
      else toast.success("CEL ZNISZCZONY");
      setOpen(false);
      reset();
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const inventory = (code: string) => {
    if (!country) return 0;
    if (code === "missile_1") return country.missile_1;
    if (code === "missile_2") return country.missile_2;
    return country.missile_3;
  };

  const nameOf = (id: string | null) =>
    countries?.find((c) => c.country_id === id)?.name ?? "nieznane";
  const flagOf = (id: string | null) => countries?.find((c) => c.country_id === id)?.flag ?? "";

  return (
    <AppShell
      me={me ?? null}
      title="Arsenał"
      subtitle={country ? `${country.flag} ${country.name}` : "Brak przypisanego państwa"}
    >
      {!country ? (
        <Panel className="hud-frame p-4">
          <p className="text-muted-foreground text-sm">
            Arsenał będzie dostępny po przypisaniu państwa przez administratora.
          </p>
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="OPL"
              value={units(country.aa_defense)}
              hint="Nie zużywa się w obronie"
              tone="primary"
              icon={<ShieldCheck className="size-4" strokeWidth={1.5} />}
            />
            <Stat label="Rakieta I" value={units(country.missile_1)} hint="1 budynek" />
            <Stat label="Rakieta II" value={units(country.missile_2)} hint="2 budynki" />
            <Stat label="Rakieta III" value={units(country.missile_3)} hint="Cały typ w regionie" />
          </div>

          <Button
            className="mt-4 w-full py-6 text-sm tracking-[0.2em] uppercase"
            onClick={() => {
              reset();
              setOpen(true);
            }}
          >
            <Rocket className="mr-2 size-4" strokeWidth={1.5} /> Wystrzel rakietę
          </Button>

          <Panel className="mt-4 p-4">
            <p className="label-hud">Obrona przeciwlotnicza</p>
            <ul className="text-muted-foreground mt-2 space-y-1 text-xs">
              <li>Rakieta I zostaje przechwycona przy 1 lub więcej OPL celu.</li>
              <li>Rakieta II — przy 2 lub więcej OPL.</li>
              <li>Rakieta III — przy 10 lub więcej OPL.</li>
              <li>OPL nigdy się nie zużywa, rakieta zużywa się także po przechwyceniu.</li>
            </ul>
          </Panel>
        </>
      )}

      <SectionTitle>Dziennik operacji rakietowych</SectionTitle>
      <Panel className="divide-border divide-y p-0">
        {(strikes ?? []).map((s) => {
          const mine = s.attacker_country_id === me?.countryId;
          const intercepted = s.result === "PRZECHWYCONA";
          return (
            <div key={s.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm">
                  {flagOf(s.attacker_country_id)} {nameOf(s.attacker_country_id)} →{" "}
                  {flagOf(s.defender_country_id)} {nameOf(s.defender_country_id)}
                </p>
                <p className="text-muted-foreground text-xs">
                  {MISSILE_LABELS[s.missile_code] ?? s.missile_code} · {s.region_name} · OPL{" "}
                  {s.aa_defense} · {dateTime(s.created_at)}
                </p>
                {s.destroyed.length > 0 ? (
                  <p className="text-destructive mt-1 text-xs">
                    Zniszczone: {s.destroyed.map((d) => BUILDING_LABELS[d.building]).join(", ")}
                  </p>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <p
                  className={`text-[10px] tracking-[0.14em] uppercase ${
                    intercepted ? "text-info" : "text-destructive"
                  }`}
                >
                  {s.result}
                </p>
                <p className="text-inactive text-[10px] uppercase">
                  {mine ? "atak" : s.defender_country_id === me?.countryId ? "obrona" : "raport"}
                </p>
              </div>
            </div>
          );
        })}
        {strikes && strikes.length === 0 ? (
          <p className="text-muted-foreground p-3 text-sm">Brak operacji rakietowych.</p>
        ) : null}
      </Panel>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="tracking-[0.14em] uppercase">Wystrzel rakietę</DialogTitle>
            <DialogDescription>
              {step === "missile"
                ? "Wybierz rakietę z arsenału"
                : step === "country"
                  ? "Wybierz państwo celu"
                  : step === "region"
                    ? "Wybierz region celu"
                    : step === "target"
                      ? "Wybierz cel uderzenia"
                      : "Potwierdzenie operacji"}
            </DialogDescription>
          </DialogHeader>

          {step === "missile" ? (
            <div className="space-y-2">
              {MISSILES.map((m) => {
                const have = inventory(m.code);
                return (
                  <button
                    key={m.code}
                    disabled={have < 1}
                    onClick={() => {
                      setMissile(m.code);
                      setStep("country");
                    }}
                    className="panel hud-frame w-full p-3 text-left disabled:opacity-40"
                  >
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                      <p className="text-sm font-semibold">{MISSILE_LABELS[m.code]}</p>
                      <p className="num text-primary text-xs">{have} szt.</p>
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs">{m.desc}</p>
                    <p className="text-info mt-1 text-xs">
                      Przechwytywana przy {m.aa} OPL i więcej
                    </p>
                  </button>
                );
              })}
            </div>
          ) : null}

          {step === "country" ? (
            <div className="space-y-2">
              {(countries ?? [])
                .filter((c) => c.country_id !== me?.countryId)
                .map((c) => (
                  <button
                    key={c.country_id}
                    onClick={() => {
                      setTargetCountry(c.country_id);
                      setStep("region");
                    }}
                    className="panel w-full p-3 text-left"
                  >
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                      <p className="truncate text-sm font-semibold">
                        {c.flag} {c.name}
                      </p>
                      <p className="num text-info text-xs">OPL {c.aa_defense}</p>
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {c.regions_count} regionów
                    </p>
                  </button>
                ))}
            </div>
          ) : null}

          {step === "region" ? (
            <div className="space-y-2">
              {countryRegions.map((r) => (
                <button
                  key={r.id}
                  disabled={r.slots.length === 0}
                  onClick={() => {
                    setRegion(r);
                    setSlotIds([]);
                    setStep("target");
                  }}
                  className="panel w-full p-3 text-left disabled:opacity-40"
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <p className="truncate text-sm font-semibold">{r.name}</p>
                    <p className="num text-muted-foreground text-xs">{r.slots.length}/9</p>
                  </div>
                </button>
              ))}
              {countryRegions.length === 0 ? (
                <p className="text-muted-foreground text-sm">To państwo nie ma regionów.</p>
              ) : null}
            </div>
          ) : null}

          {step === "target" && region ? (
            <div className="space-y-2">
              {missile === "missile_3" ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {(["factories", "mines"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setMode(m)}
                        className={`panel p-3 text-xs uppercase ${
                          mode === m ? "border-primary text-primary" : "text-muted-foreground"
                        }`}
                      >
                        {m === "factories" ? "Wszystkie fabryki" : "Wszystkie wytwórnie"}
                      </button>
                    ))}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Cele w regionie: {modeTargets.length}
                  </p>
                  <ul className="text-muted-foreground space-y-1 text-xs">
                    {modeTargets.map((s) => (
                      <li key={s.id}>
                        Slot {s.slot_index} — {BUILDING_LABELS[s.building]}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full"
                    disabled={modeTargets.length === 0}
                    onClick={() => setStep("confirm")}
                  >
                    Dalej
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground text-xs">
                    Wybierz maksymalnie {spec?.targets} budynek/budynki
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {region.slots.map((s) => {
                      const picked = slotIds.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          onClick={() =>
                            setSlotIds((prev) =>
                              prev.includes(s.id)
                                ? prev.filter((x) => x !== s.id)
                                : prev.length >= (spec?.targets ?? 1)
                                  ? prev
                                  : [...prev, s.id],
                            )
                          }
                          className={`rounded-sm border p-2 text-[10px] leading-tight ${
                            picked
                              ? "border-destructive text-destructive bg-destructive/10"
                              : "border-border text-muted-foreground"
                          }`}
                        >
                          <span className="num block opacity-60">{s.slot_index}</span>
                          {BUILDING_LABELS[s.building]}
                        </button>
                      );
                    })}
                  </div>
                  <Button
                    className="w-full"
                    disabled={slotIds.length === 0}
                    onClick={() => setStep("confirm")}
                  >
                    Dalej
                  </Button>
                </>
              )}
            </div>
          ) : null}

          {step === "confirm" ? (
            <div className="space-y-3">
              <div className="panel hud-frame space-y-1.5 p-3 text-xs">
                <Row label="Rakieta" value={MISSILE_LABELS[missile ?? ""] ?? ""} />
                <Row label="Państwo celu" value={`${flagOf(targetCountry)} ${nameOf(targetCountry)}`} />
                <Row label="Region" value={region?.name ?? ""} />
                <Row
                  label="Liczba celów"
                  value={String(missile === "missile_3" ? modeTargets.length : slotIds.length)}
                />
                <Row label="OPL obrońcy" value={String(defender?.aa_defense ?? 0)} />
                <Row
                  label="Prognoza"
                  value={
                    (defender?.aa_defense ?? 0) >= (spec?.aa ?? 1)
                      ? "Ryzyko przechwycenia"
                      : "Obrona niewystarczająca"
                  }
                />
              </div>
              <p className="text-destructive text-xs">
                Operacja jest nieodwracalna — rakieta zostanie zużyta niezależnie od wyniku.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep("target")}>
                  Wróć
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={launch.isPending}
                  onClick={() => launch.mutate()}
                >
                  <Target className="mr-2 size-4" strokeWidth={1.5} />
                  {launch.isPending ? "Odpalam…" : "Odpal"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="num text-right">{value}</span>
    </div>
  );
}
