import { useMemo, useState } from "react";
import { History } from "lucide-react";
import { Panel, SectionTitle } from "@/components/stat";
import { Button } from "@/components/ui/button";
import { dateTime, fmtKR } from "@/lib/format";

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

function categoryOf(t: TxRow): Exclude<Filter, "Wszystkie"> {
  const item = String((t.details as Record<string, unknown> | null)?.["item"] ?? "");
  if (t.kind === "ADMIN") return "Administracja";
  if (t.kind === "ECONOMY") return "Ekonomia";
  if (t.kind === "STRIKE" || t.kind === "DEFENSE") return "Rakiety";
  if (item === "aa") return "OPL";
  if (t.kind === "BUILD" || t.kind === "DEMOLISH") {
    return /wytwórni|wytwornia|Wytwórnia/i.test(t.label) ? "Surowce" : "Budynki";
  }
  return "Wojsko";
}

function weekStart(iso: string): Date {
  const d = new Date(iso);
  const day = (d.getDay() + 6) % 7;
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  return s;
}

const shortDate = (d: Date) =>
  d.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit" });

type Merged = {
  key: string;
  label: string;
  count: number;
  amount: number;
  created_at: string;
  category: string;
};

export function OperationsHistory({
  rows,
  title = "Historia operacji",
}: {
  rows: TxRow[] | undefined;
  title?: string;
}) {
  const [filter, setFilter] = useState<Filter>("Wszystkie");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [full, setFull] = useState(false);

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
      const last = group.items[group.items.length - 1];
      if (last && last.label === t.label) {
        last.count += 1;
        last.amount += Number(t.amount_kr);
      } else {
        group.items.push({
          key: t.id,
          label: t.label,
          count: 1,
          amount: Number(t.amount_kr),
          created_at: t.created_at,
          category: categoryOf(t),
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

  return (
    <>
      <SectionTitle>{title}</SectionTitle>
      <div className="admin-scrollbar -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`shrink-0 rounded-sm border px-2.5 py-1.5 text-[11px] tracking-[0.1em] uppercase ${
              filter === f
                ? "border-primary/70 text-primary bg-secondary"
                : "border-border text-muted-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <label className="label-hud flex min-w-0 items-center gap-2">
          Od
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border-border bg-background text-foreground min-w-0 flex-1 rounded-sm border px-2 py-1.5 text-xs"
          />
        </label>
        <label className="label-hud flex min-w-0 items-center gap-2">
          Do
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border-border bg-background text-foreground min-w-0 flex-1 rounded-sm border px-2 py-1.5 text-xs"
          />
        </label>
      </div>

      <Panel className="p-0">
        {visible.map((g) => (
          <div key={g.week}>
            <p className="border-border/70 bg-secondary/40 label-hud border-y px-3 py-1.5">
              {g.week}
            </p>
            <div className="divide-border/70 divide-y">
              {g.items.map((m) => (
                <div key={m.key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm">
                      {m.label}
                      {m.count > 1 ? <span className="text-primary"> x{m.count}</span> : null}
                    </p>
                    <p className="text-inactive text-[11px]">
                      {m.category} · {dateTime(m.created_at)}
                    </p>
                  </div>
                  <p
                    className={`num shrink-0 text-sm ${
                      m.amount > 0
                        ? "text-success"
                        : m.amount < 0
                          ? "text-destructive"
                          : "text-inactive"
                    }`}
                  >
                    {m.amount > 0 ? "+" : ""}
                    {fmtKR(m.amount)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
        {totalItems === 0 ? (
          <p className="text-muted-foreground flex items-center gap-2 p-3 text-sm">
            <History className="size-4" strokeWidth={1.5} /> Brak operacji dla wybranych filtrów.
          </p>
        ) : null}
      </Panel>

      {totalItems > 10 ? (
        <Button variant="outline" className="mt-3 w-full" onClick={() => setFull((v) => !v)}>
          {full ? "Pokaż tylko ostatnie 10" : "Pokaż pełną historię"}
        </Button>
      ) : null}
    </>
  );
}
