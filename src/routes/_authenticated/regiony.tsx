import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Panel, SectionTitle } from "@/components/stat";
import { Button } from "@/components/ui/button";
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
import { countriesQuery, meQuery, regionsQuery, rpc, shopQuery } from "@/lib/api";
import type { RegionWithSlots, ShopItem } from "@/lib/api";
import { BUILDING_LABELS, krShort, units } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/regiony")({
  component: Regions,
});

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
  const country = countries?.find((c) => c.country_id === countryId);
  const [target, setTarget] = useState<{ region: RegionWithSlots; index: number } | null>(null);
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
      setTarget(null);
      queryClient.invalidateQueries();
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

  return (
    <AppShell
      me={me ?? null}
      title="Regiony"
      subtitle={country ? `${country.flag} ${country.name} — 9 slotów w regionie` : undefined}
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
                  {c.flag} {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {country ? (
        <Panel className="mb-4">
          <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <div>
              <p className="text-muted-foreground">Skarbiec</p>
              <p className="num text-primary">{krShort(country.balance)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Węgiel</p>
              <p className="num">{units(country.coal)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Żelazo</p>
              <p className="num">{units(country.iron)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Miedź</p>
              <p className="num">{units(country.copper)}</p>
            </div>
          </div>
        </Panel>
      ) : null}

      {!countryId ? (
        <Panel>
          <p className="text-muted-foreground text-sm">
            Nie masz przypisanego państwa — poproś administratora gry.
          </p>
        </Panel>
      ) : null}

      {(regions ?? []).map((r) => (
        <div key={r.id}>
          <SectionTitle>
            {r.name} — {r.slots.length}/9 slotów
          </SectionTitle>
          <div className="grid grid-cols-3 gap-2 sm:max-w-md">
            {Array.from({ length: 9 }, (_, i) => i + 1).map((idx) => {
              const slot = r.slots.find((s) => s.slot_index === idx);
              return (
                <button
                  key={idx}
                  onClick={() =>
                    slot
                      ? setOccupied({ id: slot.id, building: slot.building, region: r.name })
                      : setTarget({ region: r, index: idx })
                  }
                  className={`flex aspect-square flex-col items-center justify-center rounded-lg border p-1.5 text-center text-[10px] leading-tight transition-colors ${
                    slot
                      ? "border-primary/50 bg-primary/10 hover:bg-primary/20"
                      : "border-border/70 text-muted-foreground hover:border-primary/60 border-dashed"
                  }`}
                >
                  <span className="num mb-1 text-[9px] opacity-60">{idx}</span>
                  {slot ? BUILDING_LABELS[slot.building] : "+ wolny"}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {regions && regions.length === 0 && countryId ? (
        <Panel>
          <p className="text-muted-foreground text-sm">
            To państwo nie ma jeszcze regionów. Administrator dodaje je w panelu.
          </p>
        </Panel>
      ) : null}

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Budowa w slocie {target?.index}</DialogTitle>
            <DialogDescription>{target?.region.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {buildings.map((item) => {
              const reason = target ? slotBlockReason(target.region, item) : null;
              const tooPoor = country ? Number(country.balance) < Number(item.cost_kr) : false;
              const blocked = !!reason || tooPoor;
              return (
                <button
                  key={item.code}
                  disabled={blocked || build.isPending}
                  onClick={() =>
                    target &&
                    build.mutate({ regionId: target.region.id, index: target.index, code: item.code })
                  }
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    blocked
                      ? "border-border/50 opacity-45"
                      : "border-border hover:border-primary/60 hover:bg-secondary/60"
                  }`}
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <p className="truncate text-sm font-semibold">{item.name}</p>
                    <p className="num text-accent shrink-0 text-xs">{krShort(item.cost_kr)}</p>
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">{item.description}</p>
                  {Number(item.income_kr) > 0 ? (
                    <p className="text-primary mt-1 text-xs">+{krShort(item.income_kr)} / doba</p>
                  ) : null}
                  {item.produces ? (
                    <p className="text-primary mt-1 text-xs">
                      +{units(item.produces_amount)} {BUILDING_LABELS[item.building!] ?? ""} / doba
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
        </DialogContent>
      </Dialog>

      <Dialog open={!!occupied} onOpenChange={(o) => !o && setOccupied(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{occupied ? BUILDING_LABELS[occupied.building] : ""}</DialogTitle>
            <DialogDescription>
              {occupied?.region} — rozbiórka zwalnia slot, ale nie zwraca kosztów.
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
