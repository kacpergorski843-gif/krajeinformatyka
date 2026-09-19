import { createFileRoute, Link } from "@tanstack/react-router";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { countriesQuery, meQuery, regionsQuery, rpc, shopQuery } from "@/lib/api";
import type { RegionWithSlots, ShopItem } from "@/lib/api";
import { BUILDING_LABELS, RESOURCE_LABELS, fmtKR, fmtNum, kr, units } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/sklep")({
  head: () => ({
    meta: [
      { title: "Sklep — COUNTRY RP" },
      {
        name: "description",
        content: "Kup fabryki, wytwórnie, wojsko i obronę przeciwlotniczą za KR i surowce.",
      },
      { property: "og:title", content: "Sklep — COUNTRY RP" },
      {
        property: "og:description",
        content: "Kup fabryki, wytwórnie, wojsko i obronę przeciwlotniczą za KR i surowce.",
      },
    ],
  }),
  component: Shop,
});

const RESOURCES = ["coal", "oil", "copper", "iron", "uranium"] as const;
type Resource = (typeof RESOURCES)[number];

function unitCost(item: ShopItem, r: Resource): number {
  return Number(item[`cost_${r}` as keyof ShopItem] as string);
}

function buildBlockReason(region: RegionWithSlots, building: string): string | null {
  if (region.slots.length >= 9) return "Brak wolnych slotów";
  if (building.startsWith("mine_")) {
    const existing = region.slots.find((s) => s.building.startsWith("mine_"));
    if (existing && existing.building !== building) {
      return `W regionie stoją wytwórnie: ${BUILDING_LABELS[existing.building]}`;
    }
    if (region.slots.filter((s) => s.building === building).length >= 3) {
      return "Limit 3 wytwórni tego surowca";
    }
  }
  if (building.startsWith("fort_") && region.slots.some((s) => s.building.startsWith("fort_"))) {
    return "Region ma już fortyfikację";
  }
  return null;
}

function firstFreeSlot(region: RegionWithSlots): number | null {
  for (let i = 1; i <= 9; i++) {
    if (!region.slots.some((s) => s.slot_index === i)) return i;
  }
  return null;
}

function Shop() {
  const { data: me } = useQuery(meQuery);
  const { data: countries } = useQuery(countriesQuery);
  const { data: shop } = useQuery(shopQuery);
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const countryId = selected ?? me?.countryId ?? null;
  const country = countries?.find((c) => c.country_id === countryId);
  const { data: regions } = useQuery(regionsQuery(countryId));
  const [item, setItem] = useState<ShopItem | null>(null);
  const [regionId, setRegionId] = useState<string | null>(null);
  const [qtyText, setQtyText] = useState("1");
  const qty = Math.max(1, Math.floor(Number(qtyText) || 0) || 1);

  const isBuilding = !!item?.building;
  const coalHave = Number(country?.coal ?? 0);
  const coalProd = Number(country?.coal_prod ?? 0);
  const coalUse = Number(country?.coal_upkeep ?? 0);
  const coalLeft = coalHave + coalProd - coalUse;
  const region = (regions ?? []).find((r) => r.id === regionId) ?? null;

  function openItem(i: ShopItem) {
    setItem(i);
    setQtyText("1");
    setRegionId(null);
  }

  const buy = useMutation({
    mutationFn: async (v: { item: ShopItem; qty: number }) => {
      if (v.item.building) {
        if (!region) throw new Error("Wybierz region");
        const index = firstFreeSlot(region);
        if (!index) throw new Error("Region nie ma wolnych slotów");
        return rpc("build_in_slot", {
          p_region_id: region.id,
          p_slot_index: index,
          p_item_code: v.item.code,
        });
      }
      if (v.item.code === "aa") {
        if (!regionId) throw new Error("Wybierz region obrony");
        return rpc("purchase_aa", { p_country_id: countryId, p_region_id: regionId, p_qty: v.qty });
      }
      return rpc("purchase_unit", {
        p_country_id: countryId,
        p_item_code: v.item.code,
        p_qty: v.qty,
      });
    },
    onSuccess: () => {
      toast.success("Zakup zrealizowany");
      setItem(null);
      setQtyText("1");
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const allItems = shop ?? [];
  const factories = allItems.filter((i) => i.building?.startsWith("factory_"));
  const mines = allItems.filter((i) => i.building?.startsWith("mine_"));
  const forts = allItems.filter((i) => i.building?.startsWith("fort_"));
  const units_ = allItems.filter((i) => !i.building);

  const ownedByBuilding = new Map<string, number>();
  for (const r of regions ?? []) {
    for (const s of r.slots) {
      ownedByBuilding.set(s.building, (ownedByBuilding.get(s.building) ?? 0) + 1);
    }
  }

  // Braki dla aktualnie wybranego produktu i ilości
  const effectiveQty = isBuilding ? 1 : qty;
  const needKr = item ? Number(item.cost_kr) * effectiveQty : 0;
  const haveKr = Number(country?.balance ?? 0);
  const krShort = item ? haveKr < needKr : false;
  const resourceRows = item
    ? RESOURCES.filter((r) => unitCost(item, r) > 0).map((r) => {
        const need = unitCost(item, r) * effectiveQty;
        const have = Number((country?.[r] as string) ?? 0);
        return { r, need, have, missing: have < need };
      })
    : [];
  const blockReason =
    item?.building && region ? buildBlockReason(region, item.building) : null;
  const cannotBuy =
    !country ||
    krShort ||
    resourceRows.some((x) => x.missing) ||
    !!blockReason ||
    !!(item?.building && levelLock(item)) ||
    (isBuilding && !region) ||
    (item?.code === "aa" && !regionId);

  function levelLock(i: ShopItem): string | null {
    if (!i.building?.startsWith("factory_")) return null;
    const level = Number(i.building.split("_")[1]);
    if (level <= 1) return null;
    const required = `factory_${level - 1}`;
    if (!ownedByBuilding.has(required)) return `Poziom ${level} — ZABLOKOWANY · WYMAGANY: Fabryka poziom ${level - 1}`;
    return null;
  }

  function ItemCard({ i, owned }: { i: ShopItem; owned?: number }) {
    return (
      <Panel className="hud-frame flex h-full flex-col p-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <p className="truncate text-base font-semibold">{i.name}</p>
          <p className="num text-primary shrink-0 text-sm">{fmtKR(i.cost_kr)}</p>
        </div>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{i.description}</p>
        {levelLock(i) ? <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-destructive">{levelLock(i)}</p> : null}
        <div className="mt-3 space-y-1 text-xs">
          {RESOURCES.filter((r) => unitCost(i, r) > 0).map((r) => (
            <p key={r} className="text-muted-foreground uppercase">
              {RESOURCE_LABELS[r]}:{" "}
              <span className="num text-foreground">{units(unitCost(i, r))}</span>
            </p>
          ))}
          {Number(i.income_kr) > 0 ? (
            <p className="text-success">+{fmtKR(i.income_kr)} / doba</p>
          ) : null}
          {Number(i.upkeep_coal) > 0 ? (
            <p className="text-destructive">-{units(i.upkeep_coal)} węgla / doba</p>
          ) : null}
          {i.produces ? (
            <p className="text-success">
              +{units(i.produces_amount)} {RESOURCE_LABELS[i.produces] ?? i.produces} / doba
            </p>
          ) : null}
          {owned !== undefined ? (
            <p className="text-info">Posiadasz: {units(owned)}</p>
          ) : null}
        </div>
        <Button className="mt-4 w-full" disabled={!countryId || !!levelLock(i)} onClick={() => openItem(i)}>
          Kup
        </Button>
      </Panel>
    );
  }

  return (
    <AppShell
      me={me ?? null}
      title="Sklep"
      subtitle={country ? `${country.name} — ${fmtKR(country.balance)}` : undefined}
    >
      {me?.isAdmin ? (
        <div className="mb-5 max-w-xs">
          <Select value={countryId ?? ""} onValueChange={setSelected}>
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

      {!countryId ? (
        <Panel className="p-5">
          <p className="text-muted-foreground text-sm">
            Nie masz przypisanego państwa — zakupy będą możliwe po przypisaniu.
          </p>
        </Panel>
      ) : null}

      {country ? (
        <Panel className="hud-frame mb-6 p-5">
          <p className="label-hud">Bilans węgla</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-muted-foreground text-xs uppercase">Węgiel</p>
              <p className="num mt-1 text-lg">{units(coalHave)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase">Dzisiaj zużyjesz</p>
              <p className="num text-destructive mt-1 text-lg">{units(coalUse)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase">Pozostanie</p>
              <p
                className={`num mt-1 text-lg ${coalLeft < 0 ? "text-destructive" : "text-success"}`}
              >
                {units(coalLeft)}
              </p>
            </div>
          </div>
          {coalLeft < 0 ? (
            <p className="text-destructive mt-3 text-sm">
              Brakuje węgla — fabryki IV–VI nie wypłacą przychodu. Dokup wytwórnie węgla.
            </p>
          ) : (
            <p className="text-muted-foreground mt-3 text-sm">
              Produkcja węgla: +{units(coalProd)} / doba.
            </p>
          )}
        </Panel>
      ) : null}

      <SectionTitle>Fabryki</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {factories.map((i) => (
          <ItemCard key={i.code} i={i} owned={ownedByBuilding.get(i.building!) ?? 0} />
        ))}
      </div>

      <SectionTitle>Wytwórnie surowców</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {mines.map((i) => (
          <ItemCard key={i.code} i={i} owned={ownedByBuilding.get(i.building!) ?? 0} />
        ))}
      </div>

      <SectionTitle>Wojsko i obrona</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {units_.map((i) => (
          <ItemCard key={i.code} i={i} />
        ))}
      </div>

      <SectionTitle
        action={
          <Link to="/regiony" className="text-primary shrink-0 text-xs">
            Regiony
          </Link>
        }
      >
        Fortyfikacje
      </SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {forts.map((i) => (
          <ItemCard key={i.code} i={i} owned={ownedByBuilding.get(i.building!) ?? 0} />
        ))}
      </div>

      <Dialog open={!!item} onOpenChange={(o) => !o && setItem(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="tracking-[0.14em] uppercase">Potwierdzenie zakupu</DialogTitle>
            <DialogDescription>{item?.name}</DialogDescription>
          </DialogHeader>
          {item ? (
            <div className="space-y-4">
              {!isBuilding ? (
                <div className="space-y-2">
                  <label htmlFor="qty" className="label-hud">
                    Ilość
                  </label>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setQtyText(String(Math.max(1, qty - 1)))}
                    >
                      −
                    </Button>
                    <Input
                      id="qty"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={qtyText}
                      onChange={(e) => setQtyText(e.target.value)}
                      onBlur={() => setQtyText(String(qty))}
                      className="num text-center"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setQtyText(String(qty + 1))}
                    >
                      +
                    </Button>
                  </div>
                </div>
              ) : null}

              {isBuilding || item.code === "aa" ? (
                <div className="space-y-2">
                  <p className="label-hud">{isBuilding ? "Region budowy" : "Region obrony"}</p>
                  <Select value={regionId ?? ""} onValueChange={setRegionId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz region" />
                    </SelectTrigger>
                    <SelectContent>
                      {(regions ?? []).map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name} — sloty {r.slots.length}/9 · {units(r.aa_defense)} OPL
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {blockReason ? (
                    <p className="text-destructive text-xs">{blockReason}</p>
                  ) : null}
                </div>
              ) : null}

              <div className="panel hud-frame space-y-2 p-4 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground uppercase">KR</span>
                  <span className={`num ${krShort ? "text-destructive" : "text-foreground"}`}>
                    {fmtNum(haveKr)} / {fmtNum(needKr)}
                  </span>
                </div>
                {resourceRows.map((row) => (
                  <div key={row.r} className="flex justify-between gap-2">
                    <span className="text-muted-foreground uppercase">
                      {RESOURCE_LABELS[row.r]}
                    </span>
                    <span className={`num ${row.missing ? "text-destructive" : "text-foreground"}`}>
                      {units(row.have)} / {units(row.need)}
                    </span>
                  </div>
                ))}
                <div className="border-border mt-2 flex justify-between gap-2 border-t pt-3">
                  <span className="text-muted-foreground uppercase">Koszt razem</span>
                  <span className="num text-primary">{kr(needKr)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground uppercase">Skarbiec po zakupie</span>
                  <span className={`num ${krShort ? "text-destructive" : "text-success"}`}>
                    {kr(haveKr - needKr)}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setItem(null)}>
                  Anuluj
                </Button>
                <Button
                  className="flex-1"
                  disabled={buy.isPending || cannotBuy}
                  onClick={() => buy.mutate({ item, qty })}
                >
                  {buy.isPending ? "Realizuję…" : "Potwierdź zakup"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
