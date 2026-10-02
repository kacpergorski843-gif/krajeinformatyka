import { createClient } from "@supabase/supabase-js";
import type { AuthContext } from "@lovable.dev/mcp-js";

type RuntimeGlobals = typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
  __env__?: Record<string, unknown>;
};

function runtimeEnv(name: string): string | undefined {
  const g = globalThis as RuntimeGlobals;
  const v = g.process?.env?.[name] ?? g.__env__?.[name];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function url(): string {
  return runtimeEnv("SUPABASE_URL") ?? runtimeEnv("VITE_SUPABASE_URL") ?? (import.meta.env["VITE_SUPABASE_URL"] as string);
}

function key(): string {
  return (
    runtimeEnv("SUPABASE_PUBLISHABLE_KEY") ??
    runtimeEnv("VITE_SUPABASE_PUBLISHABLE_KEY") ??
    (import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string)
  );
}

export function supabaseForUser(ctx: AuthContext) {
  const token = ctx.getToken();
  if (!token) throw new Error("Wymagane uwierzytelnienie");
  return createClient(url(), key(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
