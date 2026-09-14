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
import { countriesQuery, meQuery, rpc, shopQuery } from "@/lib/api";
import type { CountryStats, ShopItem } from "@/lib/api";
import { RESOURCE_LABELS, kr, krShort, units } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/sklep")({
  component: Shop,
});

const CATEGORY_ORDER = ["WOJSKO", "FABRYKI", "WYTWÓRNIE", "FORTYFIKACJE"];

function costRows(item: ShopItem) {
  const rows: { label: string; value: string }[] = [{ label: "Koszt", value: kr(item.cost_kr) }];
  (["coal", "oil", "copper", "iron", "uranium"] as const).forEach((r) => {
    const v = item[`cost_${r}` as keyof ShopItem] as string;
    if (Number(v) > 0) rows.push({ label: RESOURCE_LABELS[r] ?? r, value: units(v) });
  });
  return rows;
}

function Shop() {
  const { data: me } = useQuery(meQuery);
  const { data: countries } = useQuery(countriesQuery);
  const { data: shop } = useQuery(shopQuery);
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const countryId = selected ?? me?.countryId ?? null;
  const country = countries?.find((c) => c.country_id === countryId);
  const [item, setItem] = useState<ShopItem | null>(null);
  const [qty, setQty] = useState(1);

  const buy = useMutation({
    mutationFn: (v: { code: string; qty: number }) =>
      rpc("purchase_unit", { p_country_id: countryId, p_item_code: v.code, p_qty: v.qty }),
    onSuccess: () => {
      toast.success("Zakup zrealizowany");
      setItem(null);
      setQty(1);
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
    if (code === "aa") return "Bez limitu · nie zajmuje slotu · nie zużywa się w obronie";
    return null;
  }

  function isBlocked(code: string, c?: CountryStats) {
    if (!c) return false;
    if (code === "soldiers") return c.soldier_packs >= 6 || c.war_votes >= 10;
    if (code === "tanks") return c.tank_packs >= 4 || c.war_votes >= 10;
    return false;
  }

  return (
    <AppShell
      me={me ?? null}
      title="Sklep"
      subtitle={country ? `${country.flag} ${country.name} — ${kr(country.balance)}` : undefined}
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
                  {c.flag} {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {!countryId ? (
        <Panel>
          <p className="text-muted-foreground text-sm">
            Nie masz przypisanego państwa — zakupy będą możliwe po przypisaniu.
          </p>
        </Panel>
      ) : null}

      <SectionTitle>Wojsko i obrona</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {units_.map((i) => (
          <Panel key={i.code} className="flex h-full flex-col">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <p className="truncate text-sm font-semibold">{i.name}</p>
              <p className="num text-accent shrink-0 text-xs">{krShort(i.cost_kr)}</p>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">{i.description}</p>
            <ul className="text-muted-foreground mt-2 space-y-0.5 text-xs">
              {costRows(i)
                .slice(1)
                .map((r) => (
                  <li key={r.label}>
                    {r.label}: <span className="num">{r.value}</span>
                  </li>
                ))}
            </ul>
            {limitInfo(i.code, country) ? (
              <p className="text-primary mt-2 text-xs">{limitInfo(i.code, country)}</p>
            ) : null}
            <Button
              className="mt-3 w-full"
              disabled={!countryId || isBlocked(i.code, country)}
              onClick={() => {
                setItem(i);
                setQty(1);
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
        {CATEGORY_ORDER.filter((cat) => cat !== "WOJSKO").flatMap((cat) =>
          buildings
            .filter((i) => i.category === cat)
            .map((i) => (
              <Panel key={i.code}>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <p className="truncate text-sm font-semibold">{i.name}</p>
                  <p className="num text-accent shrink-0 text-xs">{krShort(i.cost_kr)}</p>
                </div>
                <p className="text-muted-foreground mt-1 text-xs">{i.description}</p>
                {Number(i.income_kr) > 0 ? (
                  <p className="text-primary mt-1 text-xs">+{krShort(i.income_kr)} / doba</p>
                ) : null}
                {i.produces ? (
                  <p className="text-primary mt-1 text-xs">
                    +{units(i.produces_amount)} {RESOURCE_LABELS[i.produces] ?? i.produces} / doba
                  </p>
                ) : null}
                <p className="text-muted-foreground mt-2 text-xs">Zajmuje 1 slot w regionie</p>
              </Panel>
            )),
        )}
      </div>

      <Dialog open={!!item} onOpenChange={(o) => !o && setItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Potwierdzenie zakupu</DialogTitle>
            <DialogDescription>{item?.name}</DialogDescription>
          </DialogHeader>
          {item ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="qty" className="text-muted-foreground text-xs">
                  Ilość
                </label>
                <Input
                  id="qty"
                  type="number"
                  min={1}
                  max={100}
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
              <div className="panel space-y-1 p-3 text-xs">
                {costRows(item).map((r) => (
                  <div key={r.label} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{r.label} (razem)</span>
                    <span className="num">
                      {r.label === "Koszt" ? kr(Number(item.cost_kr) * qty) : units(Number(r.value.replace(/\D/g, "")) * qty)}
                    </span>
                  </div>
                ))}
                <div className="border-border mt-2 flex justify-between gap-2 border-t pt-2">
                  <span className="text-muted-foreground">Skarbiec po zakupie</span>
                  <span className="num text-primary">
                    {kr(Number(country?.balance ?? 0) - Number(item.cost_kr) * qty)}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setItem(null)}>
                  Anuluj
                </Button>
                <Button
                  className="flex-1"
                  disabled={buy.isPending}
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
