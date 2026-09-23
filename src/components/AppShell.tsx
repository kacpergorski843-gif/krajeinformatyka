import { Link, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Landmark, Globe2, Map, ShoppingCart, Trophy, ShieldHalf, Rocket, LogOut, Menu, X, Activity, ArrowRightLeft, Bot } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Me } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/format";

const NAV = [
  { to: "/panstwo", label: "Państwo", icon: Landmark },
  { to: "/doradca", label: "Doradca AI", icon: Bot },
  { to: "/swiat", label: "Świat", icon: Globe2 },
  { to: "/regiony", label: "Regiony", icon: Map },
  { to: "/arsenal", label: "Wojsko", icon: Rocket },
  { to: "/sklep", label: "Sklep", icon: ShoppingCart },
  { to: "/ranking", label: "Ranking", icon: Trophy },
  { to: "/transfer", label: "Transfery", icon: ArrowRightLeft },
] as const;

export function AppShell({ me, title, subtitle, children }: {
  me: Me | null; title: string; subtitle?: string; children: ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirmOut, setConfirmOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }
  const items = me?.isAdmin ? [...NAV, { to: "/admin", label: "Administracja", icon: ShieldHalf } as const] : NAV;
  const nav = (mobile = false) => <div className={mobile ? "grid gap-1" : "space-y-1"}>
    {items.map((item) => <Link key={item.to} to={item.to} onClick={() => mobile && setMobileOpen(false)}
      activeProps={{ className: "nav-active" }} className="nav-item">
      <item.icon className="size-[18px] shrink-0" strokeWidth={1.8} /><span className="truncate">{item.label}</span>
    </Link>)}
  </div>;

  return <div className="app-shell min-h-screen pb-20 lg:pb-0">
    <div className="mx-auto flex min-h-screen w-full max-w-[1440px]">
      <aside className="sidebar hidden w-[17rem] shrink-0 lg:flex">
        <div className="sticky top-0 flex h-screen w-full flex-col px-5 py-6">
          <div className="brand-block mb-7">
            <div className="brand-mark"><Activity className="size-5" /></div>
            <div><p className="font-display text-sm font-bold tracking-[0.2em]">COUNTRY RP</p><p className="label-hud mt-1">Strategic command</p></div>
          </div>
          <div className="command-section"><p className="nav-caption">Centrum dowodzenia</p>{nav()}</div>
          <div className="mt-auto">
            <div className="profile-strip mb-3">
              <div className="profile-avatar">{(me?.displayName ?? me?.email ?? "?").slice(0,1).toUpperCase()}</div>
              <div className="min-w-0"><p className="truncate text-sm font-semibold">{me?.displayName ?? me?.email ?? "Dowódca"}</p>
              <p className="text-primary text-[10px] tracking-[0.14em] uppercase">{me ? ROLE_LABELS[me.role] : ""}</p></div>
            </div>
            <button type="button" onClick={() => setConfirmOut(true)} className="nav-item w-full"><LogOut className="size-[18px]" /> Wyloguj</button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-4 sm:px-6 lg:px-10 lg:py-8">
        <header className="page-header command-header">
          <div className="min-w-0"><div className="flex items-center gap-2"><span className="command-pulse" /><p className="label-hud">SYSTEM / {title.toUpperCase()}</p></div>
          <h1 className="page-title truncate">{title}</h1>{subtitle ? <p className="page-subtitle truncate">{subtitle}</p> : null}</div>
          <div className="flex items-center gap-2"><div className="system-status hidden sm:flex"><span /> ONLINE</div>
            <button className="mobile-menu-button lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Otwórz menu"><Menu className="size-5" /></button>
          </div>
        </header>
        <div className="content-area"><div className="page-intro"><span>LIVE OPERATIONS</span><span className="page-intro-line" /></div>{children}</div>
      </main>
    </div>
    <nav className="mobile-nav lg:hidden">
      {items.filter((item) => ["/panstwo", "/swiat", "/regiony", "/sklep"].includes(item.to)).map((item) => <Link key={item.to} to={item.to} activeProps={{ className: "mobile-nav-active" }} className="mobile-nav-item">
        <item.icon className="size-5" strokeWidth={1.8}/><span>{item.label}</span>
      </Link>)}
      <button className="mobile-nav-item" onClick={() => setMobileOpen(true)}><Menu className="size-5"/><span>Menu</span></button>
    </nav>
    {mobileOpen ? <div className="mobile-drawer-backdrop lg:hidden" onClick={() => setMobileOpen(false)}>
      <aside className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border pb-4"><div className="brand-block"><div className="brand-mark"><Activity className="size-5"/></div><span className="font-display font-bold tracking-[0.18em]">COUNTRY RP</span></div>
        <button onClick={() => setMobileOpen(false)} aria-label="Zamknij menu"><X className="size-5"/></button></div>
        <div className="mt-5">{nav(true)}</div>
      </aside>
    </div> : null}
    <Dialog open={confirmOut} onOpenChange={setConfirmOut}><DialogContent className="admin-dialog">
      <DialogHeader><DialogTitle>Wylogować się?</DialogTitle><DialogDescription>Zamkniesz bieżącą sesję dowodzenia. Dane gry pozostają bez zmian.</DialogDescription></DialogHeader>
      <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => setConfirmOut(false)}>Anuluj</Button>
      <Button variant="destructive" className="flex-1" onClick={() => { setConfirmOut(false); void signOut(); }}>Wyloguj</Button></div>
    </DialogContent></Dialog>
  </div>;
}
