import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Panel, SectionTitle } from "@/components/stat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  adminActionsQuery,
  adminShopQuery,
  adminUsersQuery,
  countriesQuery,
  economyRunsQuery,
  meQuery,
  regionsQuery,
  rpc,
  transactionsQuery,
} from "@/lib/api";
import type { CountryStats, ShopItem } from "@/lib/api";
import {
  BUILDING_LABELS,
  ROLE_LABELS,
  dateTime,
  fmtKR,
  kr,
  timeToDailyCycle,
  units,
} from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPanel,
});

type AdminUser = {
  id: string;
  email: string | null;
  display_name: string | null;
  country_id: string | null;
  country_name: string | null;
  role: "PLAYER" | "ADMIN" | "MAIN_ADMIN" | null;
};

const NUMERIC_FIELDS = [
  ["balance", "Skarbiec (KR)", "finance"],
  ["coal", "Węgiel", "resources"],
  ["oil", "Ropa", "resources"],
  ["copper", "Miedź", "resources"],
  ["iron", "Żelazo", "resources"],
  ["uranium", "Uran", "resources"],
  ["aa_defense", "OPL", "military"],
  ["missile_1", "Rakiety I", "military"],
  ["missile_2", "Rakiety II", "military"],
  ["missile_3", "Rakiety III", "military"],
  ["soldier_packs", "Pakiety żołnierzy", "military"],
  ["tank_packs", "Pakiety czołgów", "military"],
] as const;

function AdminPanel() {
  const { data: me } = useQuery(meQuery);
  const queryClient = useQueryClient();

  if (me && !me.isAdmin) {
    return (
      <AppShell me={me} title="Panel administratora">
        <Panel className="p-4">
          <p className="text-sm font-semibold">Brak uprawnień</p>
          <p className="text-muted-foreground mt-2 text-sm">
            Ta sekcja jest dostępna wyłącznie dla administratorów gry.
          </p>
          {me && !me.mainAdminExists ? (
            <Button
              className="mt-4"
              onClick={async () => {
                try {
                  await rpc("claim_main_admin", {});
                  toast.success("Jesteś głównym administratorem");
                  queryClient.invalidateQueries();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Nie udało się");
                }
              }}
            >
              Przejmij rolę głównego administratora
            </Button>
          ) : null}
        </Panel>
      </AppShell>
    );
  }

  return (
    <AppShell me={me ?? null} title="Panel administratora" subtitle="Państwa, sklep, cykl dobowy">
      <Tabs defaultValue="countries">
        <TabsList className="w-full overflow-x-auto">
          <TabsTrigger value="countries">Państwa</TabsTrigger>
          <TabsTrigger value="regions">Regiony</TabsTrigger>
          <TabsTrigger value="shop">Sklep</TabsTrigger>
          <TabsTrigger value="users">Gracze</TabsTrigger>
          <TabsTrigger value="economy">Cykl</TabsTrigger>
          <TabsTrigger value="history">Historia</TabsTrigger>
        </TabsList>
        <TabsContent value="countries" className="mt-4">
          <CountriesTab />
        </TabsContent>
        <TabsContent value="regions" className="mt-4">
          <RegionsTab />
        </TabsContent>
        <TabsContent value="shop" className="mt-4">
          <ShopTab />
        </TabsContent>
        <TabsContent value="users" className="mt-4">
          <UsersTab isMainAdmin={!!me?.isMainAdmin} />
        </TabsContent>
        <TabsContent value="economy" className="mt-4">
          <EconomyTab />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <HistoryTab />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

/* ---------------- Państwa ---------------- */

function CountriesTab() {
  const { data: countries } = useQuery(countriesQuery);
  const { data: users } = useQuery(adminUsersQuery);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "assigned" | "free">("all");
  const [sort, setSort] = useState<"name" | "balance" | "income" | "military">("income");
  const [openId, setOpenId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newFlag, setNewFlag] = useState("");

  const assignedIds = new Set(
    ((users ?? []) as AdminUser[]).map((u) => u.country_id).filter(Boolean) as string[],
  );

  const list = useMemo(() => {
    let rows = [...(countries ?? [])];
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((c) => c.name.toLowerCase().includes(q));
    if (filter === "assigned") rows = rows.filter((c) => assignedIds.has(c.country_id));
    if (filter === "free") rows = rows.filter((c) => !assignedIds.has(c.country_id));
    rows.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "pl");
      if (sort === "balance") return Number(b.balance) - Number(a.balance);
      if (sort === "military") return Number(b.military_value) - Number(a.military_value);
      return Number(b.gross_income) - Number(a.gross_income);
    });
    return rows;
  }, [countries, search, filter, sort, assignedIds]);

  const create = useMutation({
    mutationFn: () => rpc("admin_create_country", { p_name: newName, p_flag: newFlag }),
    onSuccess: () => {
      toast.success("Państwo utworzone");
      setNewName("");
      setNewFlag("");
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const open = countries?.find((c) => c.country_id === openId) ?? null;

  return (
    <div className="space-y-4">
      <Panel className="hud-frame space-y-3 p-3">
        <Input
          placeholder="Szukaj państwa…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie</SelectItem>
              <SelectItem value="assigned">Z graczem</SelectItem>
              <SelectItem value="free">Bez gracza</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="income">Sortuj: przychód</SelectItem>
              <SelectItem value="balance">Sortuj: skarbiec</SelectItem>
              <SelectItem value="military">Sortuj: wartość militarna</SelectItem>
              <SelectItem value="name">Sortuj: nazwa</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Panel>

      <Panel className="divide-border divide-y p-0">
        {list.map((c) => (
          <button
            key={c.country_id}
            onClick={() => setOpenId(c.country_id)}
            className="hover:bg-secondary/50 grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 text-left"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {c.flag} {c.name}
              </p>
              <p className="text-inactive text-xs">
                {c.regions_count} regionów ·{" "}
                {assignedIds.has(c.country_id) ? "przypisane graczowi" : "bez gracza"}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="num text-primary text-xs">{fmtKR(c.balance)}</p>
              <p className="num text-success text-[11px]">+{fmtKR(c.gross_income)}</p>
            </div>
          </button>
        ))}
        {list.length === 0 ? (
          <p className="text-muted-foreground p-3 text-sm">Brak państw dla tych kryteriów.</p>
        ) : null}
      </Panel>

      <Panel className="p-4">
        <p className="label-hud">Nowe państwo</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
          <Input placeholder="Nazwa" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Input placeholder="🏳️" value={newFlag} onChange={(e) => setNewFlag(e.target.value)} />
          <Button disabled={!newName || create.isPending} onClick={() => create.mutate()}>
            Utwórz
          </Button>
        </div>
      </Panel>

      <CountryCard country={open} onClose={() => setOpenId(null)} />
    </div>
  );
}

function CountryCard({
  country,
  onClose,
}: {
  country: CountryStats | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: regions } = useQuery(regionsQuery(country?.country_id ?? null));
  const { data: history } = useQuery(transactionsQuery(country?.country_id ?? null, 25));
  const [patch, setPatch] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    setPatch({});
  }, [country?.country_id]);

  const save = useMutation({
    mutationFn: () =>
      rpc("admin_adjust_country", {
        p_country_id: country!.country_id,
        p_patch: patch,
        p_note: "Korekta z panelu",
      }),
    onSuccess: () => {
      toast.success("Zapisano korektę");
      setPatch({});
      setConfirmOpen(false);
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!country) return null;

  const current = (key: string) => String(country[key as keyof CountryStats] ?? 0);
  const valueOf = (key: string) => patch[key] ?? current(key);
  const step = (key: string, dir: 1 | -1) => {
    const base = Number(valueOf(key)) || 0;
    const inc = key === "balance" ? 100000000000 : 1;
    setPatch((p) => ({ ...p, [key]: String(Math.max(0, base + dir * inc)) }));
  };

  const destructive = Object.entries(patch).some(
    ([k, v]) => NUMERIC_FIELDS.some(([f]) => f === k) && Number(v) < Number(current(k)),
  );

  const group = (g: string) => NUMERIC_FIELDS.filter(([, , grp]) => grp === g);

  const fields = (g: string) => (
    <div className="grid gap-3 sm:grid-cols-2">
      {group(g).map(([key, label]) => (
        <div key={key} className="space-y-1.5">
          <Label className="label-hud">{label}</Label>
          <div className="flex gap-1.5">
            <Button variant="outline" size="icon" onClick={() => step(key, -1)}>
              −
            </Button>
            <Input
              className="num"
              type="number"
              value={valueOf(key)}
              onChange={(e) => setPatch((p) => ({ ...p, [key]: e.target.value }))}
            />
            <Button variant="outline" size="icon" onClick={() => step(key, 1)}>
              +
            </Button>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <Dialog open={!!country} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="tracking-[0.14em] uppercase">
            {country.flag} {country.name}
          </DialogTitle>
          <DialogDescription>Karta państwa — korekty administracyjne</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="info">
          <TabsList className="w-full overflow-x-auto">
            <TabsTrigger value="info">Informacje</TabsTrigger>
            <TabsTrigger value="finance">Finanse</TabsTrigger>
            <TabsTrigger value="resources">Zasoby</TabsTrigger>
            <TabsTrigger value="military">Wojsko</TabsTrigger>
            <TabsTrigger value="regions">Regiony</TabsTrigger>
            <TabsTrigger value="history">Historia</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="label-hud">Nazwa</Label>
              <Input
                value={patch["name"] ?? country.name}
                onChange={(e) => setPatch((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="label-hud">Flaga (emoji)</Label>
              <Input
                value={patch["flag"] ?? country.flag}
                onChange={(e) => setPatch((p) => ({ ...p, flag: e.target.value }))}
              />
            </div>
            <Panel className="p-3 text-xs sm:col-span-2">
              <p>
                Przychód dobowy: <span className="num text-success">{fmtKR(country.gross_income)}</span>
              </p>
              <p className="mt-1">
                Głosy: wojsko {country.war_votes}/10, fortyfikacje {country.fort_votes}, razem{" "}
                {country.total_votes}
              </p>
              <p className="mt-1">
                Wartość militarna:{" "}
                <span className="num text-primary">{fmtKR(country.military_value)}</span>
              </p>
            </Panel>
          </TabsContent>

          <TabsContent value="finance" className="mt-3">
            {fields("finance")}
          </TabsContent>
          <TabsContent value="resources" className="mt-3">
            {fields("resources")}
          </TabsContent>
          <TabsContent value="military" className="mt-3">
            {fields("military")}
          </TabsContent>

          <TabsContent value="regions" className="mt-3">
            <Panel className="divide-border divide-y p-0">
              {(regions ?? []).map((r) => (
                <div key={r.id} className="px-3 py-2.5">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                    <p className="truncate text-sm">{r.name}</p>
                    <span className="num text-primary text-xs">{r.slots.length}/9</span>
                  </div>
                  <p className="text-inactive mt-1 text-xs">
                    {r.slots.length === 0
                      ? "pusty"
                      : r.slots.map((s) => BUILDING_LABELS[s.building]).join(", ")}
                  </p>
                </div>
              ))}
              {regions && regions.length === 0 ? (
                <p className="text-muted-foreground p-3 text-sm">Brak regionów.</p>
              ) : null}
            </Panel>
          </TabsContent>

          <TabsContent value="history" className="mt-3">
            <Panel className="divide-border divide-y p-0">
              {(
                (history ?? []) as unknown as {
                  id: string;
                  label: string;
                  amount_kr: string;
                  created_at: string;
                }[]
              )
                .filter((t) => Number(t.amount_kr) !== 0)
                .map((t) => (
                  <div key={t.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm">{t.label}</p>
                      <p className="text-inactive text-xs">{dateTime(t.created_at)}</p>
                    </div>
                    <p
                      className={`num shrink-0 text-xs ${Number(t.amount_kr) > 0 ? "text-success" : "text-destructive"}`}
                    >
                      {fmtKR(t.amount_kr)}
                    </p>
                  </div>
                ))}
            </Panel>
          </TabsContent>
        </Tabs>

        <Button
          className="mt-3"
          disabled={Object.keys(patch).length === 0}
          onClick={() => setConfirmOpen(true)}
        >
          Zapisz korektę
        </Button>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Potwierdź korektę</DialogTitle>
              <DialogDescription>
                {destructive
                  ? "Korekta obniża wartości państwa — operacja zostanie zapisana w dzienniku."
                  : "Zmiany zostaną zapisane w dzienniku administracyjnym."}
              </DialogDescription>
            </DialogHeader>
            <div className="panel space-y-1 p-3 text-xs">
              {Object.entries(patch).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="num">
                    {current(k)} → {v}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmOpen(false)}>
                Anuluj
              </Button>
              <Button
                variant={destructive ? "destructive" : "default"}
                className="flex-1"
                disabled={save.isPending}
                onClick={() => save.mutate()}
              >
                Zatwierdź
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Regiony ---------------- */

function RegionsTab() {
  const { data: countries } = useQuery(countriesQuery);
  const [id, setId] = useState<string | null>(null);
  const countryId = id ?? countries?.[0]?.country_id ?? null;
  const { data: regions } = useQuery(regionsQuery(countryId));
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [toRemove, setToRemove] = useState<{ id: string; name: string } | null>(null);

  const add = useMutation({
    mutationFn: () => rpc("admin_create_region", { p_country_id: countryId, p_name: name }),
    onSuccess: () => {
      toast.success("Region dodany");
      setName("");
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (regionId: string) => rpc("admin_delete_region", { p_region_id: regionId }),
    onSuccess: () => {
      toast.success("Region usunięty");
      setToRemove(null);
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Panel className="p-4">
        <Label className="label-hud mb-2 block">Państwo</Label>
        <Select value={countryId ?? ""} onValueChange={setId}>
          <SelectTrigger>
            <SelectValue placeholder="Wybierz" />
          </SelectTrigger>
          <SelectContent>
            {(countries ?? []).map((c) => (
              <SelectItem key={c.country_id} value={c.country_id}>
                {c.flag} {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Input
            placeholder="Nazwa nowego regionu"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button disabled={!name || add.isPending} onClick={() => add.mutate()}>
            Dodaj region
          </Button>
        </div>
      </Panel>
      <Panel className="divide-border divide-y p-0">
        {(regions ?? []).map((r) => (
          <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-3">
            <div className="min-w-0">
              <p className="truncate text-sm">{r.name}</p>
              <p className="text-inactive text-xs">{r.slots.length}/9 slotów zajętych</p>
            </div>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setToRemove({ id: r.id, name: r.name })}
            >
              Usuń
            </Button>
          </div>
        ))}
      </Panel>

      <Dialog open={!!toRemove} onOpenChange={(o) => !o && setToRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Usunąć region {toRemove?.name}?</DialogTitle>
            <DialogDescription>
              Usunięcie regionu wyburza wszystkie stojące w nim obiekty. Operacja jest nieodwracalna.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setToRemove(null)}>
              Anuluj
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={remove.isPending}
              onClick={() => toRemove && remove.mutate(toRemove.id)}
            >
              Usuń region
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- Sklep ---------------- */

const SHOP_NUMERIC = [
  ["cost_kr", "Koszt KR"],
  ["cost_coal", "Węgiel"],
  ["cost_oil", "Ropa"],
  ["cost_copper", "Miedź"],
  ["cost_iron", "Żelazo"],
  ["cost_uranium", "Uran"],
  ["income_kr", "Przychód KR / doba"],
  ["upkeep_coal", "Zużycie węgla / doba"],
  ["produces_amount", "Produkcja / doba"],
  ["sort_order", "Kolejność"],
] as const;

function ShopTab() {
  const { data: items } = useQuery(adminShopQuery);
  const queryClient = useQueryClient();
  const [edit, setEdit] = useState<Record<string, string> | null>(null);

  const save = useMutation({
    mutationFn: (payload: Record<string, string>) => rpc("admin_upsert_shop_item", { p_item: payload }),
    onSuccess: () => {
      toast.success("Produkt zapisany");
      setEdit(null);
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: (v: { code: string; active: boolean }) =>
      rpc("admin_toggle_shop_item", { p_code: v.code, p_active: v.active }),
    onSuccess: () => {
      toast.success("Widoczność zmieniona");
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toForm = (i: ShopItem): Record<string, string> => ({
    code: i.code,
    name: i.name,
    category: i.category,
    description: i.description,
    building: i.building ?? "",
    produces: i.produces ?? "",
    active: String(i.active),
    cost_kr: i.cost_kr,
    cost_coal: i.cost_coal,
    cost_oil: i.cost_oil,
    cost_copper: i.cost_copper,
    cost_iron: i.cost_iron,
    cost_uranium: i.cost_uranium,
    income_kr: i.income_kr,
    upkeep_coal: i.upkeep_coal,
    produces_amount: i.produces_amount,
    sort_order: String(i.sort_order),
  });

  return (
    <div className="space-y-3">
      <Button
        onClick={() =>
          setEdit({
            code: "",
            name: "",
            category: "INNE",
            description: "",
            building: "",
            produces: "",
            active: "true",
            cost_kr: "0",
            cost_coal: "0",
            cost_oil: "0",
            cost_copper: "0",
            cost_iron: "0",
            cost_uranium: "0",
            income_kr: "0",
            upkeep_coal: "0",
            produces_amount: "0",
            sort_order: "100",
          })
        }
      >
        Dodaj produkt
      </Button>

      <Panel className="divide-border divide-y p-0">
        {(items ?? []).map((i) => (
          <div key={i.code} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-3">
            <button className="min-w-0 text-left" onClick={() => setEdit(toForm(i))}>
              <p className={`truncate text-sm font-semibold ${i.active ? "" : "text-inactive"}`}>
                {i.name}
              </p>
              <p className="text-inactive text-xs">
                {i.category} · {i.code} · {fmtKR(i.cost_kr)}
              </p>
            </button>
            <Switch
              checked={i.active}
              onCheckedChange={(v) => toggle.mutate({ code: i.code, active: v })}
            />
          </div>
        ))}
      </Panel>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{edit?.["code"] ? "Edycja produktu" : "Nowy produkt"}</DialogTitle>
            <DialogDescription>
              Wartości obowiązują od razu w sklepie i w walidacji zakupów.
            </DialogDescription>
          </DialogHeader>
          {edit ? (
            <div className="space-y-3">
              {(
                [
                  ["code", "Kod (unikalny)"],
                  ["name", "Nazwa"],
                  ["category", "Kategoria"],
                  ["description", "Opis"],
                  ["building", "Typ budynku (puste = jednostka)"],
                  ["produces", "Produkuje surowiec (coal/oil/copper/iron/uranium)"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="space-y-1.5">
                  <Label className="label-hud">{label}</Label>
                  <Input
                    value={edit[key] ?? ""}
                    disabled={key === "code" && !!items?.some((i) => i.code === edit["code"])}
                    onChange={(e) => setEdit({ ...edit, [key]: e.target.value })}
                  />
                </div>
              ))}
              <div className="grid gap-3 sm:grid-cols-2">
                {SHOP_NUMERIC.map(([key, label]) => (
                  <div key={key} className="space-y-1.5">
                    <Label className="label-hud">{label}</Label>
                    <Input
                      className="num"
                      type="number"
                      value={edit[key] ?? "0"}
                      onChange={(e) => setEdit({ ...edit, [key]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={edit["active"] === "true"}
                  onCheckedChange={(v) => setEdit({ ...edit, active: String(v) })}
                />
                <span className="text-sm">Widoczny w sklepie</span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setEdit(null)}>
                  Anuluj
                </Button>
                <Button
                  className="flex-1"
                  disabled={!edit["code"] || save.isPending}
                  onClick={() => save.mutate(edit)}
                >
                  Zapisz
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- Gracze ---------------- */

function UsersTab({ isMainAdmin }: { isMainAdmin: boolean }) {
  const { data: users } = useQuery(adminUsersQuery);
  const { data: countries } = useQuery(countriesQuery);
  const queryClient = useQueryClient();

  const assign = useMutation({
    mutationFn: (v: { userId: string; countryId: string }) =>
      rpc("admin_assign_country", { p_user_id: v.userId, p_country_id: v.countryId }),
    onSuccess: () => {
      toast.success("Państwo przypisane");
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setRole = useMutation({
    mutationFn: (v: { userId: string; role: string }) =>
      rpc("set_user_role", { p_user_id: v.userId, p_role: v.role }),
    onSuccess: () => {
      toast.success("Uprawnienia zmienione");
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      {((users ?? []) as AdminUser[]).map((u) => (
        <Panel key={u.id} className="p-4">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <p className="truncate text-sm font-semibold">{u.display_name ?? u.email}</p>
            <span className="text-primary shrink-0 text-[10px] tracking-[0.14em] uppercase">
              {ROLE_LABELS[u.role ?? "PLAYER"]}
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div>
              <Label className="label-hud mb-1.5 block">Przypisane państwo</Label>
              <Select
                value={u.country_id ?? ""}
                onValueChange={(v) => assign.mutate({ userId: u.id, countryId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Brak" />
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
            {isMainAdmin ? (
              <div>
                <Label className="label-hud mb-1.5 block">Uprawnienia</Label>
                <Select
                  value={u.role ?? "PLAYER"}
                  onValueChange={(v) => setRole.mutate({ userId: u.id, role: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PLAYER">Gracz</SelectItem>
                    <SelectItem value="ADMIN">Administrator</SelectItem>
                    <SelectItem value="MAIN_ADMIN">Główny administrator</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
        </Panel>
      ))}
      {!isMainAdmin ? (
        <p className="text-muted-foreground text-xs">
          Zmiana uprawnień administratorów jest zastrzeżona dla głównego administratora.
        </p>
      ) : null}
    </div>
  );
}

/* ---------------- Cykl ---------------- */

function EconomyTab() {
  const { data: runs } = useQuery(economyRunsQuery);
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [countdown, setCountdown] = useState(() => timeToDailyCycle());

  useEffect(() => {
    const t = setInterval(() => setCountdown(timeToDailyCycle()), 1000);
    return () => clearInterval(t);
  }, []);

  const run = useMutation({
    mutationFn: () => rpc<{ ok: boolean; reason?: string }>("run_daily_economy", {}),
    onSuccess: (res) => {
      if (res?.ok) toast.success("Cykl dobowy rozliczony");
      else toast.info("Cykl na dzisiaj został już rozliczony");
      setConfirm(false);
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Panel className="hud-frame p-4">
        <p className="label-hud">Do automatycznego rozliczenia</p>
        <p className="num text-primary mt-1 text-3xl">{countdown}</p>
        <p className="text-muted-foreground mt-1 text-xs">
          Cykl uruchamia się codziennie o 20:00 czasu warszawskiego. Ręczne uruchomienie w tym samym
          dniu nie naliczy podwójnie.
        </p>
        <Button className="mt-3" onClick={() => setConfirm(true)}>
          Uruchom cykl teraz
        </Button>
      </Panel>

      <Panel className="divide-border divide-y p-0">
        {(
          (runs ?? []) as unknown as {
            id: string;
            run_date: string;
            ran_at: string;
            summary: Record<string, unknown>;
          }[]
        )
          .filter((r) => Number(r.summary?.["total_kr"] ?? 0) !== 0)
          .map((r) => (
            <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 p-3">
              <div className="min-w-0">
                <p className="text-sm">Cykl {r.run_date}</p>
                <p className="text-inactive text-xs">{dateTime(r.ran_at)}</p>
              </div>
              <p className="num text-success shrink-0 text-sm">
                {fmtKR(String(r.summary?.["total_kr"] ?? 0))}
              </p>
            </div>
          ))}
        {runs && runs.length === 0 ? (
          <p className="text-muted-foreground p-3 text-sm">Brak rozliczonych cykli.</p>
        ) : null}
      </Panel>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Uruchomić cykl dobowy?</DialogTitle>
            <DialogDescription>
              Wszystkim państwom zostanie doliczony przychód i produkcja surowców za dzisiejszy
              dzień. Operacji nie da się cofnąć.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirm(false)}>
              Anuluj
            </Button>
            <Button className="flex-1" disabled={run.isPending} onClick={() => run.mutate()}>
              {run.isPending ? "Liczę…" : "Uruchom"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- Historia ---------------- */

function HistoryTab() {
  const { data: tx } = useQuery(transactionsQuery(null, 50));
  const { data: actions } = useQuery(adminActionsQuery);
  const [hideEmpty, setHideEmpty] = useState(true);

  const rows = (
    (tx ?? []) as unknown as {
      id: string;
      label: string;
      amount_kr: string;
      created_at: string;
    }[]
  ).filter((t) => (hideEmpty ? Number(t.amount_kr) !== 0 : true));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Switch checked={hideEmpty} onCheckedChange={setHideEmpty} />
        <span className="text-xs">Ukryj wpisy bez zmiany KR</span>
      </div>

      <SectionTitle>Transakcje</SectionTitle>
      <Panel className="divide-border divide-y p-0">
        {rows.map((t) => (
          <div key={t.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 p-3">
            <div className="min-w-0">
              <p className="truncate text-sm">{t.label}</p>
              <p className="text-inactive text-xs">{dateTime(t.created_at)}</p>
            </div>
            <p
              className={`num shrink-0 text-sm ${
                Number(t.amount_kr) > 0
                  ? "text-success"
                  : Number(t.amount_kr) < 0
                    ? "text-destructive"
                    : "text-inactive"
              }`}
            >
              {kr(t.amount_kr)}
            </p>
          </div>
        ))}
      </Panel>

      <SectionTitle>Dziennik zmian administracyjnych</SectionTitle>
      <Panel className="divide-border divide-y p-0">
        {(
          (actions ?? []) as unknown as {
            id: string;
            action: string;
            created_at: string;
            country_id: string | null;
            details: Record<string, unknown>;
          }[]
        ).map((a) => {
          const old = (a.details?.["old"] ?? {}) as Record<string, unknown>;
          const nw = (a.details?.["new"] ?? {}) as Record<string, unknown>;
          const keys = Object.keys(nw);
          return (
            <div key={a.id} className="p-3">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                <p className="truncate text-sm">{a.action}</p>
                <p className="text-inactive shrink-0 text-xs">{dateTime(a.created_at)}</p>
              </div>
              {keys.length > 0 ? (
                <ul className="mt-1 space-y-0.5 text-xs">
                  {keys.map((k) => (
                    <li key={k} className="text-muted-foreground">
                      {k}:{" "}
                      <span className="num text-destructive">{units(String(old[k] ?? "—"))}</span> →{" "}
                      <span className="num text-success">{units(String(nw[k] ?? "—"))}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-inactive mt-1 truncate text-[11px]">
                  {JSON.stringify(a.details)}
                </p>
              )}
            </div>
          );
        })}
      </Panel>
    </div>
  );
}
