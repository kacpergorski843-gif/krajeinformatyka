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

    const invalidationKeys: Record<string, readonly (readonly unknown[])[]> = {
      admin_actions: [["admin_actions"]],
      app_maintenance_mode: [["maintenance_mode"]],
      bilateral_agreement_runs: [["bilateral_agreement_runs"], ["bilateral_agreements"]],
      bilateral_agreements: [["bilateral_agreements"], ["bilateral_agreement_runs"]],
      countries: [["country_stats"], ["public_countries"], ["public_country"], ["me"], ["market", "offers"], ["market", "my-offers"]],
      country_suggestions: [["country_suggestions"]],
      economy_bonuses: [["active_income_bonuses"], ["economy_bonus"]],
      economy_runs: [["economy_runs"], ["economy_run_latest"]],
      market_negotiations: [["market", "negotiations"], ["market", "offers"]],
      market_offers: [["market", "offers"], ["market", "my-offers"], ["market", "negotiations"]],
      market_sales: [["market", "sales"], ["market", "price-history"], ["transactions"]],
      missile_strikes: [["missile_strikes"], ["incoming_strikes"]],
      profiles: [["me"], ["admin_users"], ["public_countries"], ["public_country"]],
      region_occupations: [["region_occupations"], ["occupied_regions"], ["regions"], ["all_regions"], ["country_stats"], ["public_countries"], ["public_country"]],
      region_slots: [["regions"], ["all_regions"], ["country_stats"], ["public_countries"], ["public_country"], ["transfer_regions"]],
      regions: [["regions"], ["all_regions"], ["all_region_options"], ["transfer_regions"], ["region_aa"], ["region_occupations"], ["occupied_regions"], ["country_stats"], ["public_countries"], ["public_country"]],
      shop_items: [["shop_items"], ["admin_shop_items"], ["country_stats"], ["public_countries"], ["public_country"]],
      transactions: [["transactions"]],
      user_roles: [["me"], ["admin_users"]],
    };

    let channel = supabase.channel("authenticated-game-realtime");
    for (const table of realtimeTables) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          for (const queryKey of invalidationKeys[table] ?? []) {
            void queryClient.invalidateQueries({ queryKey: [...queryKey] });
          }
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

  const maintenanceSignature = mode.data
    ? JSON.stringify({
        enabled: mode.data.enabled,
        pages: mode.data.pages,
        messageTitle: mode.data.messageTitle,
        messageBody: mode.data.messageBody,
      })
    : null;

  useEffect(() => {
    if (!maintenanceSignature) return;

    const storageKey = "maintenance-reload-state";
    const syncMaintenanceState = () => {
      if (document.visibilityState !== "visible") return;

      const previousSignature = sessionStorage.getItem(storageKey);
      sessionStorage.setItem(storageKey, maintenanceSignature);

      if (previousSignature && previousSignature !== maintenanceSignature) {
        window.location.reload();
      }
    };

    syncMaintenanceState();
    document.addEventListener("visibilitychange", syncMaintenanceState);
    return () => document.removeEventListener("visibilitychange", syncMaintenanceState);
  }, [maintenanceSignature]);

  const maintenancePath = location.pathname.startsWith("/swiat/")
    ? "/swiat/$id"
    : location.pathname;
  const pageDisabled = mode.data?.pages.includes(maintenancePath) === true;
  const maintenanceUnavailable = !!me.data && !me.data.isMainAdmin && (mode.isPending || mode.isError);
  const maintenanceEnabled = mode.data?.enabled === true || pageDisabled;
  if (me.data?.isMainAdmin || (!maintenanceUnavailable && !maintenanceEnabled)) return <Outlet />;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <section className="w-full max-w-md text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          {mode.data?.messageTitle || (maintenanceUnavailable ? "Nie można zweryfikować dostępności aplikacji" : "Ekonomia jest aktualnie w remoncie")}
        </h1>
        <p className="mx-auto mt-3 max-w-sm whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
          {mode.data?.messageBody || (maintenanceUnavailable ? "Spróbuj ponownie za chwilę. Dostęp zostanie przywrócony po potwierdzeniu ustawień serwera." : "Szykuje się aktualizacja! Po więcej informacji skontaktuj się z informatykiem.")}
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
