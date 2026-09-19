import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowRightLeft, Coins, Flame, Droplet, CircleDot, Magnet, Atom, Shield, Users, Truck, Rocket } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Panel, SectionTitle } from "@/components/stat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { countriesQuery, meQuery, rpc } from "@/lib/api";
import { fmtNum, units } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/transfer")({
  head: () => ({ meta: [{ title: "Transfery — COUNTRY RP" }] }),
  component: Transfers,
});

const resources = [
  ["balance","KR",Coins], ["coal","Węgiel",Flame], ["oil","Ropa",Droplet],
  ["copper","Miedź",CircleDot], ["iron","Żelazo",Magnet], ["uranium","Uran",Atom],
  ["aa_defense","OPL",Shield], ["soldier_packs","Żołnierze",Users],
  ["tank_packs","Czołgi",Truck], ["missile_1","Rakiety I",Rocket],
  ["missile_2","Rakiety II",Rocket], ["missile_3","Rakiety III",Rocket],
] as const;

function Transfers() {
  const { data: me } = useQuery(meQuery);
  const { data: countries } = useQuery(countriesQuery);
  const queryClient = useQueryClient();
  const [target, setTarget] = useState("");
  const [resource, setResource] = useState("balance");
  const [amount, setAmount] = useState("");

  const mine = countries?.find((c) => c.country_id === me?.countryId);
  const recipient = countries?.find((c) => c.country_id === target);
  const amountNumber = Math.max(0, Number(amount) || 0);
  const available = mine ? Number(mine[resource as keyof typeof mine] ?? 0) : 0;
  const remaining = Math.max(0, available - amountNumber);
  const canSend = !!mine && !!recipient && amountNumber > 0 && amountNumber <= available;

  const transfer = useMutation({
    mutationFn: () => rpc("transfer_resource", {
      p_from_country_id: mine!.country_id,
      p_to_country_id: recipient!.country_id,
      p_resource: resource,
      p_amount: amountNumber,
    }),
    onSuccess: () => {
      toast.success("Transfer wysłany");
      setAmount("");
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const Icon = useMemo(() => resources.find((x) => x[0] === resource)?.[2] ?? Coins, [resource]);

  return <AppShell me={me ?? null} title="Transfery" subtitle="Przekazuj zasoby innym państwom">
    <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
      <Panel className="hud-frame">
        <div className="mb-6 flex items-center gap-3"><div className="brand-mark"><ArrowRightLeft className="size-5"/></div><div><p className="font-display text-lg font-semibold">Nowy transfer</p><p className="text-sm text-muted-foreground">Operacja jest wykonywana atomowo przez backend.</p></div></div>
        <div className="space-y-5">
          <div><p className="label-hud mb-2">1. Wybierz państwo</p>
            <Select value={target} onValueChange={setTarget}><SelectTrigger><SelectValue placeholder="Wybierz odbiorcę"/></SelectTrigger><SelectContent>
              {(countries ?? []).filter((c) => c.country_id !== me?.countryId).map((c) => <SelectItem key={c.country_id} value={c.country_id}>{c.flag} {c.name}</SelectItem>)}
            </SelectContent></Select>
          </div>
          <div><p className="label-hud mb-2">2. Wybierz zasób</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {resources.map(([key,label,I]) => <button key={key} type="button" onClick={() => setResource(key)} className={`flex items-center gap-2 rounded-lg border p-3 text-left text-sm ${resource===key ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary/40 text-muted-foreground"}`}><I className="size-4"/>{label}</button>)}
            </div>
          </div>
          <div><p className="label-hud mb-2">3. Podaj ilość</p><Input className="num text-lg" inputMode="decimal" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0"/></div>
        </div>
      </Panel>

      <Panel className="h-fit">
        <SectionTitle>Podsumowanie</SectionTitle>
        <div className="rounded-xl border border-border bg-secondary/30 p-4">
          <div className="flex items-center gap-3"><Icon className="size-5 text-primary"/><div><p className="text-xs text-muted-foreground uppercase">Wysyłasz</p><p className="num text-xl font-semibold">{fmtNum(amountNumber)} {resources.find(x=>x[0]===resource)?.[1]}</p></div></div>
          <div className="my-5 border-l border-dashed border-primary/40 pl-4"><p className="text-xs text-muted-foreground uppercase">Do</p><p className="font-semibold">{recipient?.name ?? "Nie wybrano państwa"}</p></div>
          <div className="border-t border-border pt-4"><p className="text-xs text-muted-foreground uppercase">Pozostanie u nadawcy</p><p className={`num mt-1 text-xl font-semibold ${canSend ? "text-success" : "text-foreground"}`}>{fmtNum(remaining)}</p></div>
        </div>
        <Button className="mt-4 w-full" disabled={!canSend || transfer.isPending} onClick={() => transfer.mutate()}>{transfer.isPending ? "Wysyłam…" : "Wyślij transfer"}</Button>
        {mine ? <p className="mt-3 text-xs text-muted-foreground">Dostępne: <span className="num">{units(available)}</span></p> : null}
      </Panel>
    </div>
  </AppShell>;
}
