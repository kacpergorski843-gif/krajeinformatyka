import { useMemo, useState } from "react";
import { ChevronRight, History, ReceiptText, WalletCards } from "lucide-react";
import { Panel, SectionTitle } from "@/components/stat";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { dateTime, fmtKR, units, RESOURCE_LABELS } from "@/lib/format";

export type TxRow = {
  id: string;
  kind: string;
  label: string;
  amount_kr: string;
  created_at: string;
  details?: Record<string, unknown> | null;
};

type View = "all" | "payouts" | "purchases" | "transfers";
type ResourceDelta = { key: string; label: string; amount: number };

const RESOURCE_NAMES: Record<string, string> = {
  ...RESOURCE_LABELS,
  balance: "KR",
  aa_defense: "OPL",
  soldier_packs: "Pakiety żołnierzy",
  tank_packs: "Pakiety czołgów",
  missile_1: "Rakiety I",
  missile_2: "Rakiety II",
  missile_3: "Rakiety III",
};

const kindName: Record<string, string> = {
  ECONOMY: "Wypłata dzienna",
  PURCHASE: "Zakup",
  TRANSFER: "Transfer",
  BUILD: "Budowa",
  DEMOLISH: "Rozbiórka",
  STRIKE: "Atak rakietowy",
  DEFENSE: "Obrona",
  ADMIN: "Administracja",
};

function details(t: TxRow) {
  return t.details ?? {};
}

function isPayout(t: TxRow) {
  return t.kind === "ECONOMY";
}

function isPurchase(t: TxRow) {
  return t.kind === "PURCHASE";
}

function isTransfer(t: TxRow) {
  return t.kind === "TRANSFER";
}

function transferInfo(t: TxRow) {
  if (!isTransfer(t)) return null;
  const d = details(t);
  const resource = String(d.resource ?? "");
  const amount = Number(d.amount ?? 0);
  const direction = d.direction === "in" ? "in" : "out";
  const arrow = t.label.includes("→") ? "→" : t.label.includes("←") ? "←" : null;
  const otherName = arrow ? t.label.split(arrow)[1]?.trim() : "drugie państwo";
  return { resource, amount, direction, otherName: otherName || "drugie państwo" };
}

function readableLabel(t: TxRow) {
  const transfer = transferInfo(t);
  if (transfer) {
    const resource = RESOURCE_NAMES[transfer.resource] ?? transfer.resource;
    return transfer.direction === "out"
      ? `Wysłano ${resource} do ${transfer.otherName}`
      : `Otrzymano ${resource} od ${transfer.otherName}`;
  }
  if (isPayout(t)) return "Wypłata dzienna";
  if (isPurchase(t)) return t.label.replace(/^Zakup:\s*/i, "");
  return t.label;
}

function displayAmount(t: TxRow) {
  const transfer = transferInfo(t);
  if (transfer && transfer.resource !== "balance") {
    return `${transfer.direction === "in" ? "+" : "−"}${units(transfer.amount)} ${RESOURCE_NAMES[transfer.resource] ?? transfer.resource}`;
  }
  const amount = Number(t.amount_kr);
  return `${amount > 0 ? "+" : ""}${fmtKR(amount)}`;
}

function resourceDeltas(d: Record<string, unknown>): ResourceDelta[] {
  const source = (d.resources as Record<string, unknown> | undefined) ?? (d.resource_amounts as Record<string, unknown> | undefined) ?? d;
  return Object.entries(source)
    .filter(([key, value]) => ["coal", "oil", "copper", "iron", "uranium"].includes(key) && Number.isFinite(Number(value)))
    .map(([key, value]) => ({ key, label: RESOURCE_NAMES[key] ?? key, amount: Number(value) }))
    .filter((x) => x.amount !== 0);
}

function payoutResources(t: TxRow) {
  const d = details(t);
  const production: Array<[string, string]> = [
    ["coal", "coal_prod"],
    ["oil", "oil_prod"],
    ["copper", "copper_prod"],
    ["iron", "iron_prod"],
    ["uranium", "uranium_prod"],
  ];
  return production
    .map(([key, productionKey]) => {
      const produced = Number(d[productionKey] ?? 0);
      const consumed = key === "coal" ? Number(d.coal_upkeep ?? 0) : 0;
      const net = produced - consumed;
      return { key, label: RESOURCE_NAMES[key] ?? key, produced, consumed, net };
    })
    .filter((x) => x.produced !== 0 || x.consumed !== 0);
}

function payoutBreakdown(t: TxRow) {
  const d = details(t);
  const fields: Array<[string, string]> = [
    ["Dochód brutto", "gross_income"],
    ["Utrzymanie węgla", "coal_upkeep"],
    ["Bonus", "bonus"],
  ];
  return fields
    .map(([label, key]) => ({ label, key, value: Number(d[key] ?? 0) }))
    .filter((x) => x.value !== 0);
}

function purchaseInfo(t: TxRow) {
  const d = details(t);
  const qty = Math.max(1, Number(d.qty ?? 1));
  const total = Math.abs(Number(t.amount_kr));
  return { qty, total, unit: total / qty, item: String(d.item ?? "") };
}

export function OperationsHistory({ rows, title = "Historia operacji" }: { rows: TxRow[] | undefined; title?: string }) {
  const [view, setView] = useState<View>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [full, setFull] = useState(false);
  const [selected, setSelected] = useState<TxRow | null>(null);

  const filtered = useMemo(() => (rows ?? []).filter((t) => {
    if (view === "payouts" && !isPayout(t)) return false;
    if (view === "purchases" && !isPurchase(t)) return false;
    if (view === "transfers" && !isTransfer(t)) return false;
    const day = t.created_at.slice(0, 10);
    return (!from || day >= from) && (!to || day <= to);
  }), [rows, view, from, to]);

  const ordered = useMemo(() => [...filtered].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)), [filtered]);
  const visible = full ? ordered : ordered.slice(0, 10);
  const payouts = ordered.filter(isPayout);
  const purchases = ordered.filter(isPurchase);

  return (
    <>
      <SectionTitle>{title}</SectionTitle>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([
          ["all", "Wszystko"],
          ["payouts", "Wypłaty"],
          ["purchases", "Zakupy"],
          ["transfers", "Transfery"],
        ] as const).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setView(key)} className={`min-h-10 rounded-lg border px-3 py-2 text-xs font-medium transition ${view === key ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:bg-secondary/40"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">Od<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" /></label>
        <label className="text-xs text-muted-foreground">Do<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" /></label>
      </div>

      {view === "all" && (
        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={() => setView("payouts")} className="rounded-xl border border-border bg-secondary/20 p-3 text-left hover:bg-secondary/40">
            <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-medium"><WalletCards className="size-4" /> Wypłaty</span><ChevronRight className="size-4 text-muted-foreground" /></div>
            <p className="mt-1 text-xs text-muted-foreground">{payouts.length} wypłat · kliknij, aby sprawdzić rozliczenie</p>
          </button>
          <button type="button" onClick={() => setView("purchases")} className="rounded-xl border border-border bg-secondary/20 p-3 text-left hover:bg-secondary/40">
            <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-medium"><ReceiptText className="size-4" /> Zakupy</span><ChevronRight className="size-4 text-muted-foreground" /></div>
            <p className="mt-1 text-xs text-muted-foreground">{purchases.length} zakupów · ilość, cena i suma</p>
          </button>
        </div>
      )}

      <Panel className="overflow-hidden p-0">
        {visible.map((t) => {
          const transfer = transferInfo(t);
          const purchase = isPurchase(t) ? purchaseInfo(t) : null;
          const payout = isPayout(t);
          const amount = Number(t.amount_kr);
          return (
            <button key={t.id} type="button" onClick={() => setSelected(t)} className="flex min-h-[72px] w-full items-center gap-3 border-b border-border/70 px-3 py-3 text-left transition last:border-0 hover:bg-secondary/30">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{readableLabel(t)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{kindName[t.kind] ?? "Operacja"} · {dateTime(t.created_at)}</p>
                {purchase ? <p className="mt-1 text-xs text-muted-foreground">Ilość: {units(purchase.qty)} · cena szt.: {fmtKR(purchase.unit)}</p> : null}
                {transfer ? <p className="mt-1 text-xs text-muted-foreground">{transfer.direction === "out" ? "Do" : "Od"}: {transfer.otherName}</p> : null}
                {payout ? <p className="mt-1 text-xs text-muted-foreground">Kliknij, aby zobaczyć pełne rozliczenie</p> : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`text-sm font-semibold ${amount > 0 ? "text-success" : amount < 0 ? "text-destructive" : "text-muted-foreground"}`}>{displayAmount(t)}</span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </div>
            </button>
          );
        })}
        {!visible.length ? <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><History className="size-4" /> Brak operacji dla wybranych filtrów.</div> : null}
      </Panel>

      {ordered.length > 10 ? <Button variant="outline" className="mt-3 w-full min-h-10" onClick={() => setFull((v) => !v)}>{full ? "Pokaż ostatnie 10" : `Pokaż pełną historię (${ordered.length})`}</Button> : null}

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle>{readableLabel(selected)}</DialogTitle>
                <DialogDescription>{dateTime(selected.created_at)} · {kindName[selected.kind] ?? "Operacja"}</DialogDescription>
              </DialogHeader>

              {isPurchase(selected) ? (() => {
                const p = purchaseInfo(selected);
                return (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-border bg-secondary/20 p-4">
                      <p className="text-xs text-muted-foreground">CO KUPIONO</p>
                      <p className="mt-1 text-base font-semibold">{selected.label.replace(/^Zakup:\s*/i, "")}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">ILOŚĆ</p><p className="mt-1 text-lg font-semibold">{units(p.qty)}</p></div>
                      <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">CENA / SZT.</p><p className="mt-1 text-lg font-semibold">{fmtKR(p.unit)}</p></div>
                    </div>
                    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4"><div className="flex justify-between gap-3"><span className="text-sm font-medium">Łącznie zapłacono</span><span className="font-semibold text-destructive">−{fmtKR(p.total)}</span></div></div>
                    <div className="rounded-xl border p-4 text-sm"><div className="flex justify-between"><span>Data zakupu</span><span className="font-medium">{dateTime(selected.created_at)}</span></div><div className="mt-2 flex justify-between"><span>Status</span><span className="font-medium text-success">Zapisano w historii</span></div></div>
                  </div>
                );
              })() : isPayout(selected) ? (
                (() => {
                  const resources = payoutResources(selected);
                  const money = payoutBreakdown(selected);
                  const netCoal = resources.find((r) => r.key === "coal")?.net ?? 0;
                  return (
                    <div className="space-y-3 pb-1">
                      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
                        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">WYPŁATA DZIENNA</p>
                        <div className="mt-1 flex items-end justify-between gap-3">
                          <p className="text-2xl font-semibold tracking-tight text-success">+{fmtKR(Number(selected.amount_kr))}</p>
                          <span className="pb-1 text-xs text-muted-foreground">{dateTime(selected.created_at)}</span>
                        </div>
                      </div>

                      <div className="rounded-2xl border p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div><p className="text-sm font-semibold">Surowce z wypłaty</p><p className="mt-0.5 text-xs text-muted-foreground">Produkcja, zużycie i wynik netto</p></div>
                          <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium">{resources.length} zas.</span>
                        </div>
                        <div className="mt-3 space-y-2">
                          {resources.map((r) => (
                            <div key={r.key} className="rounded-xl bg-secondary/35 p-3">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-sm font-medium">{r.label}</span>
                                <span className={`text-sm font-semibold ${r.net >= 0 ? "text-success" : "text-destructive"}`}>{r.net >= 0 ? "+" : "−"}{units(Math.abs(r.net))}</span>
                              </div>
                              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                                <div><span className="text-muted-foreground">Otrzymano</span><p className="mt-0.5 font-medium">+{units(r.produced)}</p></div>
                                {r.consumed > 0 ? <div><span className="text-muted-foreground">Zużyto</span><p className="mt-0.5 font-medium text-destructive">−{units(r.consumed)}</p></div> : <div><span className="text-muted-foreground">Zużycie</span><p className="mt-0.5 font-medium">0</p></div>}
                              </div>
                            </div>
                          ))}
                          {!resources.length ? <div className="rounded-xl bg-secondary/35 p-3 text-sm text-muted-foreground">W tym cyklu nie zaksięgowano produkcji surowców.</div> : null}
                        </div>
                      </div>

                      <div className="rounded-2xl border p-4">
                        <p className="text-sm font-semibold">Rozliczenie KR</p>
                        <div className="mt-3 space-y-2 text-sm">
                          {money.map((x) => <div key={x.key} className="flex justify-between gap-3"><span className="text-muted-foreground">{x.label}</span><span className="font-medium">{fmtKR(x.value)}</span></div>)}
                          <div className="mt-3 flex justify-between border-t pt-3 font-semibold"><span>Wypłacono</span><span className="text-success">+{fmtKR(Number(selected.amount_kr))}</span></div>
                        </div>
                      </div>

                      {resources.some((r) => r.consumed > 0) ? (
                        <div className="rounded-xl border border-border bg-secondary/20 p-3 text-xs text-muted-foreground">
                          Węgiel zużyty na utrzymanie został odjęty od produkcji w tym cyklu. Wynik pokazuje faktyczny bilans surowca po rozliczeniu.
                        </div>
                      ) : null}
                    </div>
                  );
                })()
              ) : isTransfer(selected) ? (() => {
                const transfer = transferInfo(selected)!;
                return <div className="space-y-3"><div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">TRANSFER</p><p className="mt-1 text-base font-semibold">{readableLabel(selected)}</p><p className="mt-1 text-xs text-muted-foreground">{dateTime(selected.created_at)}</p></div><div className="grid grid-cols-2 gap-2"><div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">ZASÓB</p><p className="mt-1 font-medium">{RESOURCE_NAMES[transfer.resource] ?? transfer.resource}</p></div><div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">ILOŚĆ</p><p className="mt-1 font-medium">{units(transfer.amount)}</p></div></div><div className="rounded-xl border p-4 text-sm"><div className="flex justify-between"><span>{transfer.direction === "out" ? "Odbiorca" : "Nadawca"}</span><span className="font-medium">{transfer.otherName}</span></div><div className="mt-2 flex justify-between"><span>Kierunek</span><span className="font-medium">{transfer.direction === "out" ? "Wysłano" : "Otrzymano"}</span></div></div></div>;
              })() : (
                <div className="space-y-3"><div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">OPERACJA</p><p className="mt-1 font-semibold">{readableLabel(selected)}</p><p className="mt-1 text-xs text-muted-foreground">{dateTime(selected.created_at)}</p></div><div className="rounded-xl border p-4"><div className="flex justify-between"><span>Wartość</span><span className="font-semibold">{displayAmount(selected)}</span></div></div></div>
              )}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
