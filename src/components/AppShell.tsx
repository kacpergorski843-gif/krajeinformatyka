import { Link, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowRightLeft,
  Globe2,
  Landmark,
  LogOut,
  Map,
  Menu,
  Rocket,
  ShoppingCart,
  ShieldHalf,
  Trophy,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import "@/mobile.css";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Me } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/format";

const NAV = [
  { to: "/panstwo", label: "Państwo", mobileLabel: "Państwo", icon: Landmark },
  { to: "/swiat", label: "Świat", mobileLabel: "Świat", icon: Globe2 },
  { to: "/regiony", label: "Regiony", mobileLabel: "Regiony", icon: Map },
  { to: "/arsenal", label: "Wojsko", mobileLabel: "Wojsko", icon: Rocket },
  { to: "/sklep", label: "Sklep", mobileLabel: "Sklep", icon: ShoppingCart },
  { to: "/ranking", label: "Ranking", mobileLabel: "Ranking", icon: Trophy },
  { to: "/transfer", label: "Transfery", mobileLabel: "Transfery", icon: ArrowRightLeft },
] as const;

const MOBILE_PRIMARY = ["/panstwo", "/regiony", "/arsenal", "/sklep"] as const;

export function AppShell({
  me,
  title,
  subtitle,
  children,
}: {
  me: Me | null;
  title: string;
  subtitle?: string;
  children: ReactNode;
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

  const items = me?.isAdmin
    ? [...NAV, { to: "/admin", label: "Administracja", mobileLabel: "Admin", icon: ShieldHalf } as const]
    : NAV;

  const nav = (mobile = false) => (
    <div className={mobile ? "grid gap-1.5" : "space-y-1"}>
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          onClick={() => mobile && setMobileOpen(false)}
          activeProps={{ className: "nav-active" }}
          className={mobile ? "nav-item min-h-12 text-[0.95rem]" : "nav-item"}
        >
          <item.icon className="size-[18px] shrink-0" strokeWidth={1.8} />
          <span className="truncate">{item.label}</span>
        </Link>
      ))}
    </div>
  );

  return (
    <div className="app-shell min-h-screen pb-[calc(5.25rem+env(safe-area-inset-bottom))] lg:pb-0">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px]">
        <aside className="sidebar hidden w-[17rem] shrink-0 lg:flex">
          <div className="sticky top-0 flex h-screen w-full flex-col px-5 py-6">
            <div className="brand-block mb-7">
              <div className="brand-mark">
                <Activity className="size-5" />
              </div>
              <div>
                <p className="font-display text-sm font-bold tracking-[0.2em]">COUNTRY RP</p>
                <p className="label-hud mt-1">Strategic command</p>
              </div>
            </div>

            <div className="command-section">
              <p className="nav-caption">Centrum dowodzenia</p>
              {nav()}
            </div>

            <div className="mt-auto">
              <div className="profile-strip mb-3">
                <div className="profile-avatar">
                  {(me?.displayName ?? me?.email ?? "?").slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {me?.displayName ?? me?.email ?? "Dowódca"}
                  </p>
                  <p className="text-primary text-[10px] uppercase tracking-[0.14em]">
                    {me ? ROLE_LABELS[me.role] : ""}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmOut(true)}
                className="nav-item min-h-11 w-full"
              >
                <LogOut className="size-[18px]" />
                Wyloguj
              </button>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-3 pt-3 sm:px-6 sm:py-4 lg:px-10 lg:py-8">
          <header className="page-header command-header sticky top-0 z-30 -mx-3 mb-4 bg-background/95 px-3 backdrop-blur-md sm:static sm:mx-0 sm:mb-0 sm:bg-transparent sm:px-0 sm:backdrop-blur-none">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="command-pulse" />
                <p className="label-hud break-words leading-relaxed">SYSTEM / {title.toUpperCase()}</p>
              </div>
              <h1 className="page-title break-words">{title}</h1>
              {subtitle ? <p className="page-subtitle break-words">{subtitle}</p> : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="system-status hidden sm:flex">
                <span />
                ONLINE
              </div>
              <button
                type="button"
                className="mobile-menu-button min-h-11 min-w-11 lg:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="Otwórz menu"
                aria-expanded={mobileOpen}
              >
                <Menu className="size-5" />
              </button>
            </div>
          </header>

          <div className="content-area">
            <div className="page-intro hidden sm:flex">
              <span>LIVE OPERATIONS</span>
              <span className="page-intro-line" />
            </div>
            {children}
          </div>
        </main>
      </div>

      <nav
        aria-label="Główna nawigacja"
        className="mobile-nav !grid-cols-5 lg:hidden"
      >
        {MOBILE_PRIMARY.map((path) => {
          const item = items.find((entry) => entry.to === path);
          if (!item) return null;

          return (
            <Link
              key={item.to}
              to={item.to}
              activeProps={{ className: "mobile-nav-active" }}
              className="mobile-nav-item min-h-12"
            >
              <item.icon className="size-[21px]" strokeWidth={1.8} />
              <span>{item.mobileLabel}</span>
            </Link>
          );
        })}
        <button
          type="button"
          className="mobile-nav-item min-h-12"
          onClick={() => setMobileOpen(true)}
          aria-label="Otwórz pełne menu"
          aria-expanded={mobileOpen}
        >
          <Menu className="size-[21px]" />
          <span>Więcej</span>
        </button>
      </nav>

      {mobileOpen ? (
        <div
          className="mobile-drawer-backdrop lg:hidden"
          onClick={() => setMobileOpen(false)}
          role="presentation"
        >
          <aside
            className="mobile-drawer flex flex-col"
            onClick={(event) => event.stopPropagation()}
            aria-label="Pełne menu"
          >
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="brand-block">
                <div className="brand-mark">
                  <Activity className="size-5" />
                </div>
                <div>
                  <p className="font-display font-bold tracking-[0.18em]">COUNTRY RP</p>
                  <p className="label-hud mt-1">Nawigacja</p>
                </div>
              </div>
              <button
                type="button"
                className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-border bg-secondary/40"
                onClick={() => setMobileOpen(false)}
                aria-label="Zamknij menu"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="mt-5 flex-1 overflow-y-auto overscroll-contain">
              {nav(true)}
            </div>

            <div className="mt-4 border-t border-border pt-4">
              <div className="profile-strip mb-3">
                <div className="profile-avatar">
                  {(me?.displayName ?? me?.email ?? "?").slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {me?.displayName ?? me?.email ?? "Dowódca"}
                  </p>
                  <p className="text-primary text-[10px] uppercase tracking-[0.14em]">
                    {me ? ROLE_LABELS[me.role] : ""}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  setConfirmOut(true);
                }}
                className="nav-item min-h-12 w-full"
              >
                <LogOut className="size-[18px]" />
                Wyloguj
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      <Dialog open={confirmOut} onOpenChange={setConfirmOut}>
        <DialogContent className="admin-dialog max-w-sm">
          <DialogHeader>
            <DialogTitle>Wylogować się?</DialogTitle>
            <DialogDescription>
              Zamkniesz bieżącą sesję dowodzenia. Dane gry pozostają bez zmian.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="min-h-11 flex-1"
              onClick={() => setConfirmOut(false)}
            >
              Anuluj
            </Button>
            <Button
              variant="destructive"
              className="min-h-11 flex-1"
              onClick={() => {
                setConfirmOut(false);
                void signOut();
              }}
            >
              Wyloguj
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
