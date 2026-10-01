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

const EMAIL_DOMAIN = "nationdynamics.internal";

function normalizeUsername(raw: string) { return raw.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}._-]/gu, "").replace(/^[.\-_]+|[.\-_]+$/g, ""); }

function AuthPage() {
  const router = useRouter();
  const initialMode = typeof window !== "undefined" && window.location.search.includes("mode=signup") ? "signup" : "login";
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [showPassword, setShowPassword] = useState(false); const [busy, setBusy] = useState(false); const usernameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { usernameRef.current?.focus(); }, [mode]);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); const clean = normalizeUsername(username); if (clean.length < 3) { toast.error("Nazwa użytkownika musi mieć co najmniej 3 znaki (litery, cyfry, . _ -)"); usernameRef.current?.focus(); return; }
    const email = `${clean}@${EMAIL_DOMAIN}`; setBusy(true);
    try {
      if (mode === "login") { const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) throw new Error(error.message.toLowerCase().includes("invalid login") ? "Nieprawidłowa nazwa użytkownika lub hasło" : error.message); toast.success("Zalogowano"); router.navigate({ to: "/panstwo" }); }
      else { const { data: taken } = await supabase.rpc("username_taken", { p_username: clean }); if (taken) throw new Error("Ta nazwa użytkownika jest już zajęta"); const { error } = await supabase.auth.signUp({ email, password, options: { data: { username: clean, display_name: username.trim() || clean } } }); if (error) { const msg = error.message.toLowerCase(); throw new Error(msg.includes("already registered") || msg.includes("already been registered") ? "Ta nazwa użytkownika jest już zajęta" : error.message); } const { error: signInError } = await supabase.auth.signInWithPassword({ email, password }); if (signInError) throw signInError; toast.success("Konto utworzone"); router.navigate({ to: "/panstwo" }); }
    } catch (err) { toast.error(err instanceof Error ? err.message : "Nie udało się wykonać operacji"); } finally { setBusy(false); }
  }
  const isLogin = mode === "login";
  return <div className="auth-screen tactical-bg flex min-h-screen items-center justify-center px-4 py-6 sm:px-6"><div className="auth-portal"><section className="auth-context"><Link to="/" className="auth-back"><ArrowLeft className="size-4" /> Strona główna</Link><div><div className="brand-block"><div className="brand-mark"><ShieldCheck className="size-5" /></div><div><p className="font-display text-sm font-bold">KRAJE INFORMATYKA</p><p className="label-hud">System strategiczny</p></div></div><h1>Bezpieczny dostęp do centrum dowodzenia.</h1><p>Zarządzaj gospodarką, regionami i obroną państwa w jednym spójnym środowisku.</p></div><div className="auth-context-status"><span /><div><strong>System aktywny</strong><small>Uwierzytelnianie chronione</small></div></div></section><section className="auth-form-area"><div className="auth-form"><p className="label-hud text-primary">{isLogin ? "DOSTĘP DO PLATFORMY" : "REJESTRACJA DOWÓDCY"}</p><h2>{isLogin ? "Zaloguj się" : "Utwórz konto"}</h2><p className="auth-form-copy">{isLogin ? "Wprowadź dane, aby przejść do swojego państwa." : "Wybierz nazwę użytkownika i rozpocznij rozgrywkę."}</p><form onSubmit={submit} className="mt-8 space-y-5"><div className="space-y-2"><Label htmlFor="username">Nazwa użytkownika</Label><Input ref={usernameRef} id="username" required minLength={3} autoComplete="username" spellCheck={false} autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="np. informatyk" disabled={busy} /><p className="text-muted-foreground text-[11px]">Litery, cyfry oraz znaki . _ -</p></div><div className="space-y-2"><Label htmlFor="password">Hasło</Label><div className="relative"><Input id="password" type={showPassword ? "text" : "password"} required minLength={6} autoComplete={isLogin ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} className="pr-11" disabled={busy} /><button type="button" onClick={() => setShowPassword((value) => !value)} disabled={busy} aria-label={showPassword ? "Ukryj hasło" : "Pokaż hasło"} className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-11 items-center justify-center">{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div>{!isLogin && <p className="text-muted-foreground text-[11px]">Minimum 6 znaków.</p>}</div><Button type="submit" disabled={busy} size="lg" className="min-h-12 w-full font-semibold">{busy ? <><span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />{isLogin ? "Logowanie…" : "Tworzenie…"}</> : <>{isLogin ? <LogIn /> : <UserPlus />}{isLogin ? "Zaloguj się" : "Utwórz konto"}</>}</Button></form><button type="button" onClick={() => setMode(isLogin ? "signup" : "login")} disabled={busy} className="auth-switch">{isLogin ? "Nie masz konta? Utwórz je" : "Masz już konto? Zaloguj się"}</button><div className="auth-security"><LockKeyhole className="size-4" /><span>Bezpieczne uwierzytelnianie</span></div></div></section></div></div>;
}
