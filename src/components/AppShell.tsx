import { Link, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Landmark, Globe2, Map, ShoppingCart, Trophy, ShieldHalf, Rocket, LogOut, Menu, X, ArrowRightLeft } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Me } from "@/lib/api";
import { getMaintenanceMode } from "@/lib/admin.functions";
import { useServerFn } from "@tanstack/react-start";


// Set to true to restore navigation icons without changing the menu structure.
const SHOW_NAV_ICONS = false;

const NAV = [
  { to: "/panstwo", label: "Państwo", icon: Landmark },
  { to: "/swiat", label: "Świat", icon: Globe2 },
  { to: "/regiony", label: "Regiony", icon: Map },
  { to: "/arsenal", label: "Arsenał", icon: Rocket },
  { to: "/sklep", label: "Sklep", icon: ShoppingCart },
  { to: "/rynek", label: "Rynek", icon: ShoppingCart },
  { to: "/masterki", label: "Masterki", icon: Trophy },
  { to: "/ranking", label: "Ranking", icon: Trophy },
  { to: "/transfer", label: "Transfery", icon: ArrowRightLeft },
] as const;

export function AppShell({ me, title, children }: {
  me: Me | null; title: string; subtitle?: string; children: ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirmOut, setConfirmOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const getMode = useServerFn(getMaintenanceMode);
  const maintenanceMode = useQuery({
    queryKey: ["maintenance_mode"],
    queryFn: () => getMode(),
    enabled: !!me && !me.isAdmin,
  });

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  const items = me?.isAdmin ? [...NAV, { to: "/admin", label: "Administracja", icon: ShieldHalf } as const] : NAV;
  const isInMaintenance = (path: string) => me?.isAdmin !== true && (
    maintenanceMode.data?.enabled === true ||
    maintenanceMode.data?.pages.includes(path) === true ||
    (path === "/swiat" && maintenanceMode.data?.pages.includes("/swiat/$id") === true)
  );
  const nav = (mobile = false) => (
    <div className={mobile ? "grid gap-1" : "space-y-1"}>
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          prefetch="intent"
          onClick={() => mobile && setMobileOpen(false)}
          activeProps={{ className: "nav-active" }}
          className={`nav-item ${isInMaintenance(item.to) ? "opacity-40 grayscale" : ""}`}
        >
          {SHOW_NAV_ICONS ? <item.icon className="size-[18px] shrink-0" strokeWidth={1.8} /> : null}
          <span className="truncate">{item.label}</span>
        </Link>
      ))}
    </div>
  );

  return <div className="app-shell min-h-screen">
    <div className="mx-auto flex min-h-screen w-full max-w-[1440px]">
      <aside className="sidebar hidden w-[17rem] shrink-0 lg:flex">
        <div className="sticky top-0 flex h-screen w-full flex-col px-5 py-6">
          <div className="command-section">{nav()}</div>
          <div className="mt-auto space-y-2">
            <button type="button" onClick={() => setConfirmOut(true)} className="nav-item w-full"><LogOut className="size-[18px]" /> Wyloguj</button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-4 sm:px-6 lg:px-10 lg:py-8">
        <header className="page-header command-header">
          <div className="min-w-0"><h1 className="page-title truncate">{title}</h1></div>
        </header>
        <div className="content-area">{children}</div>
      </main>
    </div>
    <button className="mobile-menu-button lg:hidden" style={{ top: "auto", bottom: "max(1rem, env(safe-area-inset-bottom))" }} onClick={() => setMobileOpen(true)} aria-label="Otwórz menu" aria-expanded={mobileOpen}><Menu className="size-5" /></button>
    {mobileOpen ? <div className="mobile-drawer-backdrop lg:hidden" role="presentation" onClick={() => setMobileOpen(false)}>
      <aside className="mobile-drawer flex flex-col" role="dialog" aria-modal="true" aria-label="Menu nawigacji" onClick={(e) => e.stopPropagation()}>
        <button className="ml-auto mb-4 block" onClick={() => setMobileOpen(false)} aria-label="Zamknij menu"><X className="size-5"/></button>
        <div className="min-h-0 flex-1 overflow-y-auto">{nav(true)}</div>
        <div className="mt-auto space-y-2 pt-4">
          <button type="button" onClick={() => { setMobileOpen(false); setConfirmOut(true); }} className="nav-item w-full">
            <LogOut className="size-[18px]" /> Wyloguj
          </button>
        </div>
      </aside>
    </div> : null}
    <Dialog open={confirmOut} onOpenChange={setConfirmOut}><DialogContent className="admin-dialog">
      <DialogHeader><DialogTitle>Wylogować się?</DialogTitle><DialogDescription>Zamkniesz bieżącą sesję dowodzenia. Dane gry pozostają bez zmian.</DialogDescription></DialogHeader>
      <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => setConfirmOut(false)}>Anuluj</Button>
      <Button variant="destructive" className="flex-1" onClick={() => { setConfirmOut(false); void signOut(); }}>Wyloguj</Button></div>
    </DialogContent></Dialog>
  </div>;
}
