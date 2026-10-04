import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Coins, Shield, Vote, ArrowLeft } from "lucide-react";
import { Panel } from "@/components/stat";
import { publicRankingQuery } from "@/lib/api";
import type { PublicRankingRow } from "@/lib/api";
import { fmtKR, units } from "@/lib/format";

export const Route = createFileRoute("/ranking-publiczny")({
  head: () => ({
    meta: [
      { title: "Ranking państw — Kraje Informatyka" },
      {
        name: "description",
        content:
          "Publiczny ranking państw: największe dzienne zarobki oraz wartość militarna.",
      },
      { property: "og:title", content: "Ranking państw — Kraje Informatyka" },
      {
        property: "og:description",
        content: "Największe zarobki dzienne i wartość militarna państw.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PublicRanking,
});


function PublicRanking() {
  const { data, isLoading, isError } = useQuery(publicRankingQuery);
  const list = [...(data ?? [])].sort((a, b) => Number(b.gross_income) - Number(a.gross_income));

  return (
    <div className="tactical-bg min-h-screen">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <Link to="/" className="text-muted-foreground inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm hover:bg-secondary/50">
          <ArrowLeft className="size-3.5" strokeWidth={1.5} /> Strona główna
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Ranking państw</h1>
        <p className="label-hud">Podgląd publiczny, tylko do odczytu</p>

        <p className="mt-5 text-sm text-muted-foreground">Ranking sortowany według produkcji KR. Każde państwo pokazuje osobno produkcję KR, głosy wojenne i wartość militarną.</p>\n\n        {isLoading ? <p className="text-muted-foreground mt-6 text-sm">Wczytywanie…</p> : null}
        {isError ? (
          <p className="text-destructive mt-6 text-sm">Nie udało się wczytać rankingu.</p>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {list.slice(0, 3).map((c, i) => (
            <Panel key={c.country_id} className="hud-frame">
              <p className="text-primary font-display text-xs tracking-[0.24em] uppercase">
                RANK {String(i + 1).padStart(2, "0")}
              </p>
              <p className="mt-2 truncate text-base font-semibold">{c.name}</p>
              <p className="num text-accent mt-2 text-lg">{valueOf(c, mode)}</p>
              <p className="text-inactive mt-1 text-[11px] uppercase">{hintOf(c, mode)}</p>
            </Panel>
          ))}
        </div>

        <Panel className="divide-border mt-3 divide-y p-0">
          {list.slice(3).map((c, i) => (
            <div
              key={c.country_id}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5"
            >
              <span className="num text-inactive w-6 shrink-0 text-sm">{i + 4}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{c.name}</span>
                <span className="text-inactive text-[11px] uppercase">{hintOf(c, mode)}</span>
              </span>
              <span className="num text-primary shrink-0 text-sm">{valueOf(c, mode)}</span>
            </div>
          ))}
          {!isLoading && list.length === 0 ? (
            <p className="text-muted-foreground p-3 text-sm">Brak państw w rozgrywce.</p>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}

function valueOf(c: PublicRankingRow, mode: Mode) {
  return mode === "income" ? fmtKR(c.gross_income) : fmtKR(c.military_value);
}

function hintOf(c: PublicRankingRow, mode: Mode) {
  return mode === "income"
    ? `Regiony: ${c.regions_count}`
    : `Wartość militarna · regiony: ${c.regions_count}`;
}
