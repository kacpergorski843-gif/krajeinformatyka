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
        const have = Number((country?.[r] as string) ?? 0);
        return { r, need, have, missing: have < need };
      })
    : [];
  function levelLock(i: ShopItem): string | null {
    if (!i.building?.startsWith("factory_")) return null;
    const level = Number(i.building.split("_")[1]);
    if (level <= 1) return null;
    const required = `factory_${level - 1}`;
    if (!ownedByBuilding.has(required)) {
      return `Poziom ${level} — ZABLOKOWANY · WYMAGANY: Fabryka poziom ${level - 1}`;
    }
    return null;
  }

  const upgradeTarget = item?.building && region
    ? (() => {
        const level = item.building.startsWith("factory_") ? Number(item.building.split("_")[1]) : 0;
        const required =
          level > 1
            ? `factory_${level - 1}`
            : item.building === "fort_2"
              ? "fort_1"
              : item.building === "fort_3"
                ? "fort_2"
                : null;
        return required ? region.slots.find((slot) => slot.building === required) ?? null : null;
      })()
    : null;

  const selectedBuildingIncome = item?.building ? Number(item.income_kr ?? 0) : 0;
  const replacedBuilding = upgradeTarget?.building
    ? (shop ?? []).find((shopItem) => shopItem.building === upgradeTarget.building)
    : null;
  const replacedBuildingIncome = Number(replacedBuilding?.income_kr ?? 0);
  const currentIncome = Number(country?.gross_income ?? 0);
  const incomeAfterPurchase = item?.building
    ? currentIncome - replacedBuildingIncome + selectedBuildingIncome
    : currentIncome;

  const blockReason =
    item?.building && region
      ? upgradeTarget
        ? null
        : buildBlockReason(region, item.building) ?? levelLockForRegion(region, item.building)
      : null;
  const cannotBuy =
    !country ||
    krShort ||
    resourceRows.some((x) => x.missing) ||
    !!blockReason ||
    (isBuilding && !region) ||
    (item?.code === "aa" && !regionId);

  function levelLockForRegion(selectedRegion: RegionWithSlots, building: string): string | null {
    if (!building.startsWith("factory_")) return null;
    const level = Number(building.split("_")[1]);
    if (level <= 1) return null;
    const required = `factory_${level - 1}`;
    if (!selectedRegion.slots.some((slot) => slot.building === required)) {
      return `W tym regionie wymagany jest najpierw poziom ${level - 1}`;
    }
    return null;
  }

  function itemCannotBuy(i: ShopItem): boolean {
    if (!country) return true;

    const itemKr = Number(i.cost_kr);
    if (haveKr < itemKr) return true;

    const missingResource = RESOURCES.some((r) => {
      const need = unitCost(i, r);
      return need > 0 && Number((country[r] as string) ?? 0) < need;
    });
    if (missingResource) return true;

    if (i.code === "aa") {
      return !(regions ?? []).some((r) => !buildBlockReason(r, "aa"));
    }

    if (i.building) {
      const canUpgrade = (region: RegionWithSlots) => {
        const level = i.building?.startsWith("factory_")
          ? Number(i.building.split("_")[1])
          : 0;
        const required =
          level > 1
            ? `factory_${level - 1}`
            : i.building === "fort_2"
              ? "fort_1"
              : i.building === "fort_3"
                ? "fort_2"
                : null;

        return required
          ? region.slots.some((slot) => slot.building === required)
          : false;
      };

      // Ulepszenie zastępuje budynek w tym samym slocie, więc pełny
      // region nadal może kupić kolejny poziom fabryki/fortyfikacji.
      if ((regions ?? []).some(canUpgrade)) return false;

      return !(regions ?? []).some(
        (r) => !buildBlockReason(r, i.building!) && !levelLockForRegion(r, i.building!),
      );
    }

    return false;
  }

  function ItemCard({ i, owned }: { i: ShopItem; owned?: number }) {
    const cannotBuyItem = itemCannotBuy(i);

    return (
      <Panel className="hud-frame shop-card flex h-full flex-col p-5">
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
        <Button
          className="mt-4 w-full"
          disabled={!countryId || cannotBuyItem}
          onClick={() => openItem(i)}
        >
          {cannotBuyItem ? "Niedostępne" : "Kup"}
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

      <div className="shop-hero"><div><p className="label-hud">LOGISTYKA / ZAOPATRZENIE</p><h2 className="mt-1 text-xl font-semibold sm:text-2xl">Rynek państwa</h2><p className="mt-1 text-sm text-muted-foreground">Inwestycje, przemysł i jednostki. Dostępność zakupu jest sprawdzana przed otwarciem zamówienia.</p></div><div className="shop-balance"><span>SKARBIEC</span><strong>{country ? fmtKR(country.balance) : "—"}</strong></div></div><SectionTitle>Fabryki</SectionTitle>
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
                <div className="space-y-3">
                  <div>
                    <p className="label-hud">{isBuilding ? "Wybierz region budowy" : "Wybierz region obrony"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Podgląd pokazuje układ wszystkich regionów i wszystkie 9 slotów.
                      Przy ulepszeniach od razu widać, gdzie znajduje się wymagany poziom.
                    </p>
                  </div>

                  <div className="grid gap-2">
                    {(regions ?? []).map((r) => {
                      const building = item.building ?? "";
                      const level = building.startsWith("factory_")
                        ? Number(building.split("_")[1])
                        : 0;
                      const required =
                        level > 1
                          ? `factory_${level - 1}`
                          : building === "fort_2"
                            ? "fort_1"
                            : building === "fort_3"
                              ? "fort_2"
                              : null;
                      const upgradeSlot = required
                        ? r.slots.find((slot) => slot.building === required) ?? null
                        : null;
                      const regionBlock = isBuilding
                        ? buildBlockReason(r, building) ?? levelLockForRegion(r, building)
                        : null;
                      const selectable = isBuilding
                        ? !!upgradeSlot || !regionBlock
                        : !buildBlockReason(r, "aa");
                      const selectedRegion = regionId === r.id;

                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => selectable && setRegionId(r.id)}
                          disabled={!selectable}
                          className={`w-full rounded-lg border p-3 text-left transition-colors ${selectedRegion
                            ? "border-primary bg-primary/10"
                            : selectable
                              ? "border-border bg-background/40 hover:border-primary/60"
                              : "border-border/50 bg-muted/20 opacity-55"}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-semibold">{r.name}</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {r.slots.length}/9 slotów · {units(r.aa_defense)} OPL
                              </p>
                            </div>
                            <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wider ${upgradeSlot || selectable ? "text-primary" : "text-muted-foreground"}`}>
                              {upgradeSlot ? `ULEPSZENIE · SLOT ${upgradeSlot.slot_index}` : selectable ? "DOSTĘPNY" : "NIEDOSTĘPNY"}
                            </span>
                          </div>

                          <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                            {Array.from({ length: 9 }, (_, index) => {
                              const slotIndex = index + 1;
                              const slot = r.slots.find((s) => s.slot_index === slotIndex);
                              const isUpgrade = slot?.building === required;
                              return (
                                <div
                                  key={slotIndex}
                                  className={`min-h-12 rounded border px-1.5 py-1 text-center ${isUpgrade
                                    ? "border-primary bg-primary/15 text-primary"
                                    : slot
                                      ? "border-border bg-muted/30 text-foreground"
                                      : "border-dashed border-border/60 text-muted-foreground"}`}
                                >
                                  <p className="text-[9px] uppercase tracking-wider opacity-70">S{slotIndex}</p>
                                  <p className="mt-1 line-clamp-2 text-[10px] leading-tight">
                                    {slot ? BUILDING_LABELS[slot.building] ?? slot.building : "Pusty"}
                                  </p>
                                </div>
                              );
                            })}
                          </div>

                          {upgradeSlot ? (
                            <p className="mt-2 text-[11px] font-medium text-primary">
                              Tutaj możesz kupić {item.name} — zastąpi {BUILDING_LABELS[upgradeSlot.building] ?? upgradeSlot.building}
                              {" "}w slocie {upgradeSlot.slot_index}.
                            </p>
                          ) : regionBlock && isBuilding ? (
                            <p className="mt-2 text-[11px] text-destructive">{regionBlock}</p>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>

                  {upgradeTarget ? (
                    <p className="text-primary text-xs">
                      Wybrany region: ulepszenie zastąpi {BUILDING_LABELS[upgradeTarget.building] ?? upgradeTarget.building}
                      {" "}w slocie {upgradeTarget.slot_index} — nie zajmie dodatkowego miejsca.
                    </p>
                  ) : blockReason ? (
                    <p className="text-destructive text-xs">{blockReason}</p>
                  ) : null}
                </div>
              ) : null}
              {isBuilding && item && selectedBuildingIncome > 0 ? (
                <div className="panel hud-frame space-y-2 p-4 text-xs">
                  <p className="label-hud">ZAROBKI PAŃSTWA</p>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Teraz</span>
                    <span className="num">{fmtKR(currentIncome)} / doba</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t pt-2">
                    <span className="text-muted-foreground">Po zakupie</span>
                    <span className="num text-success">{fmtKR(incomeAfterPurchase)} / doba</span>
                  </div>
                  <div className="text-center text-primary">↑ +{fmtKR(incomeAfterPurchase - currentIncome)} / doba</div>
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
                  {buy.isPending ? "Realizuję…" : upgradeTarget ? "Potwierdź ulepszenie" : "Potwierdź zakup"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
