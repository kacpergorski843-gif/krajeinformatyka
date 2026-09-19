import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Panel } from "@/components/stat";
import { Input } from "@/components/ui/input";
import { publicCountriesQuery, meQuery } from "@/lib/api";
import { krShort, units } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/swiat")({
  head: () => ({
    meta: [
      { title: "Świat i państwa — COUNTRY RP" },
      { name: "description", content: "Przegląd państw, ich gospodarek, regionów i siły militarnej." },
      { property: "og:title", content: "Świat i państwa — COUNTRY RP" },
      { property: "og:description", content: "Przegląd państw, ich gospodarek, regionów i siły militarnej." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: World,
});

function World() {
  const { data: me } = useQuery(meQuery);
  const { data: countries } = useQuery(publicCountriesQuery);
  const [q, setQ] = useState("");

  const list = (countries ?? []).filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <AppShell me={me ?? null} title="Świat / Państwa" subtitle="Podglądasz dane wszystkich państw">
      <Input
        placeholder="Szukaj państwa…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="mb-4"
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((c) => (
          <Link key={c.country_id} to="/swiat/$id" params={{ id: c.country_id }}>
            <Panel className="h-full border-border/80 bg-card/80 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-xl">
              <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
                <span className="shrink-0 text-xl">{c.flag}</span>
                <div><p className="truncate text-base font-semibold">
                  {c.name}
                  {c.country_id === me?.countryId ? (
                    <span className="text-primary ml-2 text-[10px] uppercase">Twoje</span>
                  ) : null}
                </p>
              </div>
              <dl className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Skarbiec</dt>
                  <dd className="num">{krShort(c.balance)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Przychód / doba</dt>
                  <dd className="num text-primary">{krShort(c.gross_income)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Regiony</dt>
                  <dd className="num">{units(c.regions_count)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Wartość militarna</dt>
                  <dd className="num text-accent">{krShort(c.military_value)}</dd>
                </div>
              </dl>
            </Panel>
          </Link>
        ))}
      </div>
      {list.length === 0 ? <p className="text-muted-foreground text-sm">Brak wyników.</p> : null}
    </AppShell>
  );
}
