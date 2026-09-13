import { Link, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Landmark,
  Globe2,
  Map,
  ShoppingCart,
  Trophy,
  ShieldHalf,
  LogOut,
} from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Me } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/format";

const NAV = [
  { to: "/panstwo", label: "Moje państwo", icon: Landmark },
  { to: "/swiat", label: "Świat", icon: Globe2 },
  { to: "/regiony", label: "Regiony", icon: Map },
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
    <div className="min-h-screen pb-24 lg:pb-0">
      <div className="mx-auto flex w-full max-w-6xl gap-6 px-4 py-5 lg:px-8">
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-6 space-y-1">
            <div className="mb-5 px-2">
              <p className="font-display text-sm tracking-[0.2em] text-primary uppercase">
                Sztab
              </p>
              <p className="text-muted-foreground text-xs">Country Roleplay</p>
            </div>
            {items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeProps={{ className: "bg-secondary text-foreground" }}
                className="text-muted-foreground hover:text-foreground flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors"
              >
                <item.icon className="size-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            ))}
            <button
              onClick={signOut}
              className="text-muted-foreground hover:text-foreground flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm"
            >
              <LogOut className="size-4 shrink-0" />
              Wyloguj
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold sm:text-2xl">{title}</h1>
              {subtitle ? (
                <p className="text-muted-foreground truncate text-xs sm:text-sm">{subtitle}</p>
              ) : null}
            </div>
            <div className="shrink-0 text-right">
              <p className="max-w-[9rem] truncate text-xs font-medium sm:max-w-none">
                {me?.displayName ?? me?.email ?? ""}
              </p>
              <p className="text-primary text-[11px] tracking-wide uppercase">
                {me ? ROLE_LABELS[me.role] : ""}
              </p>
            </div>
          </header>
          {children}
        </main>
      </div>

      <nav className="border-border bg-card/95 fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-6">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeProps={{ className: "text-primary" }}
              className="text-muted-foreground flex flex-col items-center gap-1 py-2.5 text-[10px]"
            >
              <item.icon className="size-5" />
              <span className="max-w-full truncate px-0.5">{item.label.split(" ")[0]}</span>
            </Link>
          ))}
          {!me?.isAdmin ? (
            <button
              onClick={signOut}
              className="text-muted-foreground flex flex-col items-center gap-1 py-2.5 text-[10px]"
            >
              <LogOut className="size-5" />
              Wyjdź
            </button>
          ) : null}
        </div>
      </nav>
    </div>
  );
}
