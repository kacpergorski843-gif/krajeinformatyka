import { Link, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Landmark, Globe2, Map, ShoppingCart, Trophy, ShieldHalf, Rocket, LogOut, Menu, X, ArrowRightLeft, Handshake } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Me } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/format";
import { GameAlerts } from "@/components/GameAlerts";

const NAV = [
  { to: "/panstwo", label: "Państwo", icon: Landmark },
  { to: "/swiat", label: "Świat", icon: Globe2 },
  { to: "/regiony", label: "Regiony", icon: Map },
  { to: "/arsenal", label: "Wojsko", icon: Rocket },
  { to: "/sklep", label: "Sklep", icon: ShoppingCart },
  { to: "/ranking", label: "Ranking", icon: Trophy },
  { to: "/transfer", label: "Transfery", icon: ArrowRightLeft },
  { to: "/umowy", label: "Umowy", icon: Handshake },
] as const;

export function AppShell({ me, title, subtitle, children }: {
  me: Me | null; title: string; subtitle?: string; children: ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirmOut, setConfirmOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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
  const nav = (mobile = false) => (
    <div className={mobile ? "grid gap-1" : "space-y-1"}>
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          preload="intent"
          onClick={() => mobile && setMobileOpen(false)}
          activeProps={{ className: "nav-active" }}
          className="nav-item"
        >
          <item.icon className="size-[18px] shrink-0" strokeWidth={1.8} />
          <span className="truncate">{item.label}</span>
        </Link>
      ))}
    </div>
  );

  return <div className="app-shell min-h-screen pb-20 lg:pb-0">
    <GameAlerts countryId={me?.countryId ?? null} />
    <div className="shell-layout">
      <aside className="sidebar hidden shrink-0 lg:flex" aria-label="Główna nawigacja">
        <div className="sidebar-inner">
          <div className="brand-block mb-7">
            <div className="brand-mark"><Landmark className="size-5" /></div>
            <div><p className="brand-name">KRAJE INFORMATYKA</p><p className="brand-caption">Twoje centrum dowodzenia</p></div>
          </div>
          <div className="command-section"><p className="nav-caption">Rozgrywka</p>{nav()}</div>
          <div className="mt-auto">
            <div className="profile-strip mb-3">
              <div className="profile-avatar">{(me?.displayName ?? me?.email ?? "?").slice(0,1).toUpperCase()}</div>
              <div className="min-w-0"><p className="truncate text-sm font-semibold">{me?.displayName ?? me?.email ?? "Dowódca"}</p>
              <p className="text-primary text-[10px] tracking-[0.14em] uppercase">{me ? ROLE_LABELS[me.role] : ""}</p></div>
            </div>
            <Button variant="ghost" type="button" onClick={() => setConfirmOut(true)} className="nav-item w-full"><LogOut className="size-[18px]" /> Wyloguj</Button>
          </div>
        </div>
      </aside>
      <main className="shell-main">
        <header className="page-header command-header">
          <div className="min-w-0"><p className="page-context">Kraje Informatyka</p>
          <h1 className="page-title">{title}</h1>{subtitle ? <p className="page-subtitle">{subtitle}</p> : null}</div>
          <div className="flex items-center gap-2"><div className="system-status hidden sm:flex"><span /> Aktywna sesja</div>
            <Button variant="outline" size="icon" className="mobile-menu-button lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Otwórz menu" aria-expanded={mobileOpen}><Menu className="size-5" /></Button>
          </div>
        </header>
        <div className="content-area">{children}</div>
      </main>
    </div>
    <nav className="mobile-nav lg:hidden" aria-label="Główna nawigacja">
      {items.filter((item) => ["/panstwo", "/swiat", "/regiony", "/sklep"].includes(item.to)).map((item) => <Link key={item.to} to={item.to} preload="intent" activeProps={{ className: "mobile-nav-active" }} className="mobile-nav-item">
        <item.icon className="size-5" strokeWidth={1.8}/><span>{item.label}</span>
      </Link>)}
      <Button variant="ghost" className="mobile-nav-item h-auto" onClick={() => setMobileOpen(true)} aria-label="Otwórz pełne menu"><Menu className="size-5"/><span>Więcej</span></Button>
    </nav>
    {mobileOpen ? <div className="mobile-drawer-backdrop lg:hidden" role="presentation" onClick={() => setMobileOpen(false)}>
      <aside className="mobile-drawer" role="dialog" aria-modal="true" aria-label="Menu nawigacji" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-border pb-5"><div className="brand-block"><div className="brand-mark"><Landmark className="size-5"/></div><span className="brand-name">KRAJE INFORMATYKA</span></div>
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} aria-label="Zamknij menu"><X className="size-5"/></Button></div>
        <div className="mt-5">{nav(true)}</div>
        <Button variant="ghost" type="button" onClick={() => { setMobileOpen(false); setConfirmOut(true); }} className="nav-item mt-5 w-full"><LogOut className="size-[18px]" /> Wyloguj</Button>
      </aside>
    </div> : null}
    <Dialog open={confirmOut} onOpenChange={setConfirmOut}><DialogContent className="admin-dialog">
      <DialogHeader><DialogTitle>Wylogować się?</DialogTitle><DialogDescription>Zamkniesz bieżącą sesję dowodzenia. Dane gry pozostają bez zmian.</DialogDescription></DialogHeader>
      <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => setConfirmOut(false)}>Anuluj</Button>
      <Button variant="destructive" className="flex-1" onClick={() => { setConfirmOut(false); void signOut(); }}>Wyloguj</Button></div>
    </DialogContent></Dialog>
  </div>;
}
