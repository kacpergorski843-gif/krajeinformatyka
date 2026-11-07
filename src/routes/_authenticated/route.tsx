import { createFileRoute, Outlet, redirect, useLocation, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { meQuery } from "@/lib/api";
import { getMaintenanceMode } from "@/lib/admin.functions";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const me = useQuery(meQuery);
  const location = useLocation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const getMode = useServerFn(getMaintenanceMode);
  const mode = useQuery({
    queryKey: ["maintenance_mode"],
    queryFn: () => getMode(),
    // Poll the global setting so an active session is gated without a page reload.
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    // Only the main administrator is exempt from maintenance mode.
    enabled: !!me.data && !me.data.isMainAdmin,
    retry: 1,
  });

  useEffect(() => {
    if (!me.data) return;

    // One authenticated Realtime channel keeps every open game session in sync.
    // The payload is intentionally ignored; React Query reloads through existing RLS-protected queries.
    const realtimeTables = [
      "admin_actions",
      "app_maintenance_mode",
      "bilateral_agreement_runs",
      "bilateral_agreements",
      "countries",
      "country_suggestions",
      "economy_bonuses",
      "economy_runs",
      "market_negotiations",
      "market_offers",
      "market_sales",
      "missile_strikes",
      "profiles",
      "region_occupations",
      "region_slots",
      "regions",
      "shop_items",
      "transactions",
      "user_roles",
    ] as const;

    let channel = supabase.channel("authenticated-game-realtime");
    for (const table of realtimeTables) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          // Views such as country_stats are refreshed when their source tables change.
          void queryClient.invalidateQueries();
        },
      );
    }

    channel = channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        // Reconcile changes that may have happened while the socket connected.
        void queryClient.invalidateQueries();
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [me.data?.userId, queryClient]);

  const maintenancePath = location.pathname.startsWith("/swiat/")
    ? "/swiat/$id"
    : location.pathname;
  const pageDisabled = mode.data?.pages.includes(maintenancePath) === true;
  if (me.data?.isMainAdmin || (mode.data?.enabled !== true && !pageDisabled)) return <Outlet />;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <section className="w-full max-w-md text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          {mode.data?.messageTitle || "Ekonomia jest aktualnie w remoncie"}
        </h1>
        <p className="mx-auto mt-3 max-w-sm whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
          {mode.data?.messageBody || "Szykuje się aktualizacja! Po więcej informacji skontaktuj się z informatykiem."}
        </p>
        <Button variant="outline" className="mt-6" onClick={() => {
          if (window.history.length > 1) router.history.back();
          else void router.navigate({ to: "/panstwo" });
        }}>
          <ArrowLeft className="mr-2 size-4" /> Wróć
        </Button>
      </section>
    </main>
  );
}
