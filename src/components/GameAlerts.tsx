import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

function warsawHM(now = new Date()) {
  const parts = new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { h: get("hour"), m: get("minute"), day: now.toISOString().slice(0, 10) };
}

function notifyBrowser(title: string, body: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted" || !document.hidden) return;
  try { new Notification(title, { body, icon: "/favicon.ico" }); } catch { /* ignore */ }
}

/** In-game alerts: daily payout reminder/confirmation and incoming missile strikes on the player's regions. */
export function GameAlerts({ countryId }: { countryId: string | null }) {
  const queryClient = useQueryClient();
  const shown = useRef<Set<string>>(new Set());

  // Daily payout at 20:00 Europe/Warsaw
  useEffect(() => {
    const tick = () => {
      const { h, m, day } = warsawHM();
      const once = (key: string, fn: () => void) => {
        const k = `alert:${key}:${day}`;
        if (shown.current.has(k) || localStorage.getItem(k)) return;
        shown.current.add(k); localStorage.setItem(k, "1"); fn();
      };
      if (h === 19 && m >= 55) once("payout-soon", () => toast.info("Wypłata dzienna za kilka minut (20:00)."));
      if (h === 20 && m >= 10) once("payout-done", () => {
        void queryClient.invalidateQueries();
        toast.success("Wypłata dzienna została rozliczona. Sprawdź skarbiec.");
        notifyBrowser("Wypłata dzienna", "Twoje państwo otrzymało dzisiejszy dochód.");
      });
    };
    tick();
    const t = window.setInterval(tick, 30_000);
    return () => window.clearInterval(t);
  }, [queryClient]);

  // Missile strikes targeting my country
  const strikes = useQuery({
    queryKey: ["incoming_strikes", countryId],
    enabled: !!countryId,
    refetchInterval: 45_000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("missile_strikes")
        .select("id,region_name,result,created_at")
        .eq("defender_country_id", countryId!)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!countryId || !strikes.data) return;
    const key = `alert:last-strike:${countryId}`;
    const last = localStorage.getItem(key);
    const fresh = last ? strikes.data.filter((s) => s.created_at > last) : [];
    if (strikes.data[0]) localStorage.setItem(key, strikes.data[0].created_at);
    if (!fresh.length) return;
    for (const s of fresh.reverse()) {
      const hit = s.result !== "PRZECHWYCONA";
      const msg = hit ? `Atak rakietowy na region ${s.region_name} — cel zniszczony.` : `Atak rakietowy na region ${s.region_name} przechwycony przez OPL.`;
      hit ? toast.error(msg, { duration: 10_000 }) : toast.warning(msg, { duration: 8_000 });
      notifyBrowser("Atak rakietowy", msg);
    }
    void queryClient.invalidateQueries({ queryKey: ["country_stats"] });
    void queryClient.invalidateQueries({ queryKey: ["regions"] });
  }, [strikes.data, countryId, queryClient]);

  return null;
}
