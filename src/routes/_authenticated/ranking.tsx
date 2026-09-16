import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Panel } from "@/components/stat";
import { countriesQuery, meQuery } from "@/lib/api";
import { krShort, units } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/ranking")({
  head: () => ({
    meta: [
      { title: "Ranking państw — COUNTRY RP" },
      { name: "description", content: "Porównanie produkcji i wartości militarnej państw w COUNTRY RP." },
      { property: "og:title", content: "Ranking państw — COUNTRY RP" },
      { property: "og:description", content: "Porównanie produkcji i wartości militarnej państw w COUNTRY RP." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Ranking,
});

function Ranking() {
  const { data: me } = useQuery(meQuery);
  const { data: countries } = useQuery(countriesQuery);
  const [sort, setSort] = useState<"income" | "military">("income");

  const list = [...(countries ?? [])].sort((a, b) =>
    sort === "income"
      ? Number(b.gross_income) - Number(a.gross_income)
      : Number(b.military_value) - Number(a.military_value),
  );

  return (
    <AppShell me={me ?? null} title="Ranking państw" subtitle="Produkcja i siła militarna">
      <div className="mb-4 flex gap-2">
        {(
          [
            ["income", "Produkcja KR"],
            ["military", "Wartość militarna"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSort(key)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              sort === key ? "bg-primary text-primary-foreground" : "border-border border"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <Panel className="divide-border divide-y p-0">
        {list.map((c, i) => (
          <Link
            key={c.country_id}
            to="/swiat/$id"
            params={{ id: c.country_id }}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3"
          >
            <span className="num text-muted-foreground w-6 shrink-0 text-sm">{i + 1}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">
                {c.flag} {c.name}
              </span>
              <span className="text-muted-foreground text-xs">
                Regiony: {units(c.regions_count)} · Głosy wojenne: {units(c.war_votes)}
              </span>
            </span>
            <span className="num shrink-0 text-right text-sm">
              {sort === "income" ? (
                <span className="text-primary">{krShort(c.gross_income)}</span>
              ) : (
                <span className="text-accent">{krShort(c.military_value)}</span>
              )}
            </span>
          </Link>
        ))}
      </Panel>
    </AppShell>
  );
}
