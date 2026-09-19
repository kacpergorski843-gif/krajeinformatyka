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
  vote_potential: number;
  region_aa_total: number;
};

export type PublicRankingRow = {
  country_id: string;
  name: string;
  gross_income: string;
  vote_potential: number;
  soldier_packs: number;
  tank_packs: number;
  regions_count: number;
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
  active: boolean;
};

export type MissileStrike = {
  id: string;
  attacker_country_id: string | null;
  defender_country_id: string | null;
  region_id: string | null;
  region_name: string;
  missile_code: string;
  result: string;
  aa_defense: number;
  region_aa: number | null;
  required_aa: number | null;
  destroyed: { slot_index: number; building: string }[];
  created_at: string;
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
    const { data: mainAdminExists } = await supabase.rpc("main_admin_exists");


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
      mainAdminExists: mainAdminExists === true,
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
  aa_defense: number;
  slots: { id: string; slot_index: number; building: string }[];
};

type RegionRow = {
  id: string;
  name: string;
  country_id: string;
  aa_defense: number;
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
          .select("id, name, country_id, aa_defense, region_slots(id, slot_index, building)")
          .eq("country_id", countryId!)
          .order("created_at"),
      );
      return ((rows ?? []) as unknown as RegionRow[]).map((r) => ({
        id: r.id,
        name: r.name,
        country_id: r.country_id,
        aa_defense: r.aa_defense ?? 0,
        slots: [...(r.region_slots ?? [])].sort((a, b) => a.slot_index - b.slot_index),
      }));

    },
  });
}

export type RegionOccupation = {
  id: string;
  region_id: string;
  previous_country_id: string;
  current_country_id: string;
  occupied_at: string;
  region_name: string;
};

export function regionOccupationsQuery(countryId: string | null | undefined) {
  return queryOptions({
    queryKey: ["region_occupations", countryId],
    enabled: !!countryId,
    queryFn: async (): Promise<RegionOccupation[]> => {
      const rows = await unwrap(
        supabase
          .from("region_occupations")
          .select("id, region_id, previous_country_id, current_country_id, occupied_at, regions(name)")
          .or(`previous_country_id.eq.${countryId},current_country_id.eq.${countryId}`)
          .order("occupied_at", { ascending: false })
          .limit(50),
      );
      return ((rows ?? []) as unknown as Array<RegionOccupation & { regions?: { name?: string } | null }>).map((row) => ({
        id: row.id,
        region_id: row.region_id,
        previous_country_id: row.previous_country_id,
        current_country_id: row.current_country_id,
        occupied_at: row.occupied_at,
        region_name: row.regions?.name ?? "Nieznany region",
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

export const adminShopQuery = queryOptions({
  queryKey: ["admin_shop_items"],
  queryFn: async () =>
    (await unwrap(
      supabase.from("shop_items").select("*").order("sort_order"),
    )) as unknown as ShopItem[],
});

export const allRegionsQuery = queryOptions({
  queryKey: ["all_regions"],
  queryFn: async (): Promise<RegionWithSlots[]> => {
    const rows = await unwrap(
      supabase
        .from("regions")
        .select("id, name, country_id, aa_defense, region_slots(id, slot_index, building)")
        .order("created_at"),
    );
    return ((rows ?? []) as unknown as RegionRow[]).map((r) => ({
      id: r.id,
      name: r.name,
      country_id: r.country_id,
      aa_defense: r.aa_defense ?? 0,
      slots: [...(r.region_slots ?? [])].sort((a, b) => a.slot_index - b.slot_index),
    }));
  },
});

export const strikesQuery = queryOptions({
  queryKey: ["missile_strikes"],
  queryFn: async () =>
    (await unwrap(
      supabase
        .from("missile_strikes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
    )) as unknown as MissileStrike[],
});

export const publicRankingQuery = queryOptions({
  queryKey: ["public_ranking"],
  queryFn: async () =>
    (await unwrap(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from as any)("public_ranking").select("*"),
    )) as unknown as PublicRankingRow[],
});

export const publicCountriesQuery = queryOptions({
  queryKey: ["public_countries"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("world_country_stats")
      .select("country_id,name,flag,balance,coal,oil,copper,iron,uranium,aa_defense,missile_1,missile_2,missile_3,soldier_packs,tank_packs,war_votes,fort_votes,total_votes,regions_count,gross_income,coal_upkeep,coal_prod,oil_prod,copper_prod,iron_prod,uranium_prod,forts,military_value,vote_potential,region_aa_total")
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as CountryStats[];
  },
});

export function publicCountryQuery(countryId: string | null | undefined) {
  return queryOptions({
    queryKey: ["public_country", countryId],
    enabled: !!countryId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("world_country_stats")
        .select("country_id,name,flag,balance,coal,oil,copper,iron,uranium,aa_defense,missile_1,missile_2,missile_3,soldier_packs,tank_packs,war_votes,fort_votes,total_votes,regions_count,gross_income,coal_upkeep,coal_prod,oil_prod,copper_prod,iron_prod,uranium_prod,forts,military_value,vote_potential,region_aa_total")
        .eq("country_id", countryId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as unknown as CountryStats | null;
    },
  });
}

export const economyBonusQuery = queryOptions({
  queryKey: ["economy_bonus"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("economy_bonuses")
      .select("id,percent,starts_at,ends_at")
      .lte("starts_at", new Date().toISOString())
      .gt("ends_at", new Date().toISOString())
      .order("ends_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as { id: string; percent: number; starts_at: string; ends_at: string } | null;
  },
});
