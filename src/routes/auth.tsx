import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Logowanie — Sztab | Country Roleplay" },
      {
        name: "description",
        content: "Zaloguj się lub utwórz konto, aby zarządzać swoim państwem w roleplayu.",
      },
      { property: "og:title", content: "Logowanie — Sztab" },
      { property: "og:description", content: "Dostęp do panelu dowodzenia państwem." },
    ],
  }),
  component: AuthPage,
});

const EMAIL_DOMAIN = "nationdynamics.internal";

function normalizeUsername(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/^[.\-_]+|[.\-_]+$/g, "");
}

function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = normalizeUsername(username);
    if (clean.length < 3) {
      toast.error("Nazwa użytkownika musi mieć co najmniej 3 znaki (litery, cyfry, . _ -)");
      return;
    }
    const email = `${clean}@${EMAIL_DOMAIN}`;
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          throw new Error(
            error.message.toLowerCase().includes("invalid login")
              ? "Nieprawidłowa nazwa użytkownika lub hasło"
              : error.message,
          );
        }
        toast.success("Zalogowano");
        router.navigate({ to: "/panstwo" });
      } else {
        const { data: taken } = await supabase.rpc("username_taken", { p_username: clean });
        if (taken) throw new Error("Ta nazwa użytkownika jest już zajęta");

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username: clean, display_name: username.trim() || clean } },
        });
        if (error) {
          const msg = error.message.toLowerCase();
          throw new Error(
            msg.includes("already registered") || msg.includes("already been registered")
              ? "Ta nazwa użytkownika jest już zajęta"
              : error.message,
          );
        }
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        toast.success("Konto utworzone");
        router.navigate({ to: "/panstwo" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nie udało się zalogować");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="panel w-full max-w-sm p-6">
        <Link to="/" className="text-primary font-display text-xs tracking-[0.3em] uppercase">
          Sztab
        </Link>
        <h1 className="mt-2 text-xl font-bold">
          {mode === "login" ? "Zaloguj się" : "Utwórz konto"}
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Dostęp do panelu państwa nadaje administrator gry.
        </p>
        <form onSubmit={submit} className="mt-5 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="username">Nazwa użytkownika</Label>
            <Input
              id="username"
              required
              minLength={3}
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Hasło</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Chwila…" : mode === "login" ? "Zaloguj" : "Zarejestruj"}
          </Button>
        </form>
        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="text-muted-foreground hover:text-foreground mt-4 w-full text-center text-xs"
        >
          {mode === "login" ? "Nie masz konta? Zarejestruj się" : "Masz już konto? Zaloguj się"}
        </button>
      </div>
    </div>
  );
}

