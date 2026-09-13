import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Panel, SectionTitle } from "@/components/stat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  adminActionsQuery,
  adminUsersQuery,
  countriesQuery,
  economyRunsQuery,
  meQuery,
  regionsQuery,
  rpc,
  transactionsQuery,
} from "@/lib/api";
import { ROLE_LABELS, dateTime, kr, krShort, units } from "@/lib/format";

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
  ["balance", "Skarbiec (KR)"],
  ["coal", "Węgiel"],
  ["oil", "Ropa"],
  ["copper", "Miedź"],
  ["iron", "Żelazo"],
  ["uranium", "Uran"],
  ["aa_defense", "OPL"],
  ["missile_1", "Rakiety I"],
  ["missile_2", "Rakiety II"],
  ["missile_3", "Rakiety III"],
  ["soldier_packs", "Pakiety żołnierzy"],
  ["tank_packs", "Pakiety czołgów"],
] as const;

function AdminPanel() {
  const { data: me } = useQuery(meQuery);
  const queryClient = useQueryClient();

  if (me && !me.isAdmin) {
    return (
      <AppShell me={me} title="Panel administratora">
        <Panel>
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
    <AppShell me={me ?? null} title="Panel administratora" subtitle="Korekty, gracze i cykl dobowy">
      <Tabs defaultValue="countries">
        <TabsList className="w-full overflow-x-auto">
          <TabsTrigger value="countries">Państwa</TabsTrigger>
          <TabsTrigger value="regions">Regiony</TabsTrigger>
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

function CountriesTab() {
  const { data: countries } = useQuery(countriesQuery);
  const queryClient = useQueryClient();
  const [id, setId] = useState<string | null>(null);
  const country = countries?.find((c) => c.country_id === id) ?? countries?.[0];
  const [patch, setPatch] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState("");
  const [newFlag, setNewFlag] = useState("");

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
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

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

  return (
    <div className="space-y-4">
      <Panel>
        <Label className="mb-2 block">Państwo</Label>
        <Select value={country?.country_id ?? ""} onValueChange={setId}>
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
        {country ? (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Nazwa</Label>
                <Input
                  defaultValue={country.name}
                  onChange={(e) => setPatch((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Flaga (emoji)</Label>
                <Input
                  defaultValue={country.flag}
                  onChange={(e) => setPatch((p) => ({ ...p, flag: e.target.value }))}
                />
              </div>
              {NUMERIC_FIELDS.map(([key, label]) => (
                <div key={key} className="space-y-1.5">
                  <Label>{label}</Label>
                  <Input
                    key={`${country.country_id}-${key}`}
                    type="number"
                    defaultValue={String(country[key as keyof typeof country] ?? 0)}
                    onChange={(e) => setPatch((p) => ({ ...p, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <Button
              className="mt-4"
              disabled={save.isPending || Object.keys(patch).length === 0}
              onClick={() => save.mutate()}
            >
              Zapisz korektę
            </Button>
          </>
        ) : null}
      </Panel>

      <Panel>
        <SectionTitle>Nowe państwo</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
          <Input placeholder="Nazwa" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Input placeholder="🏳️" value={newFlag} onChange={(e) => setNewFlag(e.target.value)} />
          <Button disabled={!newName || create.isPending} onClick={() => create.mutate()}>
            Utwórz
          </Button>
        </div>
      </Panel>
    </div>
  );
}

function RegionsTab() {
  const { data: countries } = useQuery(countriesQuery);
  const [id, setId] = useState<string | null>(null);
  const countryId = id ?? countries?.[0]?.country_id ?? null;
  const { data: regions } = useQuery(regionsQuery(countryId));
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

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
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Panel>
        <Label className="mb-2 block">Państwo</Label>
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
              <p className="text-muted-foreground text-xs">{r.slots.length}/9 slotów zajętych</p>
            </div>
            <Button
              size="sm"
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate(r.id)}
            >
              Usuń
            </Button>
          </div>
        ))}
      </Panel>
    </div>
  );
}

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
        <Panel key={u.id}>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{u.display_name ?? u.email}</p>
              <p className="text-muted-foreground truncate text-xs">{u.email}</p>
            </div>
            <span className="text-primary shrink-0 text-[11px] tracking-wide uppercase">
              {ROLE_LABELS[u.role ?? "PLAYER"]}
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-xs">Przypisane państwo</Label>
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
                <Label className="mb-1.5 block text-xs">Uprawnienia</Label>
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

function EconomyTab() {
  const { data: runs } = useQuery(economyRunsQuery);
  const queryClient = useQueryClient();

  const run = useMutation({
    mutationFn: () => rpc<{ ok: boolean; reason?: string }>("run_daily_economy", {}),
    onSuccess: (res) => {
      if (res?.ok) toast.success("Cykl dobowy rozliczony");
      else toast.info("Cykl na dzisiaj został już rozliczony");
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Panel>
        <p className="text-sm font-semibold">Cykl dobowy</p>
        <p className="text-muted-foreground mt-1 text-xs">
          Uruchamiany automatycznie o 20:00 (czas warszawski). Ręczne uruchomienie w tym samym dniu
          nie naliczy podwójnie.
        </p>
        <Button className="mt-3" disabled={run.isPending} onClick={() => run.mutate()}>
          {run.isPending ? "Liczę…" : "Uruchom cykl teraz"}
        </Button>
      </Panel>
      <Panel className="divide-border divide-y p-0">
        {((runs ?? []) as unknown as { id: string; run_date: string; ran_at: string; summary: Record<string, unknown> }[]).map(
          (r) => (
            <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 p-3">
              <div className="min-w-0">
                <p className="text-sm">Cykl {r.run_date}</p>
                <p className="text-muted-foreground text-xs">{dateTime(r.ran_at)}</p>
              </div>
              <p className="num text-primary shrink-0 text-sm">
                {krShort(String(r.summary?.["total_kr"] ?? 0))}
              </p>
            </div>
          ),
        )}
        {runs && runs.length === 0 ? (
          <p className="text-muted-foreground p-3 text-sm">Brak rozliczonych cykli.</p>
        ) : null}
      </Panel>
    </div>
  );
}

function HistoryTab() {
  const { data: tx } = useQuery(transactionsQuery(null, 50));
  const { data: actions } = useQuery(adminActionsQuery);

  return (
    <div className="space-y-4">
      <SectionTitle>Transakcje</SectionTitle>
      <Panel className="divide-border divide-y p-0">
        {((tx ?? []) as unknown as { id: string; label: string; amount_kr: string; created_at: string }[]).map(
          (t) => (
            <div key={t.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm">{t.label}</p>
                <p className="text-muted-foreground text-xs">{dateTime(t.created_at)}</p>
              </div>
              <p className="num shrink-0 text-sm">{kr(t.amount_kr)}</p>
            </div>
          ),
        )}
      </Panel>
      <SectionTitle>Akcje administracyjne</SectionTitle>
      <Panel className="divide-border divide-y p-0">
        {((actions ?? []) as unknown as { id: string; action: string; created_at: string; details: Record<string, unknown> }[]).map(
          (a) => (
            <div key={a.id} className="p-3">
              <p className="text-sm">{a.action}</p>
              <p className="text-muted-foreground text-xs">{dateTime(a.created_at)}</p>
              <p className="text-muted-foreground mt-1 truncate text-[11px]">
                {units(JSON.stringify(a.details).length)} znaków szczegółów
              </p>
            </div>
          ),
        )}
      </Panel>
    </div>
  );
}
