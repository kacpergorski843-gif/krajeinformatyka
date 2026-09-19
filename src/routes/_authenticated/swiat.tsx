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
      {
        name: "description",
        content: "Przegląd państw, ich gospodarek, regionów i siły militarnej.",
      },
    ],
  }),
  component: World,
});

function World() {
  const { data: me } = useQuery(meQuery);
  const { data: countries } = useQuery(publicCountriesQuery);
  const [q, setQ] = useState("");

  const list = (countries ?? []).filter((country) =>
    country.name.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <AppShell
      me={me ?? null}
      title="Świat / Państwa"
      subtitle="Podglądasz dane wszystkich państw"
    >
      <Input
        placeholder="Szukaj państwa…"
        value={q}
        onChange={(event) => setQ(event.target.value)}
        className="mb-4"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((country) => (
          <a
            key={country.country_id}
            href={`/swiat/${country.country_id}`}
            className="block"
          >
            <Panel className="h-full border-border/80 bg-card/80 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-xl">
              <div className="flex items-center gap-3">
                <span className="shrink-0 text-xl">{country.flag}</span>
                <p className="truncate text-base font-semibold">
                  {country.name}
                  {country.country_id === me?.countryId && (
                    <span className="ml-2 text-[10px] uppercase text-primary">
                      Twoje
                    </span>
                  )}
                </p>
              </div>

              <dl className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Skarbiec</dt>
                  <dd className="num">{krShort(country.balance)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Przychód / doba</dt>
                  <dd className="num text-primary">
                    {krShort(country.gross_income)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Regiony</dt>
                  <dd className="num">{units(country.regions_count)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Wartość militarna</dt>
                  <dd className="num text-accent">
                    {krShort(country.military_value)}
                  </dd>
                </div>
              </dl>
            </Panel>
          </a>
        ))}
      </div>

      {list.length === 0 && (
        <p className="text-sm text-muted-foreground">Brak wyników.</p>
      )}
    </AppShell>
  );
}
