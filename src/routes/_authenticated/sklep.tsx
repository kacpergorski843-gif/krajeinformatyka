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

        const factoryLevel = v.item.building.startsWith("factory_")
          ? Number(v.item.building.split("_")[1])
          : 0;
        const fortUpgrade = v.item.building === "fort_2" || v.item.building === "fort_3";
        const requiredBuilding =
          factoryLevel > 1
            ? `factory_${factoryLevel - 1}`
            : v.item.building === "fort_2"
              ? "fort_1"
              : v.item.building === "fort_3"
                ? "fort_2"
                : null;
        const upgradeSlot = requiredBuilding
          ? region.slots.find((s) => s.building === requiredBuilding)?.slot_index ?? null
          : null;

        if (upgradeSlot !== null && (factoryLevel > 1 || fortUpgrade)) {
          return rpc("upgrade_building_in_slot", {
            p_region_id: region.id,
            p_slot_index: upgradeSlot,
            p_item_code: v.item.code,
          });
        }

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
      void queryClient.invalidateQueries({ queryKey: ["country_stats"] });
      void queryClient.invalidateQueries({ queryKey: ["regions"] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
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
        const have = Number(country?.[r] ?? 0);
        return { r, need, have, short: have < need };
      })
    : [];

  const disabledReason = item
    ? isBuilding
      ? !region
        ? "Wybierz region"
        : buildBlockReason(region, item.building ?? "")
      : krShort || resourceRows.some((r) => r.short)
        ? "Brak środków lub surowców"
        : null
    : null;

  return (
    <AppShell>
      <div className="space-y-4">
        <Panel className="shop-hero">
          <div>
            <p className="label-hud">LOGISTYKA / ZAOPATRZENIE</p>
            <h2 className="mt-1 text-xl font-semibold sm:text-2xl">Rynek państwa</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Kupuj uzbrojenie, infrastrukturę i jednostki za KR oraz surowce.
            </p>
          </div>
          <div className="text-right text-sm">
            <p className="text-muted-foreground">Saldo</p>
            <p className="text-lg font-semibold">{fmtKR(haveKr)}</p>
          </div>
        </Panel>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Panel>
            <SectionTitle>Produkty</SectionTitle>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {allItems.map((product) => {
                const owned = product.building ? ownedByBuilding.get(product.building) ?? 0 : null;
                return (
                  <button
                    key={product.code}
                    type="button"
                    className="rounded-xl border p-4 text-left transition hover:border-primary/50 hover:bg-muted/30"
                    onClick={() => openItem(product)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{product.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{product.description}</p>
                      </div>
                      {owned !== null && <span className="text-xs text-muted-foreground">Posiadane: {owned}</span>}
                    </div>
                    <div className="mt-3 text-sm font-medium">{fmtKR(Number(product.cost_kr))}</div>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel>
            <SectionTitle>Stan zaopatrzenia</SectionTitle>
            <div className="mt-3 space-y-2 text-sm">
              {RESOURCES.map((r) => (
                <div key={r} className="flex items-center justify-between gap-3">
                  <span>{RESOURCE_LABELS[r]}</span>
                  <span className="font-medium">{fmtNum(Number(country?.[r] ?? 0))}</span>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 border-t pt-2">
                <span>Węgiel netto</span>
                <span className="font-medium">{fmtNum(coalLeft)}</span>
              </div>
            </div>
          </Panel>
        </div>

        <Dialog open={!!item} onOpenChange={(open) => !open && setItem(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{item?.name ?? "Produkt"}</DialogTitle>
              <DialogDescription>{item?.description}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {item && !isBuilding && (
                <div>
                  <label className="text-sm font-medium">Ilość</label>
                  <Input
                    className="mt-1"
                    inputMode="numeric"
                    type="number"
                    min={1}
                    value={qtyText}
                    onChange={(e) => setQtyText(e.target.value)}
                  />
                </div>
              )}
              {item && (isBuilding || item.code === "aa") && (
                <div>
                  <label className="text-sm font-medium">Region</label>
                  <Select value={regionId ?? undefined} onValueChange={setRegionId}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Wybierz region" />
                    </SelectTrigger>
                    <SelectContent>
                      {(regions ?? []).map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {item && (
                <div className="rounded-lg border p-3 text-sm">
                  <div className="flex justify-between gap-3"><span>Łączny koszt</span><span className="font-semibold">{fmtKR(needKr)}</span></div>
                  {resourceRows.map((r) => (
                    <div key={r.r} className="mt-1 flex justify-between gap-3">
                      <span>{RESOURCE_LABELS[r.r]}</span>
                      <span className={r.short ? "font-semibold text-destructive" : "font-medium"}>{fmtNum(r.need)}</span>
                    </div>
                  ))}
                </div>
              )}
              <Button className="w-full" disabled={!!disabledReason || buy.isPending} onClick={() => item && buy.mutate({ item, qty: effectiveQty })}>
                {buy.isPending ? "Realizowanie…" : disabledReason ?? "Kup"}
              </Button>
              <Link to="/regiony" className="block text-center text-sm text-muted-foreground underline-offset-4 hover:underline">
                Zarządzaj regionami
              </Link>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
