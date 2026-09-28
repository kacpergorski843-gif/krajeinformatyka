import { useMemo, useState } from "react";
import { History } from "lucide-react";
import { Panel, SectionTitle } from "@/components/stat";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { dateTime, fmtKR, units, RESOURCE_LABELS } from "@/lib/format";

export type TxRow = {
  id: string;
  kind: string;
  label: string;
  amount_kr: string;
  created_at: string;
  details?: Record<string, unknown> | null;
};

const FILTERS = [
  "Wszystkie",
  "Ekonomia",
  "Budynki",
  "Wojsko",
  "Rakiety",
  "OPL",
  "Surowce",
  "Administracja",
] as const;
type Filter = (typeof FILTERS)[number];

const KIND_LABELS: Record<string, string> = {
  ECONOMY: "Ekonomia",
  TRANSFER: "Transfer",
  PURCHASE: "Zakup",
  BUILD: "Budowa",
  DEMOLISH: "Rozbiórka",
  STRIKE: "Atak rakietowy",
  DEFENSE: "Obrona",
  ADMIN: "Administracja",
};

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

function categoryOf(t: TxRow): Exclude<Filter, "Wszystkie"> {
  const item = String((t.details as Record<string, unknown> | null)?.["item"] ?? "");
  if (t.kind === "ADMIN") return "Administracja";
  if (t.kind === "ECONOMY") return "Ekonomia";
  if (t.kind === "STRIKE" || t.kind === "DEFENSE") return "Rakiety";
  if (item === "aa") return "OPL";
  if (t.kind === "TRANSFER") return "Surowce";
  if (t.kind === "BUILD" || t.kind === "DEMOLISH") {
    return /wytwórni|wytwornia|Wytwórnia/i.test(t.label) ? "Surowce" : "Budynki";
  }
  return "Wojsko";
}

function weekStart(iso: string): Date {
  const d = new Date(iso);
  const day = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
}

const shortDate = (d: Date) => d.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit" });

type ResourceDelta = { key: string; label: string; amount: number };

type Merged = {
  key: string;
  label: string;
  count: number;
  amount: number;
  created_at: string;
  category: string;
  resources: ResourceDelta[];
  transactions: TxRow[];
};

function resourceDeltas(details: Record<string, unknown> | null | undefined): ResourceDelta[] {
  if (!details) return [];
  const source =
    (details.resources as Record<string, unknown> | undefined) ??
    (details.resource_amounts as Record<string, unknown> | undefined) ??
    details;
  return Object.entries(source)
    .filter(([key, value]) =>
      ["coal", "oil", "copper", "iron", "uranium"].includes(key) && Number.isFinite(Number(value)),
    )
    .map(([key, value]) => ({ key, label: RESOURCE_LABELS[key] ?? key, amount: Number(value) }))
    .filter((item) => item.amount !== 0);
}

function transferInfo(t: TxRow) {
  if (t.kind !== "TRANSFER") return null;
  const details = t.details ?? {};
  const resource = String(details.resource ?? "");
  const amount = Number(details.amount ?? 0);
  const direction = details.direction === "in" ? "in" : "out";
  const targetName = t.label.includes("→") ? t.label.split("→")[1]?.trim() : t.label.includes("←") ? t.label.split("←")[1]?.trim() : "";
  const otherName = targetName || "drugie państwo";
  return { resource, amount, direction, otherName };
}

function readableLabel(t: TxRow): string {
  const transfer = transferInfo(t);
  if (transfer) {
    const resource = RESOURCE_NAMES[transfer.resource] ?? transfer.resource;
    return transfer.direction === "out"
      ? `Wysłano ${resource} do ${transfer.otherName}`
      : `Otrzymano ${resource} od ${transfer.otherName}`;
  }
  if (t.kind === "ECONOMY") return "Wypłata dzienna";
  return t.label.replace(/^Transfer:\s*/i, "Transfer: ");
}

function displayAmount(t: TxRow) {
  const transfer = transferInfo(t);
  if (transfer && transfer.resource !== "balance") {
    const sign = transfer.direction === "in" ? "+" : "−";
    return `${sign}${units(transfer.amount)} ${RESOURCE_NAMES[transfer.resource] ?? transfer.resource}`;
  }
  const amount = Number(t.amount_kr);
  return `${amount > 0 ? "+" : ""}${fmtKR(amount)}`;
}

function DetailValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") return <span>—</span>;
  if (typeof value === "boolean") return <span>{value ? "Tak" : "Nie"}</span>;
  if (typeof value === "number") return <span>{units(value)}</span>;
  if (typeof value === "object") return <span>{JSON.stringify(value)}</span>;
  return <span>{String(value)}</span>;
}

export function OperationsHistory({ rows, title = "Historia operacji" }: { rows: TxRow[] | undefined; title?: string }) {
  const [filter, setFilter] = useState<Filter>("Wszystkie");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [full, setFull] = useState(false);
  const [selected, setSelected] = useState<Merged | null>(null);

  const filtered = useMemo(() => {
    return (rows ?? []).filter((t) => {
      if (filter !== "Wszystkie" && categoryOf(t) !== filter) return false;
      const day = t.created_at.slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });
  }, [rows, filter, from, to]);

  const groups = useMemo(() => {
    const out: { week: string; items: Merged[] }[] = [];
    for (const t of filtered) {
      const ws = weekStart(t.created_at);
      const we = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + 6);
      const week = `Tydzień ${shortDate(ws)} – ${shortDate(we)}`;
      let group = out.find((g) => g.week === week);
      if (!group) {
        group = { week, items: [] };
        out.push(group);
      }
      const deltas = resourceDeltas(t.details);
      const last = group.items[group.items.length - 1];
      if (last && last.label === readableLabel(t) && last.category === categoryOf(t)) {
        last.count += 1;
        last.amount += Number(t.amount_kr);
        last.transactions.push(t);
        for (const delta of deltas) {
          const existing = last.resources.find((resource) => resource.key === delta.key);
          if (existing) existing.amount += delta.amount;
          else last.resources.push({ ...delta });
        }
        last.resources = last.resources.filter((resource) => resource.amount !== 0);
      } else {
        group.items.push({
          key: t.id,
          label: readableLabel(t),
          count: 1,
          amount: Number(t.amount_kr),
          created_at: t.created_at,
          category: categoryOf(t),
          resources: deltas,
          transactions: [t],
        });
      }
    }
    return out;
  }, [filtered]);

  const visible = useMemo(() => {
    if (full) return groups;
    let left = 10;
    const out: { week: string; items: Merged[] }[] = [];
    for (const g of groups) {
      if (left <= 0) break;
      const items = g.items.slice(0, left);
      left -= items.length;
      out.push({ week: g.week, items });
    }
    return out;
  }, [groups, full]);

  const totalItems = groups.reduce((n, g) => n + g.items.length, 0);
  const detailRows = selected?.transactions ?? [];

  return (
    <>
      <SectionTitle>{title}</SectionTitle>
      <div className="admin-scrollbar -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {FILTERS.map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={`shrink-0 rounded-sm border px-2.5 py-1.5 text-[11px] tracking-[0.1em] uppercase ${filter === f ? "border-primary/70 text-primary bg-secondary" : "border-border text-muted-foreground"}`}>
            {f}
          </button>
        ))}
      </div>
      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <label className="label-hud flex min-w-0 items-center gap-2">Od<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border-border bg-background text-foreground min-w-0 flex-1 rounded-sm border px-2 py-1.5 text-xs" /></label>
        <label className="label-hud flex min-w-0 items-center gap-2">Do<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border-border bg-background text-foreground min-w-0 flex-1 rounded-sm border px-2 py-1.5 text-xs" /></label>
      </div>

      <Panel className="p-0">
        {visible.map((g) => (
          <div key={g.week}>
            <p className="border-border/70 bg-secondary/40 label-hud border-y px-3 py-1.5">{g.week}</p>
            <div className="divide-border/70 divide-y">
              {g.items.map((m) => (
                <button key={m.key} type="button" onClick={() => setSelected(m)} className="hover:bg-secondary/30 focus-visible:ring-primary grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2.5 text-left outline-none focus-visible:ring-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{m.label}{m.count > 1 ? <span className="text-primary"> ×{m.count}</span> : null}</p>
                    <p className="text-inactive text-[11px]">{m.category} · {dateTime(m.created_at)}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">Kliknij, aby zobaczyć szczegóły</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {m.resources.length ? <div className="flex flex-wrap justify-end gap-x-2 gap-y-0.5 text-[11px]">{m.resources.map((resource) => <span key={resource.key} className={resource.amount > 0 ? "text-success" : "text-destructive"}>{resource.amount > 0 ? "+" : ""}{units(resource.amount)} {resource.label}</span>)}</div> : null}
                    <p className={`num text-sm ${m.amount > 0 ? "text-success" : m.amount < 0 ? "text-destructive" : "text-inactive"}`}>{m.transactions.length > 1 && m.transactions.every((t) => Number(t.amount_kr) === 0) ? "Surowce" : `${m.amount > 0 ? "+" : ""}${fmtKR(m.amount)}`}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
        {totalItems === 0 ? <p className="text-muted-foreground flex items-center gap-2 p-3 text-sm"><History className="size-4" strokeWidth={1.5} /> Brak operacji dla wybranych filtrów.</p> : null}
      </Panel>

      {totalItems > 10 ? <Button variant="outline" className="mt-3 w-full" onClick={() => setFull((v) => !v)}>{full ? "Pokaż tylko ostatnie 10" : "Pokaż pełną historię"}</Button> : null}

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected?.label ?? "Szczegóły operacji"}</DialogTitle>
            <DialogDescription>
              {selected ? `${selected.category} · ${dateTime(selected.created_at)}` : ""}
            </DialogDescription>
          </DialogHeader>
          {selected ? (
            <div className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border p-3"><p className="label-hud">ŁĄCZNIE KR</p><p className="num mt-1 text-lg font-semibold">{selected.amount > 0 ? "+" : ""}{fmtKR(selected.amount)}</p></div>
                <div className="rounded-lg border p-3"><p className="label-hud">OPERACJI</p><p className="num mt-1 text-lg font-semibold">{selected.transactions.length}</p></div>
              </div>

              {selected.resources.length ? (
                <div className="rounded-lg border p-3">
                  <p className="label-hud mb-2">SUROWCE</p>
                  <div className="space-y-1.5 text-sm">
                    {selected.resources.map((resource) => <div key={resource.key} className="flex justify-between gap-3"><span>{resource.label}</span><span className={resource.amount >= 0 ? "text-success font-semibold" : "text-destructive font-semibold"}>{resource.amount > 0 ? "+" : ""}{units(resource.amount)}</span></div>)}
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <p className="label-hud">SZCZEGÓŁY</p>
                {detailRows.map((tx) => {
                  const transfer = transferInfo(tx);
                  const details = tx.details ?? {};
                  return (
                    <div key={tx.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{readableLabel(tx)}</p>
                          <p className="text-xs text-muted-foreground">{dateTime(tx.created_at)}</p>
                        </div>
                        <p className={`num shrink-0 text-sm ${Number(tx.amount_kr) > 0 ? "text-success" : Number(tx.amount_kr) < 0 ? "text-destructive" : "text-muted-foreground"}`}>{displayAmount(tx)}</p>
                      </div>
                      {transfer ? (
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded border bg-secondary/20 p-2"><p className="label-hud">KIERUNEK</p><p className="mt-1 font-medium">{transfer.direction === "out" ? "Od Ciebie" : "Do Ciebie"}</p></div>
                          <div className="rounded border bg-secondary/20 p-2"><p className="label-hud">PAŃSTWO</p><p className="mt-1 font-medium">{transfer.otherName}</p></div>
                        </div>
                      ) : null}
                      {tx.kind === "ECONOMY" ? (
                        <div className="mt-3 rounded border bg-secondary/20 p-2 text-xs">
                          <p className="label-hud mb-2">ROZLICZENIE WYPŁATY</p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                            {Object.entries(details).map(([key, value]) => <div key={key} className="contents"><span className="text-muted-foreground">{key.replaceAll("_", " ")}</span><span className="text-right font-medium"><DetailValue value={value} /></span></div>)}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
