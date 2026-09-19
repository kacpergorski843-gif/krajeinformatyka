// LOVABLE GITHUB SYNC TEST — WIDOCZNA ZMIANA
// Lovable sync refresh: clean parser-safe admin route
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Boxes,
  Building2,
  CalendarClock,
  ChevronRight,
  CircleDollarSign,
  History,
  PackagePlus,
  Radar,
  Rocket,
  Search,
  Shield,
  ShieldAlert,
  ShoppingCart,
  Truck,
  Trash2,
  UserCog,
  Users,
  Warehouse,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { deletePlayerAccount } from "@/lib/admin.functions";
import { Panel, SectionTitle } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
  allRegionsQuery,
  adminShopQuery,
  adminUsersQuery,
  countriesQuery,
  economyRunsQuery,
  meQuery,
  regionsQuery,
  rpc,
  strikesQuery,
  transactionsQuery,
} from "@/lib/api";
import type { CountryStats, MissileStrike, RegionWithSlots, ShopItem } from "@/lib/api";
import {
  BUILDING_LABELS,
  MISSILE_LABELS,
  RESOURCE_LABELS,
  ROLE_LABELS,
  dateTime,
  fmtKR,
  fmtNum,
  timeToDailyCycle,
  units,
} from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Panel administratora — Nation Dynamics" },
      { name: "description", content: "Centrum zarządzania państwami, użytkownikami, sklepem i cyklem dobowym Nation Dynamics." },
      { property: "og:title", content: "Panel administratora — Nation Dynamics" },
      { property: "og:description", content: "Centrum zarządzania państwami, użytkownikami, sklepem i cyklem dobowym Nation Dynamics." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
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

type TransactionRow = {
  id: string;
  country_id: string | null;
  kind: string;
  label: string;
  amount_kr: string;
  created_at: string;
  details?: Record<string, unknown>;
};

type AdminActionRow = {
  id: string;
  action: string;
  created_at: string;
  country_id: string | null;
  details: Record<string, unknown>;
};

type EconomyRun = {
  id: string;
  run_date: string;
  ran_at: string;
  summary: Record<string, unknown>;
};

type FieldKey =
  | "balance"
  | "coal"
  | "oil"
  | "copper"
  | "iron"
  | "uranium"
  | "aa_defense"
  | "missile_1"
  | "missile_2"
  | "missile_3"
  | "soldier_packs"
  | "tank_packs";

const FIELD_LABELS: Record<FieldKey, string> = {
  balance: "Skarbiec",
  coal: "Węgiel",
  oil: "Ropa",
  copper: "Miedź",
  iron: "Żelazo",
  uranium: "Uran",
  aa_defense: "Obrona OPL",
  missile_1: "Rakiety I",
  missile_2: "Rakiety II",
  missile_3: "Rakiety III",
  soldier_packs: "Pakiety żołnierzy",
  tank_packs: "Pakiety czołgów",
};

const RESOURCE_FIELDS: FieldKey[] = ["coal", "oil", "copper", "iron", "uranium"];
const MILITARY_FIELDS: FieldKey[] = ["soldier_packs", "tank_packs", "missile_1", "missile_2", "missile_3"];

const MILITARY_ICONS: Record<string, typeof Shield> = {
  soldier_packs: Users,
  tank_packs: Truck,
  aa_defense: Radar,
  missile_1: Rocket,
  missile_2: Rocket,
  missile_3: Rocket,
};

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


function Update4Tools() {
  const { data: countries } = useQuery(countriesQuery);
  const { data: regions } = useQuery(allRegionsQuery);
  const [country,setCountry]=useState(""); const [region,setRegion]=useState(""); const [building,setBuilding]=useState("factory_1");
  const [slot,setSlot]=useState("1"); const [qty,setQty]=useState("1"); const [percent,setPercent]=useState("25"); const [hours,setHours]=useState("24");
  const run=async(fn:string,args:Record<string,unknown>)=>{try{await rpc(fn,args);toast.success("Operacja wykonana");}catch(e){toast.error(e instanceof Error?e.message:"Błąd");}};
  const selectedRegions=(regions.data??[]).filter((r)=>r.country_id===country);
  return <Panel className="space-y-6">
    <SectionTitle>Operacje Update 4.0</SectionTitle>
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-3"><p className="label-hud">Dodaj budynek</p>
        <Select value={country} onValueChange={setCountry}><SelectTrigger><SelectValue placeholder="Państwo"/></SelectTrigger><SelectContent>{(countries.data??[]).map(c=><SelectItem key={c.country_id} value={c.country_id}>{c.flag} {c.name}</SelectItem>)}</SelectContent></Select>
        <Select value={region} onValueChange={setRegion}><SelectTrigger><SelectValue placeholder="Region"/></SelectTrigger><SelectContent>{selectedRegions.map(r=><SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent></Select>
        <Select value={building} onValueChange={setBuilding}><SelectTrigger><SelectValue placeholder="Budynek"/></SelectTrigger><SelectContent>{["factory_1","factory_2","factory_3","factory_4","factory_5","factory_6","fort_1","fort_2","fort_3"].map(b=><SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent></Select>
        <Input type="number" min="1" value={slot} onChange={e=>setSlot(e.target.value)} placeholder="Slot"/>
        <Input type="number" min="1" max="9" value={qty} onChange={e=>setQty(e.target.value)} placeholder="Ilość"/>
        <Button className="w-full" onClick={()=>run("admin_grant_building",{p_country_id:country,p_region_id:region,p_slot_index:Number(slot),p_building:building,p_quantity:Number(qty)})}>Dodaj budynek</Button>
      </div>
      <div className="space-y-3"><p className="label-hud">Bonus zarobków</p>
        <Input type="number" min="1" max="1000" value={percent} onChange={e=>setPercent(e.target.value)} placeholder="%"/>
        <Input type="number" min="1" max="720" value={hours} onChange={e=>setHours(e.target.value)} placeholder="Godziny"/>
        <Button className="w-full" onClick={()=>run("admin_start_income_bonus",{p_percent:Number(percent),p_hours:Number(hours)})}>Uruchom +{percent}% / {hours}h</Button>
      </div>
      <div className="space-y-3"><p className="label-hud">Przejęcie regionu</p>
        <Select value={region} onValueChange={setRegion}><SelectTrigger><SelectValue placeholder="Region"/></SelectTrigger><SelectContent>{(regions.data??[]).map(r=><SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent></Select>
        <Select value={country} onValueChange={setCountry}><SelectTrigger><SelectValue placeholder="Kraj przejmujący"/></SelectTrigger><SelectContent>{(countries.data??[]).map(c=><SelectItem key={c.country_id} value={c.country_id}>{c.flag} {c.name}</SelectItem>)}</SelectContent></Select>
        <Button variant="destructive" className="w-full" onClick={()=>run("admin_occupy_region",{p_region_id:region,p_new_country_id:country})}>Przejmij region</Button>
      </div>
    </div>
  </Panel>;
}

function AdminPanel() {
  const { data: me } = useQuery(meQuery);
  const countries = useQuery(countriesQuery);
  const users = useQuery(adminUsersQuery);
  const runs = useQuery(economyRunsQuery);
  const queryClient = useQueryClient();
  const [countdown, setCountdown] = useState(() => timeToDailyCycle());

  useEffect(() => {
    const timer = window.setInterval(() => setCountdown(timeToDailyCycle()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (me && !me.isAdmin) {
    return (
      <AppShell me={me} title="Panel administratora">
        <HudState icon={<ShieldAlert />} title="Brak uprawnień" description="Ta sekcja jest dostępna wyłącznie dla administratorów gry.">
          {!me.mainAdminExists ? (
            <Button
              onClick={async () => {
                try {
                  await rpc("claim_main_admin", {});
                  toast.success("Jesteś głównym administratorem");
                  queryClient.invalidateQueries();
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Nie udało się");
                }
              }}
            >
              Przejmij rolę głównego administratora
            </Button>
          ) : null}
        </HudState>
      </AppShell>
    );
  }

  const userRows = (users.data ?? []) as AdminUser[];
  const runRows = (runs.data ?? []) as unknown as EconomyRun[];
  const latestRun = runRows[0];

  return (
    <AppShell me={me ?? null} title="Centrum dowodzenia" subtitle="Administracja Nation Dynamics">
      <div className="min-w-0 space-y-4 overflow-x-clip">
        <section className="grid min-w-0 gap-3 sm:grid-cols-3" aria-label="Najważniejsze wskaźniki">
          <Kpi icon={<Building2 />} label="Państwa" value={String(countries.data?.length ?? 0)} hint="aktywnych rekordów" loading={countries.isLoading} />
          <Kpi icon={<Users />} label="Gracze" value={String(userRows.length)} hint={`${userRows.filter((u) => u.country_id).length} z przypisanym państwem`} loading={users.isLoading} />
          <Kpi icon={<CalendarClock />} label="Cykl dobowy" value={countdown} hint={latestRun ? `Ostatni: ${dateTime(latestRun.ran_at)}` : "Brak wcześniejszych rozliczeń"} loading={runs.isLoading} />
        </section>

        <Tabs defaultValue="countries" className="min-w-0">
          <div className="admin-scrollbar w-full max-w-full overflow-x-auto pb-1">
            <TabsList className="grid h-auto min-w-[48rem] grid-cols-6 border border-border/70 bg-card/80 p-1">
              <AdminTab value="countries" icon={<Building2 />}>Państwa</AdminTab>
              <AdminTab value="users" icon={<UserCog />}>Użytkownicy</AdminTab>
              <AdminTab value="shop" icon={<ShoppingCart />}>Sklep / Produkty</AdminTab>
              <AdminTab value="economy" icon={<CalendarClock />}>Cykl dobowy</AdminTab>
              <AdminTab value="history" icon={<History />}>Historia / Audyt</AdminTab>
              <AdminTab value="update4" icon={<PackagePlus />}>Update 4.0</AdminTab>
            </TabsList>
          </div>
          <TabsContent value="countries"><CountriesTab /></TabsContent>
          <TabsContent value="users"><UsersTab isMainAdmin={!!me?.isMainAdmin} /></TabsContent>
          <TabsContent value="shop"><ShopTab /></TabsContent>
          <TabsContent value="economy"><EconomyTab countdown={countdown} /></TabsContent>
          <TabsContent value="history"><HistoryTab /></TabsContent>
          <TabsContent value="update4"><Update4Tools /></TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function AdminTab({ value, icon, children }: { value: string; icon: ReactNode; children: ReactNode }) {
  return (
    <TabsTrigger value={value} className="gap-2 rounded-sm py-2.5 data-[state=active]:bg-secondary data-[state=active]:text-primary [&_svg]:size-4">
      {icon}{children}
    </TabsTrigger>
  );
}

function Kpi({ icon, label, value, hint, loading }: { icon: ReactNode; label: string; value: string; hint: string; loading: boolean }) {
  return (
    <Panel className="hud-frame min-w-0 p-3 sm:p-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <p className="label-hud truncate">{label}</p>
          {loading ? <Skeleton className="mt-2 h-7 w-24" /> : <p className="num mt-1 truncate text-xl text-primary sm:text-2xl">{value}</p>}
          <p className="mt-1 truncate text-[11px] text-muted-foreground">{hint}</p>
        </div>
        <span className="grid size-9 shrink-0 place-items-center border border-primary/30 bg-primary/10 text-primary [&_svg]:size-4">{icon}</span>
      </div>
    </Panel>
  );
}

function HudState({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children?: ReactNode }) {
  return (
    <Panel className="hud-frame flex min-h-48 flex-col items-center justify-center p-6 text-center">
      <span className="mb-3 grid size-11 place-items-center border border-primary/30 text-primary [&_svg]:size-5">{icon}</span>
      <h2 className="font-display text-base font-semibold">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      {children ? <div className="mt-4">{children}</div> : null}
    </Panel>
  );
}

function CountriesTab() {
  const countryQuery = useQuery(countriesQuery);
  const userQuery = useQuery(adminUsersQuery);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "assigned" | "free">("all");
  const [sort, setSort] = useState<"name" | "balance" | "income" | "military">("income");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFlag, setNewFlag] = useState("");
  const users = (userQuery.data ?? []) as AdminUser[];
  const assignedIds = useMemo(() => new Set(users.flatMap((u) => u.country_id ? [u.country_id] : [])), [users]);

  const list = useMemo(() => {
    let rows = [...(countryQuery.data ?? [])];
    const query = search.trim().toLowerCase();
    if (query) rows = rows.filter((country) => country.name.toLowerCase().includes(query));
    if (filter === "assigned") rows = rows.filter((country) => assignedIds.has(country.country_id));
    if (filter === "free") rows = rows.filter((country) => !assignedIds.has(country.country_id));
    rows.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "pl");
      if (sort === "balance") return Number(b.balance) - Number(a.balance);
      if (sort === "military") return Number(b.military_value) - Number(a.military_value);
      return Number(b.gross_income) - Number(a.gross_income);
    });
    return rows;
  }, [assignedIds, countryQuery.data, filter, search, sort]);

  const create = useMutation({
    mutationFn: () => rpc("admin_create_country", { p_name: newName.trim(), p_flag: newFlag.trim() }),
    onSuccess: () => {
      toast.success("Państwo utworzone");
      setNewName(""); setNewFlag(""); setCreating(false);
      queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (countryQuery.isError || userQuery.isError) return <HudState icon={<ShieldAlert />} title="Nie udało się pobrać państw" description="Odśwież stronę i spróbuj ponownie." />;

  return (
    <div className="min-w-0 space-y-4">
      <Panel className="hud-frame min-w-0 p-3 sm:p-4">
        <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(12rem,1fr)_12rem_14rem_auto]">
          <div className="relative min-w-0">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="min-w-0 pl-9" placeholder="Szukaj państwa…" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <Select value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
            <SelectTrigger className="min-w-0"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Wszystkie państwa</SelectItem><SelectItem value="assigned">Z właścicielem</SelectItem><SelectItem value="free">Bez właściciela</SelectItem></SelectContent>
          </Select>
          <Select value={sort} onValueChange={(value) => setSort(value as typeof sort)}>
            <SelectTrigger className="min-w-0"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="income">Dochód malejąco</SelectItem><SelectItem value="balance">Skarbiec malejąco</SelectItem><SelectItem value="military">Wojsko malejąco</SelectItem><SelectItem value="name">Nazwa A–Z</SelectItem></SelectContent>
          </Select>
          <Button onClick={() => setCreating(true)}><PackagePlus />Dodaj państwo</Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Widoczne: <span className="num text-foreground">{list.length}</span> z {countryQuery.data?.length ?? 0}</p>
      </Panel>

      {countryQuery.isLoading ? <LoadingRows /> : list.length === 0 ? <HudState icon={<Search />} title="Brak wyników" description="Zmień wyszukiwanie lub wybrane filtry." /> : (
        <Panel className="min-w-0 overflow-hidden p-0">
          <div className="admin-scrollbar max-w-full overflow-x-auto">
            <div className="min-w-[46rem]">
              <div className="grid grid-cols-[minmax(14rem,1.5fr)_10rem_7rem_8rem_2rem] gap-3 border-b border-border bg-secondary/40 px-4 py-2 text-[10px] uppercase text-muted-foreground">
                <span>Państwo</span><span>Skarbiec</span><span>Regiony</span><span>Status</span><span />
              </div>
              {list.map((country) => {
                const owner = users.find((user) => user.country_id === country.country_id);
                return (
                  <Button key={country.country_id} variant="ghost" className="grid h-auto w-full grid-cols-[minmax(14rem,1.5fr)_10rem_7rem_8rem_2rem] items-center gap-3 rounded-none border-b border-border/70 px-4 py-3 text-left last:border-b-0 hover:bg-secondary/40" onClick={() => setOpenId(country.country_id)}>
                    <span className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center border border-border bg-secondary text-lg">{country.flag || "—"}</span><span className="min-w-0"><span className="block truncate font-semibold">{country.name}</span><span className="block truncate text-[11px] font-normal text-muted-foreground">+{fmtKR(country.gross_income)} / doba</span></span></span>
                    <span className="num text-primary">{fmtKR(country.balance)}</span>
                    <span className="num">{country.regions_count} / regiony</span>
                    <Badge variant={owner ? "outline" : "secondary"} className={owner ? "border-success/40 text-success" : "text-inactive"}>{owner ? "Przypisane" : "Wolne"}</Badge>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </Button>
                );
              })}
            </div>
          </div>
        </Panel>
      )}

      <CountryDashboard country={countryQuery.data?.find((country) => country.country_id === openId) ?? null} users={users} onClose={() => setOpenId(null)} />
      <ConfirmDialog open={creating} onOpenChange={setCreating} title="Utwórz nowe państwo" description="Nowe państwo zostanie dodane bez właściciela i będzie dostępne do przypisania graczowi." confirmLabel="Utwórz państwo" pending={create.isPending} disabled={!newName.trim()} onConfirm={() => create.mutate()}>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
          <Field label="Nazwa państwa"><Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Nazwa" /></Field>
          <Field label="Flaga (opcjonalnie)"><Input value={newFlag} onChange={(event) => setNewFlag(event.target.value)} placeholder="—" /></Field>
        </div>
      </ConfirmDialog>
    </div>
  );
}

function CountryDashboard({ country, users, onClose }: { country: CountryStats | null; users: AdminUser[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const regions = useQuery(regionsQuery(country?.country_id ?? null));
  const history = useQuery(transactionsQuery(country?.country_id ?? null, 50));
  const strikes = useQuery(strikesQuery);
  const shop = useQuery(adminShopQuery);
  const [changes, setChanges] = useState<Partial<Record<FieldKey, string>>>({});
  const [identity, setIdentity] = useState<{ name?: string; flag?: string }>({});
  const [confirmChanges, setConfirmChanges] = useState(false);
  const [regionName, setRegionName] = useState("");
  const [regionToRemove, setRegionToRemove] = useState<RegionWithSlots | null>(null);
  const [slotToRemove, setSlotToRemove] = useState<{ id: string; building: string; region: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => { setChanges({}); setIdentity({}); setRegionName(""); }, [country?.country_id]);

  const owner = country ? users.find((user) => user.country_id === country.country_id) : undefined;
  const patch = { ...identity, ...changes };
  const changedFields = Object.entries(patch).filter(([key, value]) => String(country?.[key as keyof CountryStats] ?? "") !== value);
  const destructive = changedFields.some(([key, value]) => key in FIELD_LABELS && Number(value) < Number(country?.[key as keyof CountryStats] ?? 0));

  const save = useMutation({
    mutationFn: () => country ? rpc("admin_adjust_country", { p_country_id: country.country_id, p_patch: patch, p_note: "Korekta z panelu administratora" }) : Promise.reject(new Error("Nie wybrano państwa")),
    onSuccess: () => { toast.success("Zapisano korektę"); setChanges({}); setIdentity({}); setConfirmChanges(false); queryClient.invalidateQueries(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const assign = useMutation({ mutationFn: (userId: string) => country ? rpc("admin_assign_country", { p_user_id: userId, p_country_id: country.country_id }) : Promise.reject(new Error("Nie wybrano państwa")), onSuccess: () => { toast.success("Właściciel państwa został zmieniony"); queryClient.invalidateQueries(); }, onError: (error: Error) => toast.error(error.message) });
  const addRegion = useMutation({ mutationFn: () => country ? rpc("admin_create_region", { p_country_id: country.country_id, p_name: regionName.trim() }) : Promise.reject(new Error("Nie wybrano państwa")), onSuccess: () => { toast.success("Region dodany"); setRegionName(""); queryClient.invalidateQueries(); }, onError: (error: Error) => toast.error(error.message) });
  const removeRegion = useMutation({ mutationFn: (id: string) => rpc("admin_delete_region", { p_region_id: id }), onSuccess: () => { toast.success("Region usunięty"); setRegionToRemove(null); queryClient.invalidateQueries(); }, onError: (error: Error) => toast.error(error.message) });
  const removeSlot = useMutation({ mutationFn: (id: string) => rpc("demolish_slot", { p_slot_id: id }), onSuccess: () => { toast.success("Obiekt wyburzony"); setSlotToRemove(null); queryClient.invalidateQueries(); }, onError: (error: Error) => toast.error(error.message) });
  const setRegionAa = useMutation({ mutationFn: ({ regionId, value }: { regionId: string; value: number }) => rpc("admin_set_region_aa", { p_region_id: regionId, p_value: value }), onSuccess: () => { toast.success("OPL regionu zaktualizowane"); queryClient.invalidateQueries(); }, onError: (error: Error) => toast.error(error.message) });
  const deleteCountry = useMutation({ mutationFn: () => country ? rpc("admin_delete_country", { p_country_id: country.country_id }) : Promise.reject(new Error("Nie wybrano państwa")), onSuccess: () => { toast.success("Państwo usunięte"); setConfirmDelete(false); onClose(); queryClient.invalidateQueries(); }, onError: (error: Error) => toast.error(error.message) });

  if (!country) return null;
  const countryStrikes = (strikes.data ?? []).filter((strike) => strike.attacker_country_id === country.country_id || strike.defender_country_id === country.country_id);

  return (
    <Dialog open={!!country} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="admin-dialog flex max-h-[94dvh] w-[calc(100%-1rem)] max-w-5xl min-w-0 flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100%-2rem)]">
        <div className="border-b border-border bg-secondary/30 p-4 pr-12 sm:p-5 sm:pr-12">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="flex min-w-0 items-center gap-3"><span className="grid size-11 shrink-0 place-items-center border border-primary/30 bg-primary/10 text-xl">{country.flag}</span><div className="min-w-0"><DialogTitle className="truncate text-lg uppercase sm:text-xl">{country.name}</DialogTitle><DialogDescription className="truncate">{owner?.display_name ?? "Państwo bez właściciela"}</DialogDescription></div></div>
            <Badge variant="outline" className="shrink-0 border-primary/40 text-primary">{country.regions_count} regionów</Badge>
          </div>
        </div>
        <Tabs defaultValue="quick" className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="admin-scrollbar shrink-0 overflow-x-auto border-b border-border bg-card px-2 sm:px-4">
            <TabsList className="h-auto min-w-max justify-start bg-transparent p-0">
              {([["quick","Szybka edycja"],["info","Informacje"],["regions","Regiony"],["history","Historia"]] as const).map(([value,label]) => <TabsTrigger key={value} value={value} className="rounded-none border-b-2 border-transparent px-3 py-3 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary">{label}</TabsTrigger>)}
            </TabsList>
          </div>
          <div className="admin-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-5">
            <TabsContent value="info" className="m-0 space-y-4">
              <SectionHeading icon={<Building2 />} title="Dane podstawowe" description="Nazwa, flaga i właściciel państwa" />
              <div className="grid gap-3 sm:grid-cols-2"><Field label="Nazwa"><Input value={identity.name ?? country.name} onChange={(event) => setIdentity((current) => ({ ...current, name: event.target.value }))} /></Field><Field label="Flaga"><Input value={identity.flag ?? country.flag} onChange={(event) => setIdentity((current) => ({ ...current, flag: event.target.value }))} /></Field></div>
              <Panel className="p-4"><Label className="label-hud mb-2 block">Właściciel</Label><Select value={owner?.id ?? "unassigned"} onValueChange={(value) => value !== "unassigned" && assign.mutate(value)}><SelectTrigger className="w-full min-w-0"><SelectValue placeholder="Wybierz gracza" /></SelectTrigger><SelectContent><SelectItem value="unassigned" disabled>Brak właściciela</SelectItem>{users.map((user) => <SelectItem key={user.id} value={user.id}>{user.display_name ?? "Użytkownik"}{user.country_name ? ` — ${user.country_name}` : ""}</SelectItem>)}</SelectContent></Select><p className="mt-2 text-xs text-muted-foreground">Wybranie gracza przypisze mu to państwo przez bezpieczną operację administracyjną.</p></Panel>
              <div className="grid gap-3 sm:grid-cols-3"><MiniStat label="Przychód dobowy" value={`+${fmtKR(country.gross_income)}`} tone="success" /><MiniStat label="Głosy wojenne" value={`${country.total_votes}`} /><MiniStat label="Wartość militarna" value={fmtKR(country.military_value)} tone="primary" /></div>
            </TabsContent>
            <TabsContent value="quick" className="m-0 space-y-6">
              <div className="space-y-3"><SectionHeading icon={<CircleDollarSign />} title="Skarbiec" description="Szybka korekta KR" /><AdjustmentField field="balance" country={country} value={changes.balance} onChange={(value) => setChanges((current) => ({ ...current, balance: value }))} /></div>
              <div className="space-y-3"><SectionHeading icon={<Boxes />} title="Surowce" description="Stan, produkcja i zużycie dobowe" /><div className="grid gap-3 lg:grid-cols-2">{RESOURCE_FIELDS.map((field) => <ResourceAdjustment key={field} field={field} country={country} value={changes[field]} onChange={(value) => setChanges((current) => ({ ...current, [field]: value }))} />)}</div></div>
              <div className="space-y-3"><SectionHeading icon={<Shield />} title="Wojsko" description="Żołnierze, czołgi i rakiety — bez limitów" /><div className="grid gap-3 lg:grid-cols-2">{MILITARY_FIELDS.map((field) => <MilitaryAdjustment key={field} field={field} country={country} value={changes[field]} onChange={(value) => setChanges((current) => ({ ...current, [field]: value }))} />)}</div><Panel className="grid gap-3 p-3 sm:grid-cols-3"><MiniStat label="Potencjał głosów" value={`${country.vote_potential}`} /><MiniStat label="Fortyfikacje" value={`${country.fort_votes} głosów`} /><MiniStat label="Razem" value={`${country.total_votes} głosów`} tone="primary" /></Panel></div>
              <div className="space-y-3"><SectionHeading icon={<Radar />} title="OPL regionów" description={`Łącznie ${units(country.region_aa_total)} — jedna wartość dla całej gry`} /><RegionAaEditor regions={regions.data ?? []} pending={setRegionAa.isPending} onSave={(regionId, value) => setRegionAa.mutate({ regionId, value })} /></div>
            </TabsContent>
            <TabsContent value="regions" className="m-0 space-y-4"><RegionManagement country={country} regions={regions.data ?? []} shopItems={shop.data ?? []} regionName={regionName} onRegionName={setRegionName} onAdd={() => addRegion.mutate()} adding={addRegion.isPending} onRemoveRegion={setRegionToRemove} onRemoveSlot={setSlotToRemove} loading={regions.isLoading} /></TabsContent>
            <TabsContent value="history" className="m-0 space-y-4"><CountryHistory transactions={(history.data ?? []) as unknown as TransactionRow[]} strikes={countryStrikes} countryId={country.country_id} loading={history.isLoading || strikes.isLoading} /></TabsContent>
          </div>
        </Tabs>
        <div className="grid shrink-0 gap-2 border-t border-border bg-card p-3 sm:grid-cols-[1fr_auto_auto] sm:p-4"><p className="self-center text-xs text-muted-foreground">{changedFields.length ? `${changedFields.length} niezapisane zmiany` : "Brak niezapisanych zmian"}</p><Button variant="destructive" onClick={() => setConfirmDelete(true)}><Trash2 />Usuń państwo</Button><Button disabled={!changedFields.length} onClick={() => setConfirmChanges(true)}>Zapisz zmiany</Button></div>

        <ConfirmDialog open={confirmChanges} onOpenChange={setConfirmChanges} title={destructive ? "Potwierdź operację zmniejszającą wartości" : "Potwierdź korektę państwa"} description={`Państwo: ${country.name}. Zmiana zostanie zapisana w dzienniku audytowym.`} confirmLabel="Zatwierdź korektę" destructive={destructive} pending={save.isPending} onConfirm={() => save.mutate()}>
          <div className="space-y-2">{changedFields.map(([key,value]) => <ChangePreview key={key} label={FIELD_LABELS[key as FieldKey] ?? (key === "name" ? "Nazwa" : "Flaga")} current={String(country[key as keyof CountryStats] ?? "")} next={String(value ?? "")} currency={key === "balance"} />)}</div>
        </ConfirmDialog>
        <ConfirmDialog open={!!regionToRemove} onOpenChange={(open) => !open && setRegionToRemove(null)} title={`Usunąć region ${regionToRemove?.name ?? ""}?`} description={`Państwo: ${country.name}. Wszystkie obiekty w regionie zostaną bezpowrotnie usunięte, a terytorium utraci region.`} confirmLabel="Usuń region" destructive pending={removeRegion.isPending} onConfirm={() => regionToRemove && removeRegion.mutate(regionToRemove.id)} />
        <ConfirmDialog open={!!slotToRemove} onOpenChange={(open) => !open && setSlotToRemove(null)} title="Wyburzyć obiekt?" description={`Państwo: ${country.name}. Region: ${slotToRemove?.region ?? ""}. Obiekt: ${BUILDING_LABELS[slotToRemove?.building ?? ""] ?? slotToRemove?.building ?? ""}. Slot zostanie zwolniony bez zwrotu kosztów.`} confirmLabel="Wyburz obiekt" destructive pending={removeSlot.isPending} onConfirm={() => slotToRemove && removeSlot.mutate(slotToRemove.id)} />
        <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title={`Usunąć państwo ${country.name}?`} description="Operacja jest NIEODWRACALNA. Regiony, budynki, historia i operacje rakietowe tego państwa zostaną trwale usunięte, a właściciel straci przypisanie. Operacja zostanie zapisana w audycie." confirmLabel="Usuń trwale" destructive pending={deleteCountry.isPending} onConfirm={() => deleteCountry.mutate()} />
      </DialogContent>
    </Dialog>
  );
}

function AdjustmentField({ field, country, value, onChange }: { field: FieldKey; country: CountryStats; value: string | undefined; onChange: (value: string) => void }) {
  const current = Number(country[field]) || 0;
  const next = value === undefined || value === "" ? current : Math.max(0, Number(value) || 0);
  const delta = next - current;
  const step = field === "balance" ? 100_000_000_000 : 1;
  const format = (number: number) => field === "balance" ? fmtKR(number) : fmtNum(number);
  return (
    <Panel className="min-w-0 p-3 sm:p-4">
      <Label className="label-hud">{FIELD_LABELS[field]}</Label>
      <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-end">
        <ValueBox label="Aktualna" value={format(current)} />
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-1.5"><Button variant="outline" size="icon" aria-label={`Zmniejsz ${FIELD_LABELS[field]}`} onClick={() => onChange(String(Math.max(0, next - step)))}>−</Button><div className="min-w-0"><span className="mb-1 block text-[10px] uppercase text-muted-foreground">Zmiana +/-</span><Input className="num min-w-0" type="number" value={value ?? String(current)} onChange={(event) => onChange(event.target.value)} /></div><Button variant="outline" size="icon" aria-label={`Zwiększ ${FIELD_LABELS[field]}`} onClick={() => onChange(String(next + step))}>+</Button></div>
        <ValueBox label="Nowa" value={format(next)} tone={delta > 0 ? "success" : delta < 0 ? "destructive" : "muted"} hint={`${delta > 0 ? "+" : ""}${format(delta)}`} />
      </div>
    </Panel>
  );
}

function ResourceAdjustment(props: Omit<Parameters<typeof AdjustmentField>[0], "field"> & { field: FieldKey }) {
  const productionKey = `${props.field}_prod` as keyof CountryStats;
  const production = Number(props.country[productionKey] ?? 0);
  const upkeep = props.field === "coal" ? Number(props.country.coal_upkeep) : 0;
  return <div className="space-y-1"><AdjustmentField {...props} /><p className="px-1 text-[11px] text-muted-foreground">Produkcja: <span className="text-success">+{fmtNum(production)}</span>{upkeep ? <> · Zużycie: <span className="text-destructive">−{fmtNum(upkeep)}</span></> : null}</p></div>;
}

function MilitaryAdjustment(props: Omit<Parameters<typeof AdjustmentField>[0], "field"> & { field: FieldKey }) {
  const Icon = MILITARY_ICONS[props.field] ?? Shield;
  return <div className="relative"><span className="pointer-events-none absolute right-4 top-4 z-10 text-primary"><Icon className="size-4" strokeWidth={1.5} /></span><AdjustmentField {...props} /></div>;
}

function ValueBox({ label, value, hint, tone = "default" }: { label: string; value: string; hint?: string; tone?: "default" | "success" | "destructive" | "muted" }) {
  const toneClass = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : tone === "muted" ? "text-inactive" : "text-foreground";
  return <div className="min-w-0 border border-border/70 bg-secondary/30 p-2"><span className="block text-[10px] uppercase text-muted-foreground">{label}</span><span className={`num mt-1 block break-words text-sm ${toneClass}`}>{value}</span>{hint ? <span className={`num mt-0.5 block text-[10px] ${toneClass}`}>{hint}</span> : null}</div>;
}

function RegionAaEditor({ regions, pending, onSave }: { regions: RegionWithSlots[]; pending: boolean; onSave: (regionId: string, value: number) => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  if (regions.length === 0) return <EmptyLine text="To państwo nie ma regionów." />;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {regions.map((region) => {
        const raw = values[region.id];
        const next = raw === undefined || raw === "" ? region.aa_defense : Math.max(0, Number(raw) || 0);
        return (
          <Panel key={region.id} className="min-w-0 p-3">
            <Label className="label-hud truncate">{region.name}</Label>
            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <Input className="num min-w-0" type="number" min="0" value={raw ?? String(region.aa_defense)} onChange={(event) => setValues((current) => ({ ...current, [region.id]: event.target.value }))} />
              <Button size="sm" disabled={pending || next === region.aa_defense} onClick={() => onSave(region.id, next)}>Zapisz</Button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">Aktualne OPL: <span className="num text-info">{units(region.aa_defense)}</span></p>
          </Panel>
        );
      })}
    </div>
  );
}

function RegionManagement({ country, regions, shopItems, regionName, onRegionName, onAdd, adding, onRemoveRegion, onRemoveSlot, loading }: { country: CountryStats; regions: RegionWithSlots[]; shopItems: ShopItem[]; regionName: string; onRegionName: (value: string) => void; onAdd: () => void; adding: boolean; onRemoveRegion: (region: RegionWithSlots) => void; onRemoveSlot: (slot: { id: string; building: string; region: string }) => void; loading: boolean }) {
  const itemByBuilding = new Map(shopItems.filter((item) => item.building).map((item) => [item.building, item]));
  return <div className="space-y-4"><SectionHeading icon={<Warehouse />} title="Regiony i terytorium" description={`${country.regions_count} regionów · po 9 slotów w każdym`} /><Panel className="p-3"><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><Input value={regionName} onChange={(event) => onRegionName(event.target.value)} placeholder="Nazwa nowego regionu" /><Button disabled={!regionName.trim() || adding} onClick={onAdd}><PackagePlus />Dodaj region</Button></div></Panel>{loading ? <LoadingRows /> : regions.length === 0 ? <HudState icon={<Warehouse />} title="Brak regionów" description="Dodaj pierwszy region tego państwa." /> : <div className="space-y-3">{regions.map((region) => {
    const income = region.slots.reduce((sum, slot) => sum + Number(itemByBuilding.get(slot.building)?.income_kr ?? 0), 0);
    const production = region.slots.reduce<Record<string, number>>((totals, slot) => { const item = itemByBuilding.get(slot.building); if (item?.produces) totals[item.produces] = (totals[item.produces] ?? 0) + Number(item.produces_amount); return totals; }, {});
    return <Panel key={region.id} className="min-w-0 overflow-hidden p-0"><div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-border p-3"><div className="min-w-0"><p className="truncate font-semibold">{region.name}</p><p className="mt-1 text-xs text-muted-foreground">{region.slots.length}/9 slotów · <span className="text-success">+{fmtKR(income)} / doba</span></p></div><Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" aria-label={`Usuń region ${region.name}`} onClick={() => onRemoveRegion(region)}><Trash2 /></Button></div><div className="grid gap-2 p-3 sm:grid-cols-3">{Array.from({ length: 9 }, (_, index) => { const slot = region.slots.find((entry) => entry.slot_index === index + 1); return slot ? <div key={index} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border border-primary/20 bg-primary/5 p-2"><span className="min-w-0"><span className="block text-[10px] text-muted-foreground">SLOT {index + 1}</span><span className="block truncate text-xs">{BUILDING_LABELS[slot.building] ?? slot.building}</span></span><Button size="icon" variant="ghost" className="size-7 text-destructive hover:text-destructive" aria-label={`Wyburz ${BUILDING_LABELS[slot.building] ?? slot.building}`} onClick={() => onRemoveSlot({ id: slot.id, building: slot.building, region: region.name })}><Trash2 className="size-3.5" /></Button></div> : <div key={index} className="border border-dashed border-border p-2 text-inactive"><span className="block text-[10px]">SLOT {index + 1}</span><span className="text-xs">Pusty</span></div>; })}</div>{Object.keys(production).length ? <div className="flex flex-wrap gap-2 border-t border-border px-3 py-2">{Object.entries(production).map(([resource, amount]) => <Badge key={resource} variant="outline" className="border-success/30 text-success">{RESOURCE_LABELS[resource] ?? resource} +{fmtNum(amount)}</Badge>)}</div> : null}</Panel>;
  })}</div>}</div>;
}

function CountryHistory({ transactions, strikes, countryId, loading }: { transactions: TransactionRow[]; strikes: MissileStrike[]; countryId: string; loading: boolean }) {
  const [showZero, setShowZero] = useState(false);
  const visible = transactions.filter((transaction) => showZero || Number(transaction.amount_kr) !== 0);
  if (loading) return <LoadingRows />;
  return <div className="space-y-4"><div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3"><SectionHeading icon={<History />} title="Historia państwa" description="Operacje ekonomiczne i rakietowe" /><div className="flex items-center gap-2"><Switch checked={showZero} onCheckedChange={setShowZero} /><span className="text-xs text-muted-foreground">Pokaż 0 KR</span></div></div><Panel className="divide-y divide-border p-0">{visible.map((transaction) => <TransactionItem key={transaction.id} transaction={transaction} country={undefined} />)}{visible.length === 0 ? <EmptyLine text="Brak operacji ekonomicznych." /> : null}</Panel><SectionTitle>Operacje rakietowe</SectionTitle><Panel className="divide-y divide-border p-0">{strikes.map((strike) => <div key={strike.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 p-3"><div className="min-w-0"><p className="truncate text-sm">{strike.attacker_country_id === countryId ? "Atak" : "Obrona"}: {MISSILE_LABELS[strike.missile_code] ?? strike.missile_code} · {strike.region_name}</p><p className="text-xs text-muted-foreground">{dateTime(strike.created_at)} · OPL {strike.aa_defense}</p></div><Badge variant={strike.result === "PRZECHWYCONA" ? "outline" : "destructive"} className={strike.result === "PRZECHWYCONA" ? "border-success/40 text-success" : ""}>{strike.result}</Badge></div>)}{strikes.length === 0 ? <EmptyLine text="Brak operacji rakietowych." /> : null}</Panel></div>;
}

function UsersTab({ isMainAdmin }: { isMainAdmin: boolean }) {
  const userQuery = useQuery(adminUsersQuery);
  const countryQuery = useQuery(countriesQuery);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const users = ((userQuery.data ?? []) as AdminUser[]).filter((user) => `${user.display_name ?? ""} ${user.country_name ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  const assign = useMutation({ mutationFn: ({ userId, countryId }: { userId: string; countryId: string }) => rpc("admin_assign_country", { p_user_id: userId, p_country_id: countryId }), onSuccess: () => { toast.success("Państwo przypisane"); queryClient.invalidateQueries(); }, onError: (error: Error) => toast.error(error.message) });
  const setRole = useMutation({ mutationFn: ({ userId, role }: { userId: string; role: string }) => rpc("set_user_role", { p_user_id: userId, p_role: role }), onSuccess: () => { toast.success("Uprawnienia zmienione"); queryClient.invalidateQueries(); }, onError: (error: Error) => toast.error(error.message) });
  const [toDelete, setToDelete] = useState<AdminUser | null>(null);
  const deleteUser = useServerFn(deletePlayerAccount);
  const removeUser = useMutation({ mutationFn: (userId: string) => deleteUser({ data: { userId } }), onSuccess: () => { toast.success("Konto gracza usunięte"); setToDelete(null); queryClient.invalidateQueries(); }, onError: (error: Error) => toast.error(error.message) });
  return <div className="space-y-4"><Panel className="hud-frame p-3"><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Szukaj użytkownika lub państwa…" value={search} onChange={(event) => setSearch(event.target.value)} /></div></Panel>{userQuery.isLoading ? <LoadingRows /> : users.length === 0 ? <HudState icon={<Users />} title="Brak użytkowników" description="Nie znaleziono użytkowników dla podanego wyszukiwania." /> : <div className="grid gap-3 xl:grid-cols-2">{users.map((user) => <Panel key={user.id} className="min-w-0 p-4"><div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3"><div className="min-w-0"><p className="truncate font-semibold">{user.display_name ?? "Użytkownik"}</p><p className="truncate text-xs text-muted-foreground">{user.country_name ?? "Bez przypisanego państwa"}</p></div><Badge variant="outline" className="shrink-0 border-primary/40 text-primary">{ROLE_LABELS[user.role ?? "PLAYER"]}</Badge></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Przypisane państwo"><Select value={user.country_id ?? "unassigned"} onValueChange={(value) => value !== "unassigned" && assign.mutate({ userId: user.id, countryId: value })}><SelectTrigger className="min-w-0"><SelectValue placeholder="Brak" /></SelectTrigger><SelectContent><SelectItem value="unassigned" disabled>Brak przypisania</SelectItem>{(countryQuery.data ?? []).map((country) => <SelectItem key={country.country_id} value={country.country_id}>{country.flag} {country.name}</SelectItem>)}</SelectContent></Select></Field>{isMainAdmin ? <Field label="Uprawnienia"><Select value={user.role ?? "PLAYER"} onValueChange={(role) => setRole.mutate({ userId: user.id, role })}><SelectTrigger className="min-w-0"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PLAYER">Gracz</SelectItem><SelectItem value="ADMIN">Administrator</SelectItem><SelectItem value="MAIN_ADMIN">Główny administrator</SelectItem></SelectContent></Select></Field> : null}</div><div className="mt-3 flex justify-end"><Button size="sm" variant="destructive" onClick={() => setToDelete(user)}><Trash2 />Usuń konto</Button></div></Panel>)}</div>}{!isMainAdmin ? <p className="text-xs text-muted-foreground">Zmiana uprawnień jest dostępna wyłącznie dla głównego administratora.</p> : null}<ConfirmDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)} title={`Usunąć konto ${toDelete?.display_name ?? "gracza"}?`} description="Operacja jest NIEODWRACALNA. Konto, profil i uprawnienia zostaną trwale usunięte, a państwo zwolnione. Operacja zostanie zapisana w audycie." confirmLabel="Usuń trwale" destructive pending={removeUser.isPending} onConfirm={() => toDelete && removeUser.mutate(toDelete.id)} /></div>;
}

function ShopTab() {
  const itemQuery = useQuery(adminShopQuery);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [visibility, setVisibility] = useState("all");
  const [edit, setEdit] = useState<Record<string, string> | null>(null);
  const categories = [...new Set((itemQuery.data ?? []).map((item) => item.category))];
  const items = (itemQuery.data ?? []).filter((item) => item.name.toLowerCase().includes(search.toLowerCase()) && (category === "all" || item.category === category) && (visibility === "all" || String(item.active) === visibility));
  const save = useMutation({ mutationFn: (payload: Record<string, string>) => rpc("admin_upsert_shop_item", { p_item: payload }), onSuccess: () => { toast.success("Produkt zapisany"); setEdit(null); queryClient.invalidateQueries(); }, onError: (error: Error) => toast.error(error.message) });
  const toggle = useMutation({ mutationFn: ({ code, active }: { code: string; active: boolean }) => rpc("admin_toggle_shop_item", { p_code: code, p_active: active }), onSuccess: () => { toast.success("Widoczność zmieniona"); queryClient.invalidateQueries(); }, onError: (error: Error) => toast.error(error.message) });
  const emptyForm = { code: "", name: "", category: "INNE", description: "", building: "", produces: "", active: "true", cost_kr: "0", cost_coal: "0", cost_oil: "0", cost_copper: "0", cost_iron: "0", cost_uranium: "0", income_kr: "0", upkeep_coal: "0", produces_amount: "0", sort_order: "100" };
  const toForm = (item: ShopItem) => ({ code: item.code, name: item.name, category: item.category, description: item.description, building: item.building ?? "", produces: item.produces ?? "", active: String(item.active), cost_kr: item.cost_kr, cost_coal: item.cost_coal, cost_oil: item.cost_oil, cost_copper: item.cost_copper, cost_iron: item.cost_iron, cost_uranium: item.cost_uranium, income_kr: item.income_kr, upkeep_coal: item.upkeep_coal, produces_amount: item.produces_amount, sort_order: String(item.sort_order) });
  return <div className="space-y-4"><Panel className="hud-frame p-3"><div className="grid gap-2 lg:grid-cols-[minmax(12rem,1fr)_12rem_11rem_auto]"><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Szukaj produktu…" value={search} onChange={(event) => setSearch(event.target.value)} /></div><Select value={category} onValueChange={setCategory}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Wszystkie kategorie</SelectItem>{categories.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select><Select value={visibility} onValueChange={setVisibility}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Każda widoczność</SelectItem><SelectItem value="true">Widoczne</SelectItem><SelectItem value="false">Ukryte</SelectItem></SelectContent></Select><Button onClick={() => setEdit(emptyForm)}><PackagePlus />Dodaj produkt</Button></div></Panel>{itemQuery.isLoading ? <LoadingRows /> : items.length === 0 ? <HudState icon={<ShoppingCart />} title="Brak produktów" description="Zmień filtry lub dodaj nowy produkt." /> : <div className="grid gap-3 lg:grid-cols-2">{items.map((item) => <Panel key={item.code} className="min-w-0 p-4"><div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3"><Button variant="ghost" className="h-auto min-w-0 justify-start p-0 text-left hover:bg-transparent" onClick={() => setEdit(toForm(item))}><span className="min-w-0"><span className={`block truncate font-semibold ${item.active ? "" : "text-inactive"}`}>{item.name}</span><span className="block truncate text-[11px] font-normal text-muted-foreground">{item.category} · {item.code}</span></span></Button><Switch checked={item.active} onCheckedChange={(active) => toggle.mutate({ code: item.code, active })} /></div><div className="mt-3 grid grid-cols-2 gap-2"><ValueBox label="Cena" value={fmtKR(item.cost_kr)} /><ValueBox label="Efekt / doba" value={Number(item.income_kr) ? `+${fmtKR(item.income_kr)}` : item.produces ? `+${fmtNum(item.produces_amount)} ${RESOURCE_LABELS[item.produces] ?? item.produces}` : "—"} tone={Number(item.income_kr) || item.produces ? "success" : "muted"} /></div></Panel>)}</div>}<ProductDialog edit={edit} items={itemQuery.data ?? []} onEdit={setEdit} onSave={(payload) => save.mutate(payload)} pending={save.isPending} /></div>;
}

function ProductDialog({ edit, items, onEdit, onSave, pending }: { edit: Record<string, string> | null; items: ShopItem[]; onEdit: (value: Record<string, string> | null) => void; onSave: (value: Record<string, string>) => void; pending: boolean }) {
  return <Dialog open={!!edit} onOpenChange={(open) => !open && onEdit(null)}><DialogContent className="admin-dialog max-h-[92dvh] w-[calc(100%-1rem)] max-w-3xl overflow-y-auto sm:w-[calc(100%-2rem)]"><DialogHeader><DialogTitle>{edit?.["code"] ? "Edycja produktu" : "Nowy produkt"}</DialogTitle><DialogDescription>Te wartości są wspólnym źródłem dla sklepu i walidacji zakupów.</DialogDescription></DialogHeader>{edit ? <div className="space-y-5"><section><p className="label-hud mb-3">Identyfikacja</p><div className="grid gap-3 sm:grid-cols-2">{([["code","Kod produktu"],["name","Nazwa"],["category","Kategoria"],["building","Typ budynku"],["produces","Produkowany surowiec"]] as const).map(([key,label]) => <Field key={key} label={label}><Input value={edit[key] ?? ""} disabled={key === "code" && items.some((item) => item.code === edit["code"])} onChange={(event) => onEdit({ ...edit, [key]: event.target.value })} /></Field>)}</div><Field label="Opis" className="mt-3"><Input value={edit["description"] ?? ""} onChange={(event) => onEdit({ ...edit, description: event.target.value })} /></Field></section><section><p className="label-hud mb-3">Koszty i efekty</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{SHOP_NUMERIC.map(([key,label]) => <Field key={key} label={label}><Input className="num" type="number" min="0" value={edit[key] ?? "0"} onChange={(event) => onEdit({ ...edit, [key]: event.target.value })} /></Field>)}</div></section><div className="flex items-center gap-3 border border-border p-3"><Switch checked={edit["active"] === "true"} onCheckedChange={(active) => onEdit({ ...edit, active: String(active) })} /><span className="text-sm">Produkt widoczny w sklepie</span></div><div className="grid gap-2 sm:grid-cols-2"><Button variant="outline" onClick={() => onEdit(null)}>Anuluj</Button><Button disabled={!(edit["code"] ?? "").trim() || !(edit["name"] ?? "").trim() || pending} onClick={() => onSave(edit)}>{pending ? "Zapisywanie…" : "Zapisz produkt"}</Button></div></div> : null}</DialogContent></Dialog>;
}

function EconomyTab({ countdown }: { countdown: string }) {
  const runQuery = useQuery(economyRunsQuery);
  const countryQuery = useQuery(countriesQuery);
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const runs = (runQuery.data ?? []) as unknown as EconomyRun[];
  const totals = (countryQuery.data ?? []).reduce((sum, country) => ({ income: sum.income + Number(country.gross_income), coal: sum.coal + Number(country.coal_prod), oil: sum.oil + Number(country.oil_prod), copper: sum.copper + Number(country.copper_prod), iron: sum.iron + Number(country.iron_prod), uranium: sum.uranium + Number(country.uranium_prod), upkeep: sum.upkeep + Number(country.coal_upkeep) }), { income: 0, coal: 0, oil: 0, copper: 0, iron: 0, uranium: 0, upkeep: 0 });
  const run = useMutation({ mutationFn: () => rpc<{ ok: boolean; reason?: string }>("run_daily_economy", {}), onSuccess: (result) => { result?.ok ? toast.success("Cykl dobowy rozliczony") : toast.info("Cykl na dzisiaj został już rozliczony"); setConfirm(false); queryClient.invalidateQueries(); }, onError: (error: Error) => toast.error(error.message) });
  return <div className="space-y-4"><div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"><Panel className="hud-frame p-5"><div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3"><div><p className="label-hud">Następny automatyczny cykl</p><p className="num mt-2 text-3xl text-primary sm:text-4xl">{countdown}</p><p className="mt-2 text-xs text-muted-foreground">Codziennie o 20:00 czasu polskiego</p></div><CalendarClock className="size-7 text-primary" /></div><Button className="mt-5 w-full sm:w-auto" onClick={() => setConfirm(true)}>Uruchom cykl teraz</Button></Panel><Panel className="p-4"><p className="label-hud">Prognoza kolejnego cyklu</p><div className="mt-3 grid grid-cols-2 gap-2"><ValueBox label="Przychód KR" value={`+${fmtKR(totals.income)}`} tone="success" /><ValueBox label="Zużycie węgla" value={`−${fmtNum(totals.upkeep)}`} tone="destructive" />{[["Węgiel",totals.coal],["Ropa",totals.oil],["Miedź",totals.copper],["Żelazo",totals.iron],["Uran",totals.uranium]].map(([label,value]) => <ValueBox key={String(label)} label={String(label)} value={`+${fmtNum(Number(value))}`} tone="success" />)}</div></Panel></div><SectionTitle>Ostatnie rozliczenia</SectionTitle><Panel className="divide-y divide-border p-0">{runs.filter((entry) => Number(entry.summary?.["total_kr"] ?? 0) !== 0).map((entry) => <div key={entry.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 p-3"><div className="min-w-0"><p className="text-sm">Cykl {entry.run_date}</p><p className="text-xs text-muted-foreground">{dateTime(entry.ran_at)}</p></div><p className="num shrink-0 text-sm text-success">+{fmtKR(String(entry.summary?.["total_kr"] ?? 0))}</p></div>)}{runs.length === 0 ? <EmptyLine text="Brak rozliczonych cykli." /> : null}</Panel><ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Uruchomić cykl dobowy?" description={`Operacja obejmie ${countryQuery.data?.length ?? 0} państw. Zostaną naliczone dochody i produkcja oraz pobrany węgiel. Dzisiejszego cyklu nie można naliczyć dwukrotnie.`} confirmLabel="Uruchom cykl" destructive pending={run.isPending} onConfirm={() => run.mutate()}><div className="grid grid-cols-2 gap-2"><ValueBox label="Prognozowany przychód" value={`+${fmtKR(totals.income)}`} tone="success" /><ValueBox label="Prognozowane zużycie" value={`−${fmtNum(totals.upkeep)} węgla`} tone="destructive" /></div></ConfirmDialog></div>;
}

type HistoryFilter = "all" | "adjustments" | "build" | "cycles" | "military" | "missiles";
function HistoryTab() {
  const txQuery = useQuery(transactionsQuery(null, 100));
  const actionQuery = useQuery(adminActionsQuery);
  const strikeQuery = useQuery(strikesQuery);
  const countryQuery = useQuery(countriesQuery);
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [hideZero, setHideZero] = useState(true);
  const countries = new Map((countryQuery.data ?? []).map((country) => [country.country_id, country.name]));
  const transactions = ((txQuery.data ?? []) as unknown as TransactionRow[]).filter((transaction) => !hideZero || Number(transaction.amount_kr) !== 0).filter((transaction) => filter === "all" || classifyTransaction(transaction) === filter);
  const actions = ((actionQuery.data ?? []) as unknown as AdminActionRow[]).filter(() => filter === "all" || filter === "adjustments");
  const strikes = (strikeQuery.data ?? []).filter(() => filter === "all" || filter === "missiles");
  const loading = txQuery.isLoading || actionQuery.isLoading || strikeQuery.isLoading;
  return <div className="space-y-4"><Panel className="hud-frame p-3"><div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="admin-scrollbar overflow-x-auto"><div className="flex min-w-max gap-1">{([['all','Wszystkie'],['adjustments','Korekty'],['build','Budowa'],['cycles','Cykle'],['military','Wojsko'],['missiles','Rakiety']] as [HistoryFilter,string][]).map(([value,label]) => <Button key={value} size="sm" variant={filter === value ? "secondary" : "ghost"} className={filter === value ? "text-primary" : "text-muted-foreground"} onClick={() => setFilter(value)}>{label}</Button>)}</div></div><div className="flex items-center gap-2"><Switch checked={hideZero} onCheckedChange={setHideZero} /><span className="whitespace-nowrap text-xs">Ukryj 0 KR</span></div></div></Panel>{loading ? <LoadingRows /> : <div className="space-y-4">{(filter === "all" || filter !== "adjustments" && filter !== "missiles") ? <><SectionTitle>Operacje</SectionTitle><Panel className="divide-y divide-border p-0">{transactions.map((transaction) => <TransactionItem key={transaction.id} transaction={transaction} country={transaction.country_id ? countries.get(transaction.country_id) : undefined} />)}{transactions.length === 0 ? <EmptyLine text="Brak operacji dla wybranego filtra." /> : null}</Panel></> : null}{filter === "all" || filter === "adjustments" ? <><SectionTitle>Zmiany administracyjne</SectionTitle><Panel className="divide-y divide-border p-0">{actions.map((action) => <AuditItem key={action.id} action={action} country={action.country_id ? countries.get(action.country_id) : undefined} />)}{actions.length === 0 ? <EmptyLine text="Brak zmian administracyjnych." /> : null}</Panel></> : null}{filter === "all" || filter === "missiles" ? <><SectionTitle>Operacje rakietowe</SectionTitle><Panel className="divide-y divide-border p-0">{strikes.map((strike) => <div key={strike.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 p-3"><div className="min-w-0"><p className="truncate text-sm">{MISSILE_LABELS[strike.missile_code] ?? strike.missile_code} · {strike.region_name}</p><p className="truncate text-xs text-muted-foreground">{countries.get(strike.attacker_country_id ?? "") ?? "Nieznane"} → {countries.get(strike.defender_country_id ?? "") ?? "Nieznane"} · {dateTime(strike.created_at)}</p></div><Badge variant={strike.result === "PRZECHWYCONA" ? "outline" : "destructive"} className={strike.result === "PRZECHWYCONA" ? "border-success/40 text-success" : ""}>{strike.result}</Badge></div>)}{strikes.length === 0 ? <EmptyLine text="Brak operacji rakietowych." /> : null}</Panel></> : null}</div>}</div>;
}

function classifyTransaction(transaction: TransactionRow): HistoryFilter {
  const kind = transaction.kind.toUpperCase();
  if (kind.includes("BUILD") || kind.includes("DEMOL")) return "build";
  if (kind.includes("DAILY") || kind.includes("ECONOMY") || kind.includes("CYCLE")) return "cycles";
  if (kind.includes("STRIKE") || kind.includes("DEFENSE")) return "missiles";
  if (kind.includes("PURCHASE") || /żołnier|czołg|opl|rakiet/i.test(transaction.label)) return "military";
  return "adjustments";
}

function TransactionItem({ transaction, country }: { transaction: TransactionRow; country: string | undefined }) {
  const amount = Number(transaction.amount_kr);
  return <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 p-3"><div className="min-w-0"><p className="truncate text-sm">{transaction.label}</p><p className="truncate text-xs text-muted-foreground">{country ? `${country} · ` : ""}{dateTime(transaction.created_at)}</p></div><p className={`num shrink-0 text-sm ${amount > 0 ? "text-success" : amount < 0 ? "text-destructive" : "text-inactive"}`}>{amount > 0 ? "+" : ""}{fmtKR(transaction.amount_kr)}</p></div>;
}

function AuditItem({ action, country }: { action: AdminActionRow; country: string | undefined }) {
  const oldValues = (action.details?.["old"] ?? {}) as Record<string, unknown>;
  const newValues = (action.details?.["new"] ?? {}) as Record<string, unknown>;
  const keys = Object.keys(newValues);
  return <div className="min-w-0 p-3"><div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3"><div className="min-w-0"><p className="truncate text-sm">{action.action}</p><p className="truncate text-xs text-muted-foreground">{country ?? "Operacja globalna"}</p></div><p className="shrink-0 text-xs text-muted-foreground">{dateTime(action.created_at)}</p></div>{keys.length ? <div className="admin-scrollbar mt-2 max-w-full overflow-x-auto"><div className="flex min-w-max gap-2">{keys.map((key) => <div key={key} className="border border-border bg-secondary/30 px-2 py-1 text-xs"><span className="text-muted-foreground">{FIELD_LABELS[key as FieldKey] ?? key}: </span><span className="num text-destructive">{units(String(oldValues[key] ?? "—"))}</span><span className="mx-1 text-muted-foreground">→</span><span className="num text-success">{units(String(newValues[key] ?? "—"))}</span></div>)}</div></div> : null}</div>;
}

function ChangePreview({ label, current, next, currency }: { label: string; current: string; next: string; currency: boolean }) {
  const format = (value: string) => currency ? fmtKR(value) : value;
  const difference = Number(next) - Number(current);
  return <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border border-border bg-secondary/30 p-2"><span className="truncate text-xs text-muted-foreground">{label}</span><span className="num text-right text-xs"><span className="text-inactive">{format(current)}</span><span className="mx-2">→</span><span className={difference < 0 ? "text-destructive" : difference > 0 ? "text-success" : "text-foreground"}>{format(next)}</span></span></div>;
}

function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, destructive = false, pending = false, disabled = false, onConfirm, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; confirmLabel: string; destructive?: boolean; pending?: boolean; disabled?: boolean; onConfirm: () => void; children?: ReactNode }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="admin-dialog w-[calc(100%-1rem)] max-w-lg sm:w-[calc(100%-2rem)]"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>{children}<div className="grid gap-2 sm:grid-cols-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button><Button variant={destructive ? "destructive" : "default"} disabled={pending || disabled} onClick={onConfirm}>{pending ? "Przetwarzanie…" : confirmLabel}</Button></div></DialogContent></Dialog>;
}

function SectionHeading({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return <div className="flex min-w-0 items-start gap-3"><span className="grid size-9 shrink-0 place-items-center border border-primary/30 bg-primary/10 text-primary [&_svg]:size-4">{icon}</span><div className="min-w-0"><h3 className="font-display truncate text-sm font-semibold uppercase">{title}</h3><p className="text-xs text-muted-foreground">{description}</p></div></div>;
}
function MiniStat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "success" | "primary" }) { return <Panel className="min-w-0 p-3"><p className="label-hud truncate">{label}</p><p className={`num mt-1 break-words text-sm ${tone === "success" ? "text-success" : tone === "primary" ? "text-primary" : ""}`}>{value}</p></Panel>; }
function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) { return <div className={`min-w-0 space-y-1.5 ${className}`}><Label className="label-hud">{label}</Label>{children}</div>; }
function LoadingRows() { return <Panel className="space-y-3 p-4" aria-label="Ładowanie"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-4/5" /></Panel>; }
function EmptyLine({ text }: { text: string }) { return <p className="p-4 text-center text-sm text-muted-foreground">{text}</p>; }
