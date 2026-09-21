import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { AiAdvisor } from "@/components/AiAdvisor";
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
      <AiAdvisor />
    </AppShell>
  );
}
