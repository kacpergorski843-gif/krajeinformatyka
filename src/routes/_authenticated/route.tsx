import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Construction } from "lucide-react";
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
  const getMode = useServerFn(getMaintenanceMode);
  const mode = useQuery({
    queryKey: ["maintenance_mode"],
    queryFn: () => getMode(),
    enabled: !!me.data && !me.data.isAdmin,
    retry: 1,
  });

  if (me.data?.isAdmin || mode.data?.enabled !== true) return <Outlet />;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <section className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 grid size-16 place-items-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
          <Construction className="size-7" strokeWidth={1.6} />
        </div>
        <p className="label-hud">NATION DYNAMICS · PRZERWA TECHNICZNA</p>
        <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl">Ekonomia jest aktualnie w remoncie</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Szykuje się aktualizacja! Po więcej informacji skontaktuj się z informatykiem.
        </p>
        <div className="mx-auto mt-7 h-px w-16 bg-border" />
        <p className="mt-5 text-xs text-muted-foreground">Dziękujemy za cierpliwość. Wkrótce wracamy.</p>
      </section>
    </main>
  );
}
