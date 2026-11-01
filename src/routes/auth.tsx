import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { Eye, EyeOff, ArrowLeft, UserPlus, LogIn, ShieldCheck, Landmark } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { mode?: "signup" | "login" } => ({
    mode: search.mode === "signup" ? "signup" : "login",
  }),
  head: () => ({ meta: [
    { title: "Logowanie — Kraje Informatyka" },
    { name: "description", content: "Zaloguj się lub utwórz konto, aby przejąć dowodzenie nad swoim państwem." },
    { property: "og:title", content: "Kraje Informatyka — panel dowodzenia" },
    { property: "og:description", content: "Wejdź do panelu dowodzenia swojego państwa." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: AuthPage,
});

const EMAIL_DOMAIN = "kbcofzdboyzgsquvtzfq.supabase.co";
const LEGACY_EMAIL_DOMAIN = "nationdynamics.internal";

function normalizeUsername(raw: string) { return raw.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "-").replace(/^[.\-_]+|[.\-_]+$/g, ""); }

function AuthPage() {
  const router = useRouter();
  const search = Route.useSearch();
  const [mode, setMode] = useState<"login" | "signup">(search.mode ?? "login");
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
  return <div className="auth-screen flex min-h-screen items-center justify-center px-4 py-8 sm:px-8 sm:py-16">
    <div className="auth-layout">
      <section className="auth-intro">
        <Link to="/" className="mb-10 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="size-4" />Strona główna</Link>
        <div className="brand-block"><span className="brand-mark"><Landmark className="size-5" /></span><span className="brand-name">KRAJE INFORMATYKA</span></div>
        <h1>Wracaj do swoich<br />wielkich planów.</h1>
        <p>Gospodarka, regiony i przyszłość Twojego państwa. Wszystko zaczyna się od Twoich decyzji.</p>
      </section>
      <div className="auth-card panel overflow-hidden p-0">
        <div className="auth-card-top flex items-center gap-3">
          <span className="brand-mark"><Landmark className="size-5" /></span>
          <div><p className="brand-name">KRAJE INFORMATYKA</p><p className="brand-caption">Panel państwa</p></div>
        </div>
        <div className="auth-card-body">
          <Link to="/" className="mb-5 inline-flex min-h-9 items-center gap-2 text-xs text-muted-foreground hover:text-primary lg:hidden"><ArrowLeft className="size-4" />Strona główna</Link>
          <p className="label-hud text-primary">{isLogin ? "Logowanie" : "Rejestracja"}</p>
          <h2 className="font-display font-semibold">{isLogin ? "Witaj ponownie" : "Utwórz konto"}</h2>
          <p className="mt-3 text-sm text-muted-foreground">{isLogin ? "Zaloguj się do swojego państwa." : "Wybierz nazwę i rozpocznij rozgrywkę."}</p>
          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2"><Label htmlFor="username">Nazwa użytkownika</Label>
              <Input ref={usernameRef} id="username" required minLength={3} autoComplete="username" spellCheck={false} autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="np. informatyk" disabled={busy} />
              <p className="text-xs text-muted-foreground">Litery, cyfry oraz . _ -</p>
            </div>
            <div className="space-y-2"><Label htmlFor="password">Hasło</Label>
              <div className="relative"><Input id="password" type={showPassword ? "text" : "password"} required minLength={6} autoComplete={isLogin ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} className="pr-12" disabled={busy} />
                <Button type="button" variant="ghost" size="icon" onClick={() => setShowPassword((value) => !value)} disabled={busy} aria-label={showPassword ? "Ukryj hasło" : "Pokaż hasło"} className="absolute inset-y-0 right-0 text-muted-foreground">{showPassword ? <EyeOff /> : <Eye />}</Button>
              </div>
              {!isLogin && <p className="text-xs text-muted-foreground">Minimum 6 znaków.</p>}
            </div>
            <Button type="submit" size="lg" disabled={busy || !ready} className="w-full">{!ready ? "Ładowanie…" : busy ? <><span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />{isLogin ? "Logowanie…" : "Tworzenie…"}</> : <>{isLogin ? <LogIn /> : <UserPlus />}{isLogin ? "Zaloguj się" : "Utwórz konto"}</>}</Button>
          </form>
          <Button type="button" variant="ghost" onClick={() => setMode(isLogin ? "signup" : "login")} disabled={busy} className="mt-3 w-full text-muted-foreground">{isLogin ? "Nie masz konta? Zarejestruj się" : "Masz już konto? Zaloguj się"}</Button>
          <div className="mt-6 flex items-center justify-center gap-2 border-t border-border pt-5 text-xs text-muted-foreground"><ShieldCheck className="size-4 text-primary" />Bezpieczne logowanie</div>
        </div>
      </div>
    </div>
  </div>;
}
