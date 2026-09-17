import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Coins, Vote } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Panel } from "@/components/stat";
import { countriesQuery, meQuery } from "@/lib/api";
import type { CountryStats } from "@/lib/api";
import { fmtKR, units } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/ranking")({
  head: () => ({
    meta: [
      { title: "Ranking państw — Nation Dynamics" },
      {
        name: "description",
        content: "Ranking państw: największe zarobki dobowe i potencjał głosów wojennych.",
      },
      { property: "og:title", content: "Ranking państw — Nation Dynamics" },
      {
        property: "og:description",
        content: "Zarobki dobowe i potencjał głosów wojennych wszystkich państw.",
      },
    ],
  }),
  component: Ranking,
});

type Mode = "income" | "votes";

const value = (c: CountryStats, mode: Mode) =>
  mode === "income" ? fmtKR(c.gross_income) : `${units(c.vote_potential)} gł.`;

const hint = (c: CountryStats, mode: Mode) =>
  mode === "income"
    ? `Regiony: ${c.regions_count}`
    : `Żołnierze ${units(c.soldier_packs * 500000)} · Czołgi ${units(c.tank_packs * 50)}`;

function Ranking() {
  const { data: me } = useQuery(meQuery);
  const { data: countries } = useQuery(countriesQuery);
  const [mode, setMode] = useState<Mode>("income");

  const list = [...(countries ?? [])].sort((a, b) =>
    mode === "income"
      ? Number(b.gross_income) - Number(a.gross_income)
      : b.vote_potential - a.vote_potential,
  );

  return (
    <AppShell
      me={me ?? null}
      title="Ranking"
      subtitle="Zarobki dobowe i potencjał głosów wojennych"
    >
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["income", "Największe zarobki", Coins],
            ["votes", "Potencjał głosów", Vote],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            className={`flex min-w-0 items-center justify-center gap-2 rounded-sm border px-3 py-2.5 text-xs tracking-[0.12em] uppercase ${
              mode === key
                ? "border-primary/70 text-primary bg-secondary"
                : "border-border text-muted-foreground"
            }`}
          >
            <Icon className="size-4 shrink-0" strokeWidth={1.5} />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {list.slice(0, 3).map((c, i) => (
          <Panel key={c.country_id} className="hud-frame">
            <p className="text-primary font-display text-xs tracking-[0.24em] uppercase">
              RANK {String(i + 1).padStart(2, "0")}
            </p>
            <p className="mt-2 truncate text-base font-semibold">{c.name}</p>
            <p className="num text-accent mt-2 text-lg">{value(c, mode)}</p>
            <p className="text-inactive mt-1 text-[11px] uppercase">{hint(c, mode)}</p>
          </Panel>
        ))}
      </div>

      <Panel className="divide-border mt-3 divide-y p-0">
        {list.slice(3).map((c, i) => (
          <div
            key={c.country_id}
            className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 ${
              c.country_id === me?.countryId ? "bg-secondary/60" : ""
            }`}
          >
            <span className="num text-inactive w-6 shrink-0 text-sm">{i + 4}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{c.name}</span>
              <span className="text-inactive text-[11px] uppercase">{hint(c, mode)}</span>
            </span>
            <span className="num text-primary shrink-0 text-sm">{value(c, mode)}</span>
          </div>
        ))}
        {countries && countries.length === 0 ? (
          <p className="text-muted-foreground p-3 text-sm">Brak państw w rozgrywce.</p>
        ) : null}
      </Panel>

      <p className="text-inactive mt-3 text-xs">
        Potencjał głosów liczony bez limitu: pakiety żołnierzy + pakiety czołgów.
      </p>
    </AppShell>
  );
}
