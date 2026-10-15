import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type OAuthResult = { data: any; error: { message: string } | null };

function getSafeRedirectTarget(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const target = new URL(value, window.location.origin);
    if (target.protocol !== "https:" && target.protocol !== "http:") return null;
    if (target.username || target.password) return null;
    return target.href;
  } catch {
    return null;
  }
}
const oauth = (supabase.auth as any).oauth as {
  getAuthorizationDetails: (id: string) => Promise<OAuthResult>;
  approveAuthorization: (id: string) => Promise<OAuthResult>;
  denyAuthorization: (id: string) => Promise<OAuthResult>;
};

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Autoryzacja aplikacji — Nation Dynamics" },
    { name: "description", content: "Zatwierdź dostęp zewnętrznej aplikacji do Twojego konta." },
    { property: "og:title", content: "Autoryzacja aplikacji — Nation Dynamics" },
    { property: "og:description", content: "Zatwierdź dostęp zewnętrznej aplikacji do Twojego konta." },
  ]}),
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Brak authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ href: `/auth?next=${encodeURIComponent(next)}` });
    }
  },
  loader: async ({ location }) => {
    const id = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth.getAuthorizationDetails(id);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) {
      const target = getSafeRedirectTarget(immediate);
      if (!target) throw new Error("Nieprawidłowy adres powrotu autoryzacji.");
      throw redirect({ href: target });
    }
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="flex min-h-screen items-center justify-center p-6 text-sm">
      Nie udało się wczytać żądania autoryzacji: {String((error as Error)?.message ?? error)}
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = details?.client?.name ?? "Aplikacja";

  async function decide(approve: boolean) {
    setBusy(true);
    const { data, error } = approve
      ? await oauth.approveAuthorization(authorization_id)
      : await oauth.denyAuthorization(authorization_id);
    if (error) { setBusy(false); setError(error.message); return; }
    const target = getSafeRedirectTarget(data?.redirect_url ?? data?.redirect_to);
    if (!target) { setBusy(false); setError("Nieprawidłowy adres powrotu."); return; }
    window.location.assign(target);
  }

  return (
    <main className="tactical-bg flex min-h-screen items-center justify-center px-4">
      <div className="panel w-full max-w-md space-y-4 p-6">
        <p className="label-hud">Autoryzacja</p>
        <h1 className="text-xl font-bold">Połącz {name} z Twoim kontem</h1>
        <p className="text-muted-foreground text-sm">{name} będzie mógł odczytywać dane Twojego państwa i ranking w Twoim imieniu.</p>
        {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
        <div className="flex gap-2">
          <Button disabled={busy} onClick={() => decide(true)} className="flex-1">Zezwól</Button>
          <Button disabled={busy} variant="outline" onClick={() => decide(false)} className="flex-1">Odmów</Button>
        </div>
      </div>
    </main>
  );
}
