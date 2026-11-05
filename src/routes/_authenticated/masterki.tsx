import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { meQuery } from "@/lib/api";

export const Route = createFileRoute("/_authenticated/masterki")({
  head: () => ({
    meta: [
      { title: "Masterki — COUNTRY RP" },
      { name: "description", content: "Masterki" },
    ],
  }),
  component: MasterkiPage,
});

function MasterkiPage() {
  const { data: me } = useQuery(meQuery);

  return (
    <AppShell me={me ?? null} title="Masterki">
      <div className="min-h-[40vh]" aria-label="Masterki" />
    </AppShell>
  );
}
