import { createFileRoute, Outlet, redirect, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { meQuery } from "@/lib/api";
import { getMaintenanceMode } from "@/lib/admin.functions";

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
  const getMode = useServerFn(getMaintenanceMode);
  const mode = useQuery({
    queryKey: ["maintenance_mode"],
    queryFn: () => getMode(),
    enabled: !!me.data && !me.data.isAdmin,
    retry: 1,
  });

  const maintenancePath = location.pathname.startsWith("/swiat/")
    ? "/swiat/$id"
    : location.pathname;
  const pageDisabled = mode.data?.pages.includes(maintenancePath) === true;
  if (me.data?.isAdmin || (mode.data?.enabled !== true && !pageDisabled)) return <Outlet />;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <section className="w-full max-w-md text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          {mode.data?.messageTitle || "Ekonomia jest aktualnie w remoncie"}
        </h1>
        <p className="mx-auto mt-3 max-w-sm whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
          {mode.data?.messageBody || "Szykuje się aktualizacja! Po więcej informacji skontaktuj się z informatykiem."}
        </p>
      </section>
    </main>
  );
}
