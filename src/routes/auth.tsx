import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { Eye, EyeOff, ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
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
    e.preventDefault(); const formData = new FormData(e.currentTarget); const enteredUsername = String(formData.get("username") ?? username); const enteredPassword = String(formData.get("password") ?? password); setUsername(enteredUsername); setPassword(enteredPassword); const clean = normalizeUsername(enteredUsername); if (clean.length < 3) { toast.error("Nazwa użytkownika musi mieć co najmniej 3 znaki (litery, cyfry, . _ -)"); usernameRef.current?.focus(); return; }
    const email = `${clean}@${EMAIL_DOMAIN}`; const legacyEmail = `${clean}@${LEGACY_EMAIL_DOMAIN}`; setBusy(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      if (mode === "login") {
        let { error } = await supabase.auth.signInWithPassword({ email, password: enteredPassword });
        if (error) {
          const legacy = await supabase.auth.signInWithPassword({ email: legacyEmail, password: enteredPassword });
          error = legacy.error;
        }
        if (error) throw new Error(error.message.toLowerCase().includes("invalid login") ? "Nieprawidłowa nazwa użytkownika lub hasło" : error.message);
        const { claimCurrentDevice } = await import("@/lib/deviceBinding");
        await claimCurrentDevice(supabase);
        toast.success("Zalogowano");
        goNext();
      } else {
        const { data: taken } = await supabase.rpc("username_taken", { p_username: clean });
        if (taken) throw new Error("Ta nazwa użytkownika jest już zajęta");
        const { error } = await supabase.auth.signUp({
          email,
          password: enteredPassword,
          options: { data: { username: clean, display_name: enteredUsername.trim() || clean } },
        });
        if (error) {
          const msg = error.message.toLowerCase();
          throw new Error(msg.includes("already registered") || msg.includes("already been registered") ? "Ta nazwa użytkownika jest już zajęta" : error.message);
        }
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: enteredPassword });
        if (signInError) throw signInError;
        const { claimCurrentDevice } = await import("@/lib/deviceBinding");
        await claimCurrentDevice(supabase);
        toast.success("Konto utworzone");
        goNext();
      }
    } catch (err) { toast.error(err instanceof Error ? err.message : "Nie udało się wykonać operacji"); } finally { setBusy(false); }
  }
  const isLogin = mode === "login";
  return <div className="auth-screen tactical-bg flex min-h-screen items-center justify-center px-4 py-8 sm:px-6"><div className="w-full max-w-sm"><div className="mb-10 text-center"><h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">KRAJE INFORMATYKA</h1></div><Link to="/" aria-label="Strona główna" className="text-muted-foreground hover:text-primary mb-5 inline-flex size-8 items-center justify-center transition-colors"><ArrowLeft className="size-4" /></Link><form onSubmit={submit} autoComplete="on" className="space-y-5"><label htmlFor="username" className="sr-only">Nazwa użytkownika</label><Input ref={usernameRef} id="username" name="username" type="text" required minLength={3} autoComplete="username" autoCorrect="off" autoCapitalize="none" inputMode="text" enterKeyHint="next" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Nazwa użytkownika" aria-label="Nazwa użytkownika" disabled={busy} className="h-12 rounded-none border-0 border-b border-border bg-transparent px-0 shadow-none focus-visible:ring-0 focus-visible:border-primary" /><div className="relative"><label htmlFor="password" className="sr-only">Hasło</label><Input id="password" name="password" type={showPassword ? "text" : "password"} required minLength={6} autoComplete={isLogin ? "current-password" : "new-password"} autoCorrect="off" autoCapitalize="none" spellCheck={false} enterKeyHint="go" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 rounded-none border-0 border-b border-border bg-transparent px-0 pr-11 shadow-none focus-visible:ring-0 focus-visible:border-primary" placeholder="Hasło" aria-label="Hasło" disabled={busy} /><button type="button" onClick={() => setShowPassword((value) => !value)} disabled={busy} aria-label={showPassword ? "Ukryj hasło" : "Pokaż hasło"} className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-10 items-center justify-center transition-colors">{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div><Button type="submit" disabled={busy} className="min-h-12 w-full rounded-lg font-semibold tracking-[0.08em] uppercase">{busy ? (isLogin ? "Logowanie…" : "Tworzenie…") : (isLogin ? "Zaloguj się" : "Utwórz konto")}</Button></form><button type="button" onClick={() => setMode(isLogin ? "signup" : "login")} disabled={busy} className="text-muted-foreground hover:text-foreground mt-5 min-h-10 w-full text-center text-sm transition-colors disabled:opacity-50">{isLogin ? "Utwórz konto" : "Zaloguj się"}</button></div></div>;
}
