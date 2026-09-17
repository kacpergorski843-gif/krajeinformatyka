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
import type { CountryStats, ShopItem } from "@/lib/api";
import { RESOURCE_LABELS, fmtKR, fmtNum, kr, units } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/sklep")({
  head: () => ({
    meta: [
      { title: "Sklep — COUNTRY RP" },
      {
        name: "description",
        content: "Zakup wojska, obrony i obiektów regionalnych za KR i surowce.",
      },
      { property: "og:title", content: "Sklep — COUNTRY RP" },
      {
        property: "og:description",
        content: "Zakup wojska, obrony i obiektów regionalnych za KR i surowce.",
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
  const [aaRegion, setAaRegion] = useState<string | null>(null);
  const [qtyText, setQtyText] = useState("1");
  const qty = Math.max(1, Math.floor(Number(qtyText) || 0) || 1);

  const buy = useMutation({
    mutationFn: (v: { code: string; qty: number }) =>
      v.code === "aa"
        ? rpc("purchase_aa", {
            p_country_id: countryId,
            p_region_id: aaRegion,
            p_qty: v.qty,
          })
        : rpc("purchase_unit", { p_country_id: countryId, p_item_code: v.code, p_qty: v.qty }),
    onSuccess: () => {
      toast.success("Zakup zrealizowany");
      setItem(null);
      setQtyText("1");
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const units_ = (shop ?? []).filter((i) => !i.building);
  const buildings = (shop ?? []).filter((i) => i.building);

  function limitInfo(code: string, c?: CountryStats) {
    if (!c) return null;
    if (code === "soldiers")
      return `${c.soldier_packs}/6 pakietów · +1 głos · głosy wojska ${c.war_votes}/10`;
    if (code === "tanks")
      return `${c.tank_packs}/4 pakiety · +1 głos · głosy wojska ${c.war_votes}/10`;
    if (code === "aa") return "Bez limitu · kupowane dla wybranego regionu · broni tylko tego regionu";
    return null;
  }

  function isBlocked(code: string, c?: CountryStats) {
    if (!c) return false;
    if (code === "soldiers") return c.soldier_packs >= 6 || c.war_votes >= 10;
    if (code === "tanks") return c.tank_packs >= 4 || c.war_votes >= 10;
    return false;
  }

  const maxByLimit = (code: string, c?: CountryStats) => {
    if (!c) return 100;
    const votesLeft = Math.max(0, 10 - c.war_votes);
    if (code === "soldiers") return Math.min(6 - c.soldier_packs, votesLeft);
    if (code === "tanks") return Math.min(4 - c.tank_packs, votesLeft);
    return 100;
  };

  // Braki dla aktualnie wybranego produktu i ilości
  const needKr = item ? Number(item.cost_kr) * qty : 0;
  const haveKr = Number(country?.balance ?? 0);
  const krShort_ = item ? haveKr < needKr : false;
  const resourceRows = item
    ? RESOURCES.filter((r) => unitCost(item, r) > 0).map((r) => {
        const need = unitCost(item, r) * qty;
        const have = Number((country?.[r] as string) ?? 0);
        return { r, need, have, missing: have < need };
      })
    : [];
  const limitLeft = item ? maxByLimit(item.code, country) : 100;
  const overLimit = item ? qty > limitLeft : false;
  const cannotBuy =
    !country ||
    krShort_ ||
    resourceRows.some((x) => x.missing) ||
    overLimit ||
    qty < 1 ||
    (item?.code === "aa" && !aaRegion);

  return (
    <AppShell
      me={me ?? null}
      title="Sklep"
      subtitle={country ? `${country.name} — ${fmtKR(country.balance)}` : undefined}
    >
      {me?.isAdmin ? (
        <div className="mb-4 max-w-xs">
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
        <Panel className="p-4">
          <p className="text-muted-foreground text-sm">
            Nie masz przypisanego państwa — zakupy będą możliwe po przypisaniu.
          </p>
        </Panel>
      ) : null}

      <SectionTitle>Wojsko i obrona</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {units_.map((i) => (
          <Panel key={i.code} className="hud-frame flex h-full flex-col p-4">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <p className="truncate text-sm font-semibold">{i.name}</p>
              <p className="num text-primary shrink-0 text-xs">{fmtKR(i.cost_kr)}</p>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">{i.description}</p>
            <ul className="mt-2 space-y-0.5 text-xs">
              {RESOURCES.filter((r) => unitCost(i, r) > 0).map((r) => (
                <li key={r} className="text-muted-foreground uppercase">
                  {RESOURCE_LABELS[r]}: <span className="num text-foreground">{units(unitCost(i, r))}</span>
                </li>
              ))}
            </ul>
            {limitInfo(i.code, country) ? (
              <p className="text-info mt-2 text-xs">{limitInfo(i.code, country)}</p>
            ) : null}
            <Button
              className="mt-3 w-full"
              disabled={!countryId || isBlocked(i.code, country)}
              onClick={() => {
                setItem(i);
                setQtyText("1");
              }}
            >
              Kup
            </Button>
          </Panel>
        ))}
      </div>

      <SectionTitle
        action={
          <Link to="/regiony" className="text-primary shrink-0 text-xs">
            Przejdź do regionów
          </Link>
        }
      >
        Obiekty regionalne
      </SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {buildings.map((i) => (
          <Panel key={i.code} className="p-4">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <p className="truncate text-sm font-semibold">{i.name}</p>
              <p className="num text-primary shrink-0 text-xs">{fmtKR(i.cost_kr)}</p>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">{i.description}</p>
            {RESOURCES.filter((r) => unitCost(i, r) > 0).map((r) => (
              <p key={r} className="text-muted-foreground mt-1 text-xs uppercase">
                {RESOURCE_LABELS[r]}: <span className="num text-foreground">{units(unitCost(i, r))}</span>
              </p>
            ))}
            {Number(i.income_kr) > 0 ? (
              <p className="text-success mt-1 text-xs">+{fmtKR(i.income_kr)} / doba</p>
            ) : null}
            {Number(i.upkeep_coal) > 0 ? (
              <p className="text-destructive mt-1 text-xs">
                -{units(i.upkeep_coal)} węgla / doba
              </p>
            ) : null}
            {i.produces ? (
              <p className="text-success mt-1 text-xs">
                +{units(i.produces_amount)} {RESOURCE_LABELS[i.produces] ?? i.produces} / doba
              </p>
            ) : null}
            <p className="text-inactive mt-2 text-xs">Zajmuje 1 slot w regionie</p>
          </Panel>
        ))}
      </div>

      <Dialog open={!!item} onOpenChange={(o) => !o && setItem(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="tracking-[0.14em] uppercase">Potwierdzenie zakupu</DialogTitle>
            <DialogDescription>{item?.name}</DialogDescription>
          </DialogHeader>
          {item ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
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
                  <Button variant="outline" size="icon" onClick={() => setQtyText(String(qty + 1))}>
                    +
                  </Button>
                </div>
                {overLimit ? (
                  <p className="text-destructive text-xs">
                    Limit dla tego produktu: maks. {limitLeft} szt.
                  </p>
                ) : null}
              </div>

              {item.code === "aa" ? (
                <div className="space-y-1.5">
                  <p className="label-hud">Region obrony</p>
                  <Select value={aaRegion ?? ""} onValueChange={setAaRegion}>
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz region" />
                    </SelectTrigger>
                    <SelectContent>
                      {(regions ?? []).map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name} — {units(r.aa_defense)} OPL
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div className="panel hud-frame space-y-1.5 p-3 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground uppercase">KR</span>
                  <span className={`num ${krShort_ ? "text-destructive" : "text-foreground"}`}>
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
                <div className="border-border mt-2 flex justify-between gap-2 border-t pt-2">
                  <span className="text-muted-foreground uppercase">Koszt razem</span>
                  <span className="num text-primary">{kr(needKr)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground uppercase">Skarbiec po zakupie</span>
                  <span className={`num ${krShort_ ? "text-destructive" : "text-success"}`}>
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
                  onClick={() => buy.mutate({ code: item.code, qty })}
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
