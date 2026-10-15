import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { Eye, EyeOff, ArrowLeft, LockKeyhole, UserPlus, LogIn, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [
    { title: "Logowanie — Kraje Informatyka" },
    { name: "description", content: "Zaloguj się lub utwórz konto, aby przejąć dowodzenie nad swoim państwem." },
    { property: "og:title", content: "Kraje Informatyka — panel dowodzenia" },
    { property: "og:description", content: "Wejdź do panelu dowodzenia swojego państwa." },
  ]}),
  component: AuthPage,
});

const EMAIL_DOMAIN = "kbcofzdboyzgsquvtzfq.supabase.co";
const LEGACY_EMAIL_DOMAIN = "nationdynamics.internal";

function normalizeUsername(raw: string) { return raw.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "-").replace(/^[.\-_]+|[.\-_]+$/g, ""); }

function AuthPage() {
  const router = useRouter();
  const initialMode = typeof window !== "undefined" && window.location.search.includes("mode=signup") ? "signup" : "login";
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [showPassword, setShowPassword] = useState(false); const [busy, setBusy] = useState(false); const usernameRef = useRef<HTMLInputElement>(null);
  const [ready, setReady] = useState(false); useEffect(() => { setReady(true); }, []); useEffect(() => { usernameRef.current?.focus(); }, [mode]);
  function goNext() {
    const next = new URLSearchParams(window.location.search).get("next");
    if (
      next &&
      next.startsWith("/") &&
      !next.startsWith("//") &&
      !next.startsWith("/\\") &&
      !/[\u0000-\u001f\u007f]/.test(next)
    ) {
      try {
        const target = new URL(next, window.location.origin);
        if (target.origin === window.location.origin) {
          window.location.replace(target.href);
          return;
        }
      } catch {
        // Fall back to the default route for malformed targets.
      }
    }
    router.navigate({ to: "/panstwo" });
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); const clean = normalizeUsername(username); if (clean.length < 3) { toast.error("Nazwa użytkownika musi mieć co najmniej 3 znaki (litery, cyfry, . _ -)"); usernameRef.current?.focus(); return; }
    const email = `${clean}@${EMAIL_DOMAIN}`; const legacyEmail = `${clean}@${LEGACY_EMAIL_DOMAIN}`; setBusy(true);
    try {
      if (mode === "login") { let { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) { const legacy = await supabase.auth.signInWithPassword({ email: legacyEmail, password }); error = legacy.error; } if (error) throw new Error(error.message.toLowerCase().includes("invalid login") ? "Nieprawidłowa nazwa użytkownika lub hasło" : error.message); toast.success("Zalogowano"); goNext(); }
      else { const { data: taken } = await supabase.rpc("username_taken", { p_username: clean }); if (taken) throw new Error("Ta nazwa użytkownika jest już zajęta"); const { error } = await supabase.auth.signUp({ email, password, options: { data: { username: clean, display_name: username.trim() || clean } } }); if (error) { const msg = error.message.toLowerCase(); throw new Error(msg.includes("already registered") || msg.includes("already been registered") ? "Ta nazwa użytkownika jest już zajęta" : error.message); } const { error: signInError } = await supabase.auth.signInWithPassword({ email, password }); if (signInError) throw signInError; toast.success("Konto utworzone"); goNext(); }
    } catch (err) { toast.error(err instanceof Error ? err.message : "Nie udało się wykonać operacji"); } finally { setBusy(false); }
  }
  const isLogin = mode === "login";
  return <div className="auth-screen tactical-bg relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8 sm:px-6 sm:py-12"><div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] [background-size:42px_42px]" /><div className="relative grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[1fr_420px]"><section className="hidden lg:block"><Link to="/" className="text-muted-foreground mb-8 inline-flex items-center gap-2 text-xs transition-colors hover:text-primary"><ArrowLeft className="size-3.5" /> Strona główna</Link><p className="text-primary font-display text-xs font-semibold tracking-[0.35em] uppercase">Kraje Informatyka</p><h1 className="mt-4 max-w-xl text-5xl font-bold leading-[1.05] tracking-tight">Przejmij dowodzenie.</h1><p className="text-muted-foreground mt-5 max-w-lg text-sm leading-6">Zarządzaj gospodarką, rozwijaj regiony, buduj potencjał militarny i walcz o pozycję w rankingu.</p><div className="mt-8 grid max-w-lg gap-3 sm:grid-cols-3">{[["01","Gospodarka","Rozwijaj dochód"],["02","Państwo","Zarządzaj regionami"],["03","Arsenał","Broń swoich granic"]].map(([number,title,text]) => <div key={number} className="panel hud-frame p-4"><p className="text-primary font-display text-[10px] tracking-[0.2em]">{number}</p><p className="mt-3 text-xs font-semibold">{title}</p><p className="text-muted-foreground mt-1 text-[11px] leading-4">{text}</p></div>)}</div></section><div className="auth-card panel w-full overflow-hidden p-0 shadow-2xl"><div className="auth-card-top flex items-center justify-between"><div className="flex items-center gap-3"><div className="brand-mark"><span className="font-display text-sm font-bold">KI</span></div><div><p className="label-hud">KRAJE INFORMATYKA</p><p className="font-display text-sm font-semibold">Panel dowodzenia</p></div></div><div className="text-primary/80 rounded-full border border-primary/20 p-2">{isLogin ? <LogIn className="size-4" /> : <UserPlus className="size-4" />}</div></div><div className="p-5 sm:p-7"><Link to="/" className="text-muted-foreground inline-flex min-h-9 items-center gap-1.5 text-xs transition-colors hover:text-primary lg:hidden"><ArrowLeft className="size-3.5" /> Strona główna</Link><div className="mt-3 lg:mt-0"><p className="text-primary font-display text-[10px] font-semibold tracking-[0.22em] uppercase">{isLogin ? "Dostęp autoryzowany" : "Nowe państwo"}</p><h2 className="mt-2 text-2xl font-bold tracking-tight">{isLogin ? "Witaj ponownie." : "Utwórz swoje państwo."}</h2><p className="text-muted-foreground mt-2 text-xs leading-5">{isLogin ? "Zaloguj się, aby wrócić do panelu dowodzenia." : "Wybierz nazwę użytkownika i rozpocznij swoją kampanię."}</p></div><form onSubmit={submit} className="mt-6 space-y-4"><div className="space-y-1.5"><Label htmlFor="username">Nazwa użytkownika</Label><Input ref={usernameRef} id="username" required minLength={3} autoComplete="username" spellCheck={false} autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="np. informatyk" disabled={busy} /><p className="text-muted-foreground text-[10px] leading-4">Używane znaki: litery, cyfry, <span className="font-mono">. _ -</span></p></div><div className="space-y-1.5"><Label htmlFor="password">Hasło</Label><div className="relative"><Input id="password" type={showPassword ? "text" : "password"} required minLength={6} autoComplete={isLogin ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} className="pr-11" disabled={busy} /><button type="button" onClick={() => setShowPassword((value) => !value)} disabled={busy} aria-label={showPassword ? "Ukryj hasło" : "Pokaż hasło"} className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-11 items-center justify-center transition-colors">{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div>{!isLogin && <p className="text-muted-foreground text-[10px] leading-4">Minimum 6 znaków.</p>}</div><Button type="submit" disabled={busy || !ready} className="min-h-12 w-full gap-2 font-semibold tracking-[0.08em] uppercase">{!ready ? "Ładowanie…" : busy ? <><span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />{isLogin ? "Logowanie…" : "Tworzenie…"}</> : <>{isLogin ? <LogIn className="size-4" /> : <UserPlus className="size-4" />}{isLogin ? "Zaloguj się" : "Utwórz konto"}</>}</Button></form><button type="button" onClick={() => setMode(isLogin ? "signup" : "login")} disabled={busy} className="text-muted-foreground hover:text-foreground mt-3 min-h-11 w-full rounded-lg text-center text-sm transition-colors disabled:opacity-50">{isLogin ? "Nie masz konta? Utwórz je" : "Masz już konto? Zaloguj się"}</button><div className="text-muted-foreground mt-5 flex items-center justify-center gap-2 border-t pt-4 text-[10px]"><ShieldCheck className="size-3.5 text-primary" />Dane logowania są obsługiwane przez bezpieczne uwierzytelnianie.<LockKeyhole className="size-3.5" /></div></div></div></div></div>;
}
