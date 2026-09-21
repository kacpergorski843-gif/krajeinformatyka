import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BrainCircuit, Database, History, ShieldCheck, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AiAdvisor } from "@/components/AiAdvisor";
import { Panel } from "@/components/stat";
import { meQuery } from "@/lib/api";

export const Route = createFileRoute("/_authenticated/doradca")({
  head: () => ({
    meta: [
      { title: "Doradca AI — COUNTRY RP" },
      {
        name: "description",
        content: "Strategiczny doradca AI analizujący dane, historię i sytuację Twojego państwa.",
      },
    ],
  }),
  component: AdvisorPage,
});

function AdvisorPage() {
  const { data: me } = useQuery(meQuery);

  if (!me) return null;

  return (
    <AppShell me={me} title="Doradca AI" subtitle="Centrum analizy strategicznej">
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Panel className="border-primary/30 bg-primary/5 p-3">
          <BrainCircuit className="size-5 text-primary" />
          <p className="label-hud mt-3">ANALITYKA</p>
          <p className="mt-1 text-sm font-semibold">Strategiczne odpowiedzi</p>
          <p className="mt-1 text-xs text-muted-foreground">Analiza sytuacji zamiast gotowych, losowych porad.</p>
        </Panel>
        <Panel className="p-3">
          <Database className="size-5 text-primary" />
          <p className="label-hud mt-3">DANE GRY</p>
          <p className="mt-1 text-sm font-semibold">Aktualny stan państwa</p>
          <p className="mt-1 text-xs text-muted-foreground">Gospodarka, regiony, budynki, wojsko i zasoby.</p>
        </Panel>
        <Panel className="p-3">
          <History className="size-5 text-primary" />
          <p className="label-hud mt-3">HISTORIA</p>
          <p className="mt-1 text-sm font-semibold">Kontekst wcześniejszych działań</p>
          <p className="mt-1 text-xs text-muted-foreground">Transakcje, okupacje, uderzenia i cykle gospodarcze.</p>
        </Panel>
        <Panel className="p-3">
          <ShieldCheck className="size-5 text-primary" />
          <p className="label-hud mt-3">BEZPIECZEŃSTWO</p>
          <p className="mt-1 text-sm font-semibold">Dane tylko do analizy</p>
          <p className="mt-1 text-xs text-muted-foreground">Agent nie wykonuje za Ciebie operacji w grze.</p>
        </Panel>
      </div>

      <Panel className="mb-4 border-primary/30 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-sm border border-primary/30 bg-background">
            <Sparkles className="size-5 text-primary" />
          </div>
          <div>
            <p className="label-hud">CENTRUM DOWODZENIA / AI</p>
            <h2 className="mt-1 font-display text-xl font-semibold">Zapytaj swojego doradcę</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Opisz cel, problem albo decyzję, którą rozważasz. Doradca ma dostęp do danych rozgrywki przekazywanych przez backend i może porównywać warianty strategiczne.
            </p>
          </div>
        </div>
      </Panel>

      <AiAdvisor />
    </AppShell>
  );
}
