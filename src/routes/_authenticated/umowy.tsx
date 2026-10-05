import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Handshake } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Panel, SectionTitle } from "@/components/stat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { agreementsQuery, countriesQuery, meQuery, rpc } from "@/lib/api";
import { fmtKR, fmtNum } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/umowy")({
  head: () => ({ meta: [{ title: "Umowy — COUNTRY RP" }] }),
  component: AgreementsPage,
});

const resources = [["balance", "KR"], ["coal", "Węgiel"], ["oil", "Ropa"], ["copper", "Miedź"], ["iron", "Żelazo"], ["uranium", "Uran"]] as const;
const nameOf = (key: string) => resources.find(([code]) => code === key)?.[1] ?? key;
const amountOf = (value: string, resource: string) => resource === "balance" ? fmtKR(value) : `${fmtNum(value)} ${nameOf(resource)}`;

function AgreementsPage() {
  const { data: me } = useQuery(meQuery);
  const agreements = useQuery(agreementsQuery);
  const countries = useQuery(countriesQuery);
  const queryClient = useQueryClient();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [aResource, setAResource] = useState("balance");
  const [bResource, setBResource] = useState("balance");
  const [aAmount, setAAmount] = useState("");
  const [bAmount, setBAmount] = useState("");
  const [days, setDays] = useState("1");
  const [end, setEnd] = useState("");
  const [cancelId, setCancelId] = useState<string | null>(null);
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ["bilateral_agreements"] }); void queryClient.invalidateQueries({ queryKey: ["admin_actions"] }); };
  const create = useMutation({
    mutationFn: () => rpc("admin_create_bilateral_agreement", { p_country_a_id: a, p_country_b_id: b, p_a_resource: aResource, p_a_amount: Number(aAmount), p_b_resource: bResource, p_b_amount: Number(bAmount), p_interval_days: Number(days), p_ends_at: end }),
    onSuccess: () => { toast.success("Umowa została utworzona"); setAAmount(""); setBAmount(""); refresh(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => rpc("admin_cancel_bilateral_agreement", { p_agreement_id: id }),
    onSuccess: () => { toast.success("Umowa anulowana"); setCancelId(null); refresh(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const names = new Map((countries.data ?? []).map((c) => [c.country_id, c.name]));
  const rows = (agreements.data ?? []).filter((row) => row.status === "ACTIVE" && (me?.isAdmin || row.country_a_id === me?.countryId || row.country_b_id === me?.countryId));
  const validAmount = (value: string, resource: string) => Number.isFinite(Number(value)) && Number(value) > 0 && (resource !== "balance" || (Number(value) >= 1_000_000_000 && Number(value) % 1_000_000_000 === 0));
  const canCreate = !!a && !!b && a !== b && validAmount(aAmount, aResource) && validAmount(bAmount, bResource) && Number.isInteger(Number(days)) && Number(days) >= 1 && Number(days) <= 365 && !!end && end >= today;

  return <AppShell me={me ?? null} title="Umowy" subtitle="Cykliczna wymiana zasobów między państwami">
    <div className="space-y-6">
      {me?.isAdmin ? <Panel className="space-y-5">
        <div><p className="label-hud">ADMINISTRACJA</p><h2 className="mt-1 font-display text-lg font-semibold">Nowa umowa</h2><p className="text-sm text-muted-foreground">Obie strony wymieniają zasoby jednocześnie o 20:00. Gdy jednej zabraknie środków, wymiana tego dnia jest pomijana.</p></div>
        <div className="grid gap-4 lg:grid-cols-2">
          {([{"id":"a",country:a,setCountry:setA,resource:aResource,setResource:setAResource,amount:aAmount,setAmount:setAAmount,other:b},{"id":"b",country:b,setCountry:setB,resource:bResource,setResource:setBResource,amount:bAmount,setAmount:setBAmount,other:a}] as const).map((side) => <fieldset key={side.id} className="min-w-0 space-y-3 rounded-md border border-border p-4">
            <legend className="px-2 font-semibold">Państwo {side.id.toUpperCase()} wysyła</legend>
            <div className="space-y-1"><Label htmlFor={`country-${side.id}`}>Państwo</Label><Select value={side.country} onValueChange={side.setCountry}><SelectTrigger id={`country-${side.id}`} className="w-full"><SelectValue placeholder="Wybierz państwo" /></SelectTrigger><SelectContent>{(countries.data ?? []).filter((c) => c.country_id !== side.other).map((c) => <SelectItem key={c.country_id} value={c.country_id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label htmlFor={`resource-${side.id}`}>Zasób</Label><Select value={side.resource} onValueChange={side.setResource}><SelectTrigger id={`resource-${side.id}`}><SelectValue /></SelectTrigger><SelectContent>{resources.map(([code,label]) => <SelectItem key={code} value={code}>{label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label htmlFor={`amount-${side.id}`}>Ilość {side.resource === "balance" ? "(KR, wielokrotność 1 mld)" : ""}</Label><Input id={`amount-${side.id}`} type="number" min={side.resource === "balance" ? "1000000000" : "0.01"} step={side.resource === "balance" ? "1000000000" : "any"} inputMode="decimal" value={side.amount} onChange={(e) => side.setAmount(e.target.value)} placeholder={side.resource === "balance" ? "1000000000" : "1000"} /></div>
          </fieldset>)}
        </div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1"><Label htmlFor="interval-days">Co ile dni</Label><Input id="interval-days" type="number" min="1" max="365" step="1" value={days} onChange={(e) => setDays(e.target.value)} /></div><div className="space-y-1"><Label htmlFor="end-date">Do kiedy (włącznie)</Label><Input id="end-date" type="date" min={today} value={end} onChange={(e) => setEnd(e.target.value)} /></div></div>
        <Button className="w-full sm:w-auto" disabled={!canCreate || create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Tworzenie…" : "Utwórz umowę"}</Button>
      </Panel> : null}
      <section className="space-y-3"><SectionTitle>Aktywne umowy</SectionTitle>
        {agreements.isPending || countries.isPending ? <PageSkeleton cards={2} /> : agreements.isError || countries.isError ? <Panel className="border-destructive/50 text-destructive">Nie udało się wczytać umów. <Button variant="outline" onClick={() => { void agreements.refetch(); void countries.refetch(); }}>Spróbuj ponownie</Button></Panel> : rows.length === 0 ? <Panel className="text-sm text-muted-foreground">Brak aktywnych umów.</Panel> : <div className="grid gap-3">{rows.map((row) => <Panel key={row.id} className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-display font-semibold">{names.get(row.country_a_id) ?? "Państwo A"} ↔ {names.get(row.country_b_id) ?? "Państwo B"}</h3><p className="mt-1 text-xs text-muted-foreground">Co {row.interval_days} {row.interval_days === 1 ? "dzień" : "dni"} · następna wymiana: {row.next_run_date} · do {row.ends_at}</p></div>{me?.isAdmin ? <Button variant="outline" size="sm" onClick={() => setCancelId(row.id)}>Anuluj umowę</Button> : null}</div>
          <div className="grid gap-2 text-sm sm:grid-cols-2"><div className="rounded border border-border bg-secondary/30 p-3">{names.get(row.country_a_id)} wysyła <strong className="block text-primary">{amountOf(row.a_amount, row.a_resource)}</strong></div><div className="rounded border border-border bg-secondary/30 p-3">{names.get(row.country_b_id)} wysyła <strong className="block text-primary">{amountOf(row.b_amount, row.b_resource)}</strong></div></div>
        </Panel>)}</div>}
      </section>
    </div>
    <Dialog open={!!cancelId} onOpenChange={(open) => !open && setCancelId(null)}><DialogContent><DialogHeader><DialogTitle>Anulować umowę?</DialogTitle><DialogDescription>Przyszłe wymiany zostaną zatrzymane. Dotychczasowe transfery pozostaną bez zmian.</DialogDescription></DialogHeader><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setCancelId(null)}>Wróć</Button><Button variant="destructive" disabled={cancel.isPending} onClick={() => cancelId && cancel.mutate(cancelId)}>{cancel.isPending ? "Anulowanie…" : "Anuluj umowę"}</Button></div></DialogContent></Dialog>
  </AppShell>;
}