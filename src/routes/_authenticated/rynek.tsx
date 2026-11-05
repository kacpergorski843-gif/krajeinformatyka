import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { meQuery } from "@/lib/api";

export const Route = createFileRoute("/_authenticated/rynek")({
  head: () => ({
    meta: [
      { title: "Rynek — COUNTRY RP" },
      { name: "description", content: "Rynek" },
    ],
  }),
  component: MarketPage,
});

function MarketPage() {
  const { data: me } = useQuery(meQuery);

  return (
    <AppShell me={me ?? null} title="Rynek">
      <div className="min-h-[40vh]" aria-label="Rynek" />
    </AppShell>
  );
}
