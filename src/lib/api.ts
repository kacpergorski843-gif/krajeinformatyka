import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

async function unwrap<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>) {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}

export type CountryStats = {
  country_id: string;
  name: string;
  flag: string;
  balance: string;
  coal: string;
  oil: string;
  copper: string;
  iron: string;
  uranium: string;
  aa_defense: number;
  missile_1: number;
  missile_2: number;
  missile_3: number;
  soldier_packs: number;
  tank_packs: number;
  war_votes: number;
  fort_votes: number;
  total_votes: number;
  regions_count: number;
  gross_income: string;
  coal_upkeep: string;
  coal_prod: string;
  oil_prod: string;
  copper_prod: string;
  iron_prod: string;
  uranium_prod: string;
  forts: number;
  military_value: string;
};

export type ShopItem = {
  code: string;
  name: string;
  category: string;
  description: string;
  building: string | null;
  cost_kr: string;
  cost_coal: string;
  cost_oil: string;
  cost_copper: string;
  cost_iron: string;
  cost_uranium: string;
  income_kr: string;
  upkeep_coal: string;
  produces: string | null;
  produces_amount: string;
  sort_order: number;
};

export type Me = {
  userId: string;
  email: string | null;
  displayName: string | null;
  countryId: string | null;
  role: "PLAYER" | "ADMIN" | "MAIN_ADMIN";
  isAdmin: boolean;
  isMainAdmin: boolean;
  mainAdminExists: boolean;
};

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async (): Promise<Me | null> => {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) return null;
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, country_id")
      .eq("id", user.id)
      .maybeSingle();
    const roles = await unwrap(supabase.from("user_roles").select("role").eq("user_id", user.id));
    const mainAdmins = await unwrap(
      supabase.from("user_roles").select("id").eq("role", "MAIN_ADMIN").limit(1),
    );

    const list = (roles ?? []).map((r) => r.role as Me["role"]);
    const role: Me["role"] = list.includes("MAIN_ADMIN")
      ? "MAIN_ADMIN"
      : list.includes("ADMIN")
        ? "ADMIN"
        : "PLAYER";
    return {
      userId: user.id,
      email: user.email ?? null,
      displayName: profile?.display_name ?? null,
      countryId: profile?.country_id ?? null,
      role,
      isAdmin: role !== "PLAYER",
      isMainAdmin: role === "MAIN_ADMIN",
      mainAdminExists: (mainAdmins ?? []).length > 0,
    };
  },
});

export const countriesQuery = queryOptions({
  queryKey: ["country_stats"],
  queryFn: async () =>
    (await unwrap(
      supabase.from("country_stats").select("*").order("gross_income", { ascending: false }),
    )) as unknown as CountryStats[],
});

export const shopQuery = queryOptions({
  queryKey: ["shop_items"],
  queryFn: async () =>
    (await unwrap(
      supabase.from("shop_items").select("*").eq("active", true).order("sort_order"),
    )) as unknown as ShopItem[],
});

export type RegionWithSlots = {
  id: string;
  name: string;
  country_id: string;
  slots: { id: string; slot_index: number; building: string }[];
};

type RegionRow = {
  id: string;
  name: string;
  country_id: string;
  region_slots: RegionWithSlots["slots"] | null;
};


export function regionsQuery(countryId: string | null | undefined) {
  return queryOptions({
    queryKey: ["regions", countryId],
    enabled: !!countryId,
    queryFn: async (): Promise<RegionWithSlots[]> => {
      const rows = await unwrap(
        supabase
          .from("regions")
          .select("id, name, country_id, region_slots(id, slot_index, building)")
          .eq("country_id", countryId!)
          .order("created_at"),
      );
      return ((rows ?? []) as unknown as RegionRow[]).map((r) => ({
        id: r.id,
        name: r.name,
        country_id: r.country_id,
        slots: [...(r.region_slots ?? [])].sort((a, b) => a.slot_index - b.slot_index),
      }));

    },
  });
}

export function transactionsQuery(countryId: string | null | undefined, limit = 50) {
  return queryOptions({
    queryKey: ["transactions", countryId, limit],
    queryFn: async () =>
      await unwrap(
        countryId
          ? supabase
              .from("transactions")
              .select("*")
              .eq("country_id", countryId)
              .order("created_at", { ascending: false })
              .limit(limit)
          : supabase
              .from("transactions")
              .select("*")
              .order("created_at", { ascending: false })
              .limit(limit),
      ),
  });
}

export const adminUsersQuery = queryOptions({
  queryKey: ["admin_users"],
  queryFn: async () => await unwrap(supabase.rpc("admin_list_users")),
});

export const adminActionsQuery = queryOptions({
  queryKey: ["admin_actions"],
  queryFn: async () =>
    await unwrap(
      supabase.from("admin_actions").select("*").order("created_at", { ascending: false }).limit(50),
    ),
});

export const economyRunsQuery = queryOptions({
  queryKey: ["economy_runs"],
  queryFn: async () =>
    await unwrap(
      supabase.from("economy_runs").select("*").order("run_date", { ascending: false }).limit(14),
    ),
});

export async function rpc<T = unknown>(
  fn: Parameters<typeof supabase.rpc>[0],
  args: Record<string, unknown>,
): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}
