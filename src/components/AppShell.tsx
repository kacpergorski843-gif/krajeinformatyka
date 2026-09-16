import { Link, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Landmark,
  Globe2,
  Map,
  ShoppingCart,
  Trophy,
  ShieldHalf,
  Rocket,
  LogOut,
} from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Me } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/format";

const NAV = [
  { to: "/panstwo", label: "Moje", icon: Landmark },
  { to: "/swiat", label: "Świat", icon: Globe2 },
  { to: "/regiony", label: "Regiony", icon: Map },
  { to: "/arsenal", label: "Arsenał", icon: Rocket },
  { to: "/sklep", label: "Sklep", icon: ShoppingCart },
  { to: "/ranking", label: "Ranking", icon: Trophy },
] as const;

export function AppShell({
  me,
  title,
  subtitle,
  children,
}: {
  me: Me | null;
  title: string;
  subtitle?: string | undefined;
  children: ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  const items = me?.isAdmin
    ? [...NAV, { to: "/admin", label: "Panel", icon: ShieldHalf } as const]
    : NAV;

  return (
    <div className="tactical-bg min-h-screen pb-24 lg:pb-0">
      <div className="mx-auto flex w-full max-w-6xl gap-6 px-3 py-4 sm:px-4 lg:px-8 lg:py-5">
        <aside className="hidden w-52 shrink-0 lg:block">
          <div className="sticky top-6 space-y-0.5">
            <div className="border-border/70 mb-5 border-b px-2 pb-3">
              <p className="font-display text-primary text-sm tracking-[0.24em] uppercase">
                Country RP
              </p>
              <p className="label-hud">Sztab dowodzenia</p>
            </div>
            {items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeProps={{
                  className: "bg-secondary text-foreground border-primary/60",
                }}
                className="text-muted-foreground hover:text-foreground hover:bg-secondary/50 flex items-center gap-3 rounded-sm border-l-2 border-transparent px-3 py-2 text-sm transition-colors"
              >
                <item.icon className="size-4 shrink-0" strokeWidth={1.5} />
                <span className="truncate">{item.label}</span>
              </Link>
            ))}
            <button
              type="button"
              onClick={signOut}
              className="text-inactive hover:text-foreground mt-2 flex w-full items-center gap-3 rounded-sm px-3 py-2 text-sm"
            >
              <LogOut className="size-4 shrink-0" strokeWidth={1.5} />
              Wyloguj
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="border-border/70 mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b pb-3">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight sm:text-2xl">{title}</h1>
              {subtitle ? <p className="label-hud truncate">{subtitle}</p> : null}
            </div>
            <div className="shrink-0 text-right">
              <p className="max-w-[9rem] truncate text-xs font-medium sm:max-w-none">
                {me?.displayName ?? me?.email ?? ""}
              </p>
              <p className="text-primary text-[10px] tracking-[0.16em] uppercase">
                {me ? ROLE_LABELS[me.role] : ""}
              </p>
            </div>
          </header>
          {children}
        </main>
      </div>

      <nav className="border-border bg-card/95 fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur lg:hidden">
        <div
          className="admin-scrollbar mx-auto flex max-w-full overflow-x-auto px-1"
        >
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeProps={{ className: "text-primary" }}
              className="text-inactive flex min-w-14 flex-1 flex-col items-center gap-1 py-2.5 text-[10px]"
            >
              <item.icon className="size-5" strokeWidth={1.5} />
              <span className="max-w-full truncate px-0.5">{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
