import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Panel } from "@/components/stat";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { countriesQuery, meQuery, occupiedRegionsQuery, regionsQuery, rpc, shopQuery } from "@/lib/api";
import type { RegionWithSlots, ShopItem } from "@/lib/api";
import { BUILDING_LABELS, RESOURCE_LABELS, fmtKR, units } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/regiony")({
  head: () => ({
    meta: [
      { title: "Regiony — COUNTRY RP" },
      {
        name: "description",
        content: "Zarządzaj 9 slotami w każdym regionie: fabryki, wytwórnie i fortyfikacje.",
      },
      { property: "og:title", content: "Regiony — COUNTRY RP" },
      {
        property: "og:description",
        content: "Zarządzaj 9 slotami w każdym regionie: fabryki, wytwórnie i fortyfikacje.",
      },
    ],
  }),
  component: Regions,
});

const RESOURCES = ["coal", "oil", "copper", "iron", "uranium"] as const;

function slotBlockReason(region: RegionWithSlots, item: ShopItem): string | null {
  const b = item.building!;
  if (b.startsWith("mine_")) {
    const existing = region.slots.find((s) => s.building.startsWith("mine_"));
    if (existing && existing.building !== b) {
      return `W regionie stoją już wytwórnie: ${BUILDING_LABELS[existing.building]}`;
    }
    if (region.slots.filter((s) => s.building === b).length >= 3) {
      return "Limit 3 wytwórni tego surowca w regionie";
    }
  }
  if (b.startsWith("fort_") && region.slots.some((s) => s.building.startsWith("fort_"))) {
    return "W regionie może stać tylko jedna fortyfikacja";
  }
  return null;
}

function Regions() {
  const { data: me } = useQuery(meQuery);
  const { data: countries } = useQuery(countriesQuery);
  const { data: shop } = useQuery(shopQuery);
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const countryId = selected ?? me?.countryId ?? null;
  const { data: regions } = useQuery(regionsQuery(countryId));
  const { data: occupiedRegions } = useQuery(occupiedRegionsQuery(me?.countryId));
  const country = countries?.find((c) => c.country_id === countryId);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [buildFor, setBuildFor] = useState<RegionWithSlots | null>(null);
  const [occupied, setOccupied] = useState<{ id: string; building: string; region: string } | null>(
    null,
  );

  const build = useMutation({
    mutationFn: (v: { regionId: string; index: number; code: string }) =>
      rpc("build_in_slot", {
        p_region_id: v.regionId,
        p_slot_index: v.index,
        p_item_code: v.code,
      }),
    onSuccess: () => {
      toast.success("Obiekt wybudowany");
      setBuildFor(null);
      void queryClient.invalidateQueries({ queryKey: ["regions"] });
    void queryClient.invalidateQueries({ queryKey: ["country_stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const demolish = useMutation({
    mutationFn: (slotId: string) => rpc("demolish_slot", { p_slot_id: slotId }),
    onSuccess: () => {
      toast.success("Obiekt rozebrany");
      setOccupied(null);
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const buildings = (shop ?? []).filter((i) => i.building);

  function firstFreeSlot(region: RegionWithSlots): number | null {
    for (let i = 1; i <= 9; i++) {
      if (!region.slots.some((s) => s.slot_index === i)) return i;
    }
    return null;
  }

  return (
    <AppShell
      me={me ?? null}
      title="Regiony"
      subtitle={country ? `${country.name} — 9 slotów w regionie` : undefined}
    >
      {me?.isAdmin ? (
        <div className="mb-4 max-w-xs">
          <Select value={countryId ?? ""} onValueChange={(v) => setSelected(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Wybierz państwo" />
            </SelectTrigger>
            <SelectContent>
              {(countries ?? []).map((c) => (
                <SelectItem key={c.country_id} value={c.country_id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="region-overview">
        <div>
          <p className="label-hud">TERRITORY CONTROL</p>
          <h2 className="mt-1 text-xl font-semibold">Zarządzanie regionami</h2>
          <p className="mt-1 text-sm text-muted-foreground">Rozbudowuj infrastrukturę, kontroluj sloty i utrzymuj obronę każdego regionu.</p>
        </div>
        <div className="region-overview-count"><span>REGIONY</span><strong>{regions?.length ?? 0}</strong></div>
      </div>

      {country ? (
        <Panel className="hud-frame mb-4 overflow-x-auto p-0">
          <div className="divide-border grid min-w-max grid-cols-6 divide-x text-xs">
            <div className="min-w-24 px-3 py-2.5">
              <p className="label-hud">Skarbiec</p>
              <p className="num text-primary mt-1">{fmtKR(country.balance)}</p>
            </div>
            {RESOURCES.map((r) => (
              <div key={r} className="min-w-24 px-3 py-2.5">
                <p className="label-hud">{RESOURCE_LABELS[r]}</p>
                <p
                  className={`num mt-1 ${Number(country[r]) === 0 ? "text-inactive" : "text-foreground"}`}
                >
                  {units(country[r])}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      {!countryId ? (
        <Panel className="p-4">
          <p className="text-muted-foreground text-sm">
            Nie masz przypisanego państwa — poproś administratora gry.
          </p>
        </Panel>
      ) : null}

      {occupiedRegions?.length ? (
        <div className="mb-4 space-y-2">
          <p className="label-hud">OKUPOWANE REGIONY</p>
          {occupiedRegions.map((r) => {
            const effects = (r.slots ?? []).reduce((acc, slot) => {
              const item = (shop ?? []).find((shopItem) => shopItem.building === slot.building);
              if (!item) return acc;
              acc.kr += Number(item.income_kr ?? 0);
              if (item.produces) acc.resources[item.produces] = (acc.resources[item.produces] ?? 0) + Number(item.produces_amount ?? 0);
              acc.coalUpkeep += Number(item.upkeep_coal ?? 0);
              return acc;
            }, { kr: 0, coalUpkeep: 0, resources: {} as Record<string, number> });
            return (
              <Panel key={r.id} className="border-destructive/40 bg-destructive/5 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><p className="text-sm font-semibold">{r.name}</p><p className="text-xs text-muted-foreground">OKUPOWANY przez {r.occupier_country_name} · od {new Date(r.occupied_at).toLocaleString("pl-PL")}</p></div>
                  <span className="text-xs font-semibold text-destructive">NIE JEST POD TWOJĄ KONTROLĄ</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="border border-border bg-secondary/30 p-2"><p className="label-hud">TRACISZ KR</p><p className="num mt-1 text-sm text-destructive">−{fmtKR(effects.kr)} / doba</p></div>
                  {Object.entries(effects.resources).map(([resource, value]) => <div key={resource} className="border border-border bg-secondary/30 p-2"><p className="label-hud">TRACISZ {RESOURCE_LABELS[resource] ?? resource}</p><p className="num mt-1 text-sm text-destructive">−{units(value)} / doba</p></div>)}
                  {effects.coalUpkeep > 0 ? <div className="border border-border bg-secondary/30 p-2"><p className="label-hud">ZUŻYCIE WĘGLA</p><p className="num mt-1 text-sm text-muted-foreground">−{units(effects.coalUpkeep)} / doba</p></div> : null}
                </div>
              </Panel>
            );
          })}
        </div>
      ) : null}

      <div className="space-y-2">
        {(regions ?? []).map((r) => {
          const open = expanded === r.id;
          const free = 9 - r.slots.length;
          return (
            <Panel key={r.id} className="hud-frame p-0">
              <button
                onClick={() => setExpanded(open ? null : r.id)}
                className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-3 py-3 text-left"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{r.name}</p>
                  <p className="text-inactive text-[11px] tracking-[0.12em] uppercase">
                    {free === 0 ? "brak wolnych slotów" : `${free} wolnych slotów`}
                  </p>
                </div>
                <span className="shrink-0 text-right">
                  <span
                    className={`num block text-sm ${r.slots.length === 0 ? "text-inactive" : "text-primary"}`}
                  >
                    SLOTY {r.slots.length}/9
                  </span>
                  <span
                    className={`num block text-[11px] ${r.aa_defense === 0 ? "text-inactive" : "text-info"}`}
                  >
                    {units(r.aa_defense)} OPL
                  </span>
                </span>
                <ChevronDown
                  className={`text-muted-foreground size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
                  strokeWidth={1.5}
                />
              </button>

              {open ? (
                <div className="border-border/70 border-t p-3">
                  <div className="divide-border/70 divide-y">
                    {r.slots.map((s) => (
                      <div
                        key={s.id}
                        className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-2"
                      >
                        <span className="num text-inactive text-xs">{s.slot_index}</span>
                        <p className="truncate text-sm">{BUILDING_LABELS[s.building]}</p>
                        <button
                          className="text-inactive hover:text-destructive shrink-0"
                          onClick={() =>
                            setOccupied({ id: s.id, building: s.building, region: r.name })
                          }
                        >
                          <Trash2 className="size-4" strokeWidth={1.5} />
                        </button>
                      </div>
                    ))}
                    {r.slots.length === 0 ? (
                      <p className="text-inactive py-2 text-xs">Region jest pusty.</p>
                    ) : null}
                  </div>
                  <Button
                    className="mt-3 w-full"
                    disabled={free === 0}
                    onClick={() => setBuildFor(r)}
                  >
                    <Plus className="mr-1.5 size-4" strokeWidth={1.5} />
                    {free === 0 ? "Brak wolnych slotów" : "Zbuduj obiekt"}
                  </Button>
                </div>
              ) : null}
            </Panel>
          );
        })}
      </div>

      {regions && regions.length === 0 && countryId ? (
        <Panel className="p-4">
          <p className="text-muted-foreground text-sm">
            To państwo nie ma jeszcze regionów. Administrator dodaje je w panelu.
          </p>
        </Panel>
      ) : null}

      <Drawer open={!!buildFor} onOpenChange={(o) => !o && setBuildFor(null)}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader>
            <DrawerTitle className="tracking-[0.14em] uppercase">
              Budowa — {buildFor?.name}
            </DrawerTitle>
          </DrawerHeader>
          <div className="space-y-2 overflow-y-auto px-4 pb-8">
            {buildings.map((item) => {
              const reason = buildFor ? slotBlockReason(buildFor, item) : null;
              const tooPoor = country ? Number(country.balance) < Number(item.cost_kr) : false;
              const blocked = !!reason || tooPoor;
              return (
                <button
                  key={item.code}
                  disabled={blocked || build.isPending}
                  onClick={() => {
                    if (!buildFor) return;
                    const index = firstFreeSlot(buildFor);
                    if (!index) {
                      toast.error("Region nie ma wolnych slotów");
                      return;
                    }
                    build.mutate({ regionId: buildFor.id, index, code: item.code });
                  }}
                  className={`panel w-full p-3 text-left ${blocked ? "opacity-45" : "hover:border-primary/60"}`}
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <p className="truncate text-sm font-semibold">{item.name}</p>
                    <p className="num text-primary shrink-0 text-xs">{fmtKR(item.cost_kr)}</p>
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">{item.description}</p>
                  {Number(item.income_kr) > 0 ? (
                    <p className="text-success mt-1 text-xs">+{fmtKR(item.income_kr)} / doba</p>
                  ) : null}
                  {item.produces ? (
                    <p className="text-success mt-1 text-xs">
                      +{units(item.produces_amount)}{" "}
                      {RESOURCE_LABELS[item.produces] ?? item.produces} / doba
                    </p>
                  ) : null}
                  {Number(item.cost_iron) > 0 ? (
                    <p className="text-muted-foreground mt-1 text-xs uppercase">
                      Żelazo: <span className="num">{units(item.cost_iron)}</span>
                    </p>
                  ) : null}
                  {reason ? <p className="text-destructive mt-1 text-xs">{reason}</p> : null}
                  {!reason && tooPoor ? (
                    <p className="text-destructive mt-1 text-xs">Za mało KR w skarbcu</p>
                  ) : null}
                </button>
              );
            })}
          </div>
        </DrawerContent>
      </Drawer>

      <Dialog open={!!occupied} onOpenChange={(o) => !o && setOccupied(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{occupied ? BUILDING_LABELS[occupied.building] : ""}</DialogTitle>
            <DialogDescription>
              {occupied?.region} — pierwsze 24 godziny: zwrot 100% kosztu budowy. Po 24 godzinach: zwrot 75%.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setOccupied(null)}>
              Anuluj
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={demolish.isPending}
              onClick={() => occupied && demolish.mutate(occupied.id)}
            >
              Rozbierz
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
