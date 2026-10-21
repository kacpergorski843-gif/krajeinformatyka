import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowRightLeft, Coins, Flame, Droplet, CircleDot, Magnet, Atom, Shield, Rocket, Users, Crosshair } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { CountryFlag } from "@/components/CountryFlag";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Panel, SectionTitle } from "@/components/stat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { countriesQuery, meQuery, rpc, transferRegionsQuery } from "@/lib/api";
import { fmtNum, units } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/transfer")({
  head: () => ({ meta: [{ title: "Transfery — COUNTRY RP" }] }),
  component: Transfers,
});

const resources = [
  ["balance","KR",Coins], ["coal","Węgiel",Flame], ["oil","Ropa",Droplet],
  ["copper","Miedź",CircleDot], ["iron","Żelazo",Magnet], ["uranium","Uran",Atom],
  ["soldier_packs","Żołnierze",Users], ["tank_packs","Czołgi",Crosshair],
  ["missile_1","Rakiety I",Rocket], ["missile_2","Rakiety II",Rocket], ["missile_3","Rakiety III",Rocket], ["aa_defense","OPL",Shield],
] as const;

function Transfers() {
  const { data: me } = useQuery(meQuery);
  const { data: countries, isPending, isError, error } = useQuery(countriesQuery);
  const queryClient = useQueryClient();
  const [target, setTarget] = useState("");
  const [resource, setResource] = useState("balance");
  const [amount, setAmount] = useState("");
  const [sourceRegion, setSourceRegion] = useState("");
  const [targetRegion, setTargetRegion] = useState("");

  const mine = countries?.find((c) => c.country_id === me?.countryId);
  const recipient = countries?.find((c) => c.country_id === target);
  const { data: sourceRegions } = useQuery(transferRegionsQuery(me?.countryId));
  const { data: targetRegions } = useQuery(transferRegionsQuery(target || null));
  const sourceRegionData = sourceRegions?.find((r) => r.id === sourceRegion);
  const targetRegionData = targetRegions?.find((r) => r.id === targetRegion);
  const amountNumber = Math.max(0, Number(amount) || 0);
  const isMoney = resource === "balance";
  const isAa = resource === "aa_defense";
  const isMilitary = ["soldier_packs","tank_packs","missile_1","missile_2","missile_3","aa_defense"].includes(resource);
  const validMilitaryAmount = !isMilitary || Number.isInteger(amountNumber);
  const validMoneyAmount = !isMoney || (amountNumber >= 1_000_000_000 && amountNumber % 1_000_000_000 === 0);
  const available = isAa ? Number(sourceRegionData?.aa_defense ?? 0) : mine ? Number(mine[resource as keyof typeof mine] ?? 0) : 0;
  const remaining = Math.max(0, available - amountNumber);
  const canSend = !!mine && !!recipient && amountNumber > 0 && amountNumber <= available && validMoneyAmount && validMilitaryAmount && (!isAa || (!!sourceRegionData && !!targetRegionData));

  const transfer = useMutation({
    mutationFn: () => isMilitary ? rpc("transfer_military", {
      p_from_country_id: mine!.country_id,
      p_to_country_id: recipient!.country_id,
      p_resource: resource,
      p_amount: amountNumber,
      p_from_region_id: isAa ? sourceRegionData!.id : null,
      p_to_region_id: isAa ? targetRegionData!.id : null,
    }) : rpc("transfer_resource", {
      p_from_country_id: mine!.country_id,
      p_to_country_id: recipient!.country_id,
      p_resource: resource,
      p_amount: amountNumber,
    }),
    onSuccess: () => {
      toast.success("Transfer zrealizowany", { description: `${fmtNum(amountNumber)} ${resources.find((x) => x[0] === resource)?.[1]} → ${recipient?.name}` });
      setAmount("");
      void queryClient.invalidateQueries({ queryKey: ["country_stats"] });
      void queryClient.invalidateQueries({ queryKey: ["regions"] });
      void queryClient.invalidateQueries({ queryKey: ["transfer_regions"] });
    },
    onError: (e: Error) => toast.error("Nie udało się wykonać transferu", { description: e.message }),
  });

  const Icon = useMemo(() => resources.find((x) => x[0] === resource)?.[2] ?? Coins, [resource]);

  return <AppShell me={me ?? null} title="Transfery" subtitle="Przekazuj pieniądze, surowce i jednostki wojskowe innym państwom">
    <div className="transfer-hero">
      <div>
        <p className="label-hud">LOGISTICS COMMAND</p>
        <h2 className="mt-1 text-xl font-semibold">Centrum transferów</h2>
        <p className="mt-1 text-sm text-muted-foreground">Przekazuj pieniądze i surowce między państwami. Każda operacja jest wykonywana atomowo.</p>
      </div>
    </div>

    {isPending ? <PageSkeleton rows={3} cards={2} /> : null}
    {isError ? (
      <Panel className="border-destructive/40 bg-destructive/5 p-5">
        <p className="font-semibold text-destructive">Nie udało się wczytać państw</p>
        <p className="mt-1 text-sm text-muted-foreground">{error instanceof Error ? error.message : "Spróbuj ponownie za chwilę."}</p>
      </Panel>
    ) : null}

    {!isPending && !isError ? <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
      <Panel className="hud-frame">
        <div className="mb-6 flex items-center gap-3"><div className="brand-mark"><ArrowRightLeft className="size-5"/></div><div><p className="font-display text-lg font-semibold">Nowy transfer</p><p className="text-sm text-muted-foreground">Wybierz odbiorcę, zasób i kwotę.</p></div></div>
        <div className="space-y-5">
          <div><p className="label-hud mb-2">1. Wybierz państwo</p>
            <Select value={target} onValueChange={setTarget}><SelectTrigger><SelectValue placeholder="Wybierz odbiorcę"/></SelectTrigger><SelectContent>
              {(countries ?? []).filter((c) => c.country_id !== me?.countryId).map((c) => (
                <SelectItem key={c.country_id} value={c.country_id}>
                  <span className="flex items-center gap-2"><CountryFlag flag={c.flag} alt="" className="size-6 shrink-0 rounded-sm text-lg" /><span>{c.name}</span></span>
                </SelectItem>
              ))}
            </SelectContent></Select>
          </div>
          <div><p className="label-hud mb-2">2. Wybierz zasób</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {resources.map(([key,label,I]) => <button key={key} type="button" onClick={() => setResource(key)} className={`flex min-h-12 items-center gap-2 rounded-lg border p-3 text-left text-sm transition-all ${resource===key ? "border-primary bg-primary/10 text-primary shadow-sm" : "border-border bg-secondary/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"}`} aria-pressed={resource === key}><I className="size-4"/>{label}</button>)}
            </div>
          </div>
          <div><p className="label-hud mb-2">3. Podaj ilość</p><Input className="num text-lg" inputMode="numeric" type="number" min={isMoney ? "1000000000" : "0"} step={isMoney ? "1000000000" : isMilitary ? "1" : "any"} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={isMoney ? "1 000 000 000" : "0"} aria-describedby="transfer-amount-help" /><p id="transfer-amount-help" className="mt-2 text-xs text-muted-foreground">Dostępne: <span className="num">{units(available)}</span>{isMoney ? " · przelewy KR muszą być wielokrotnością 1 mld" : isAa ? " · OPL jest przypisane do wybranego regionu" : isMilitary ? " · jednostki przesyłasz w całych pakietach" : ""}</p></div>
          {isAa ? <div className="grid gap-4 sm:grid-cols-2"><div><p className="label-hud mb-2">4. Region źródłowy</p><Select value={sourceRegion} onValueChange={setSourceRegion}><SelectTrigger><SelectValue placeholder="Wybierz region źródłowy"/></SelectTrigger><SelectContent>{(sourceRegions ?? []).map((r) => <SelectItem key={r.id} value={r.id}>{r.name} · OPL {units(r.aa_defense)}</SelectItem>)}</SelectContent></Select></div><div><p className="label-hud mb-2">5. Region docelowy</p><Select value={targetRegion} onValueChange={setTargetRegion}><SelectTrigger><SelectValue placeholder="Wybierz region docelowy"/></SelectTrigger><SelectContent>{(targetRegions ?? []).map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent></Select></div></div> : null}
        </div>
      </Panel>

      <Panel className="h-fit">
        <SectionTitle>Podsumowanie</SectionTitle>
        <div className="rounded-xl border border-border bg-secondary/30 p-4" aria-live="polite">
          <div className="flex items-center gap-3"><Icon className="size-5 text-primary"/><div><p className="text-xs text-muted-foreground uppercase">Wysyłasz</p><p className="num text-xl font-semibold">{fmtNum(amountNumber)} {resources.find(x=>x[0]===resource)?.[1]}</p></div></div>
          <div className="my-5 border-l border-dashed border-primary/40 pl-4"><p className="text-xs text-muted-foreground uppercase">Do</p><p className="font-semibold">{recipient?.name ?? "Nie wybrano państwa"}</p></div>
          <div className="border-t border-border pt-4"><p className="text-xs text-muted-foreground uppercase">Pozostanie u nadawcy</p><p className={`num mt-1 text-xl font-semibold ${canSend ? "text-success" : "text-foreground"}`}>{fmtNum(remaining)}</p></div>
        </div>
        <Button className="mt-4 min-h-12 w-full" disabled={!canSend || transfer.isPending} onClick={() => transfer.mutate()}>{transfer.isPending ? "Wysyłam transfer…" : "Wyślij transfer"}</Button>
        {!canSend && amountNumber > 0 && recipient && !transfer.isPending ? <p className="mt-3 text-center text-xs text-destructive">{amountNumber > available ? "Ilość przekracza dostępne zasoby." : !validMoneyAmount ? "Kwota KR musi być wielokrotnością 1 mld." : !validMilitaryAmount ? "Jednostki wojskowe muszą być przesyłane w całych pakietach." : isAa && (!sourceRegionData || !targetRegionData) ? "Wybierz region źródłowy i docelowy." : "Uzupełnij odbiorcę i popraw ilość."}</p> : null}
      </Panel>
    </div> : null}
  </AppShell>;
}
