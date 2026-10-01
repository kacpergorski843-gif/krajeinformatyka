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
      supabase.from("country_stats").select(COUNTRY_STATS_SELECT).order("gross_income", { ascending: false }),
    )) as unknown as CountryStats[],
});

export const shopQuery = queryOptions({
  queryKey: ["shop_items"],
  queryFn: async () =>
    (await unwrap(
      supabase.from("shop_items").select("code,name,category,description,building,cost_kr,cost_coal,cost_oil,cost_copper,cost_iron,cost_uranium,income_kr,upkeep_coal,produces,produces_amount,sort_order,active").eq("active", true).order("sort_order"),
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

export function transferRegionsQuery(countryId: string | null | undefined) {
  return queryOptions({
    queryKey: ["transfer_regions", countryId],
    enabled: !!countryId,
    queryFn: async (): Promise<Array<{ id: string; name: string; country_id: string; aa_defense: number }>> => {
      const rows = await unwrap(
        supabase.from("regions").select("id,name,country_id,aa_defense").eq("country_id", countryId!).order("created_at"),
      );
      return (rows ?? []) as Array<{ id: string; name: string; country_id: string; aa_defense: number }>;
    },
  });
}

export type RegionOccupation = {
  id: string;
  region_id: string;
  previous_country_id: string;
  current_country_id: string;
  occupied_at: string;
  event_type: "OCCUPATION" | "REVERT";
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
          .select("id, region_id, previous_country_id, current_country_id, occupied_at, event_type, regions(name)")
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
        event_type: row.event_type,
        region_name: row.regions?.name ?? "Nieznany region",
      }));
    },
  });
}

export type OccupiedRegion = RegionWithSlots & {
  occupied_at: string;
  occupier_country_id: string;
  occupier_country_name: string;
};

export type AdminActiveRegionOccupation = {
  region_id: string;
  region_name: string;
  occupier_country_id: string;
  occupier_country_name: string;
  previous_country_id: string;
  previous_country_name: string;
  occupied_at: string;
};

export function adminActiveRegionOccupationsQuery() {
  return queryOptions({
    queryKey: ["admin_active_region_occupations"],
    queryFn: async (): Promise<AdminActiveRegionOccupation[]> => {
      const rows = await unwrap(
        supabase
          .from("region_control_state")
          .select("region_id, region_name, owner_country_id, owner_country_name, controller_country_id, controller_country_name, is_occupied")
          .eq("is_occupied", true)
          .order("region_name", { ascending: true }),
      ) as Array<{
        region_id: string;
        region_name: string;
        owner_country_id: string;
        owner_country_name: string;
        controller_country_id: string;
        controller_country_name: string;
        is_occupied: boolean;
      }>;

      return rows.map((row) => ({
        region_id: row.region_id,
        region_name: row.region_name,
        occupier_country_id: row.controller_country_id,
        occupier_country_name: row.controller_country_name,
        previous_country_id: row.owner_country_id,
        previous_country_name: row.owner_country_name,
        occupied_at: "",
      }));
    },
  });
}
export function occupiedRegionsQuery(countryId: string | null | undefined) {
  return queryOptions({
    queryKey: ["occupied_regions", countryId],
    enabled: !!countryId,
    queryFn: async (): Promise<OccupiedRegion[]> => {
      const occupations = await unwrap(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("region_occupations")
          .select("region_id, current_country_id, occupied_at, event_type, regions(country_id)")
          .eq("previous_country_id", countryId!)
          .order("occupied_at", { ascending: false }),
      ) as Array<{
        region_id: string;
        current_country_id: string;
        occupied_at: string;
        event_type: "OCCUPATION" | "REVERT";
        regions?: { country_id?: string } | null;
      }>;

      const latestByRegion = new Map<string, (typeof occupations)[number]>();
      for (const occupation of occupations) {
        if (!latestByRegion.has(occupation.region_id)) latestByRegion.set(occupation.region_id, occupation);
      }
      const active = [...latestByRegion.values()].filter(
        (occupation) =>
          occupation.event_type === "OCCUPATION" &&
          occupation.current_country_id !== countryId &&
          occupation.regions?.country_id === occupation.current_country_id,
      );
      if (!active.length) return [];

      const regionIds = active.map((occupation) => occupation.region_id);
      const rows = await unwrap(
        supabase
          .from("regions")
          .select("id, name, country_id, aa_defense, region_slots(id, slot_index, building)")
          .in("id", regionIds),
      ) as unknown as RegionRow[];

      const countryIds = [...new Set(active.map((occupation) => occupation.current_country_id))];
      const countryRows = await unwrap(
        supabase.from("countries").select("id,name").in("id", countryIds),
      ) as Array<{ id: string; name: string }>;
      const names = new Map(countryRows.map((row) => [row.id, row.name]));

      const occupationByRegion = new Map(active.map((occupation) => [occupation.region_id, occupation]));
      return rows.map((row) => {
        const occupation = occupationByRegion.get(row.id)!;
        return {
          id: row.id,
          name: row.name,
          country_id: row.country_id,
          aa_defense: row.aa_defense ?? 0,
          slots: [...(row.region_slots ?? [])].sort((a, b) => a.slot_index - b.slot_index),
          occupied_at: occupation.occupied_at,
          occupier_country_id: occupation.current_country_id,
          occupier_country_name: names.get(occupation.current_country_id) ?? "Nieznane państwo",
        };
      }).sort((a, b) => new Date(b.occupied_at).getTime() - new Date(a.occupied_at).getTime());
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
              .select("id,country_id,kind,label,amount_kr,created_at,details")
              .eq("country_id", countryId)
              .order("created_at", { ascending: false })
              .limit(limit)
          : supabase
              .from("transactions")
              .select("id,country_id,kind,label,amount_kr,created_at,details")
              .order("created_at", { ascending: false })
              .limit(limit),
      ),
  });
}

export const adminUsersQuery = queryOptions({
  queryKey: ["admin_users"],
  queryFn: async () => await unwrap(supabase.rpc("admin_list_users")),
});

export type ActiveIncomeBonus = {
  id: string;
  percent: number;
  starts_at: string;
  ends_at: string;
  country_id: string | null;
  country_name: string | null;
  created_at: string;
};

export const activeIncomeBonusesQuery = queryOptions({
  queryKey: ["active_income_bonuses"],
  queryFn: async (): Promise<ActiveIncomeBonus[]> => {
    const now = new Date().toISOString();
    const rows = await unwrap(
      supabase
        .from("economy_bonuses")
        .select("id,percent,starts_at,ends_at,country_id,created_at")
        .lte("starts_at", now)
        .gt("ends_at", now)
        .order("ends_at", { ascending: true }),
    ) as Array<{
      id: string;
      percent: number;
      starts_at: string;
      ends_at: string;
      country_id: string | null;
      created_at: string;
    }>;

    const countryIds = [...new Set(rows.map((row) => row.country_id).filter((id): id is string => !!id))];
    const countryNames = new Map<string, string>();

    if (countryIds.length) {
      const countries = await unwrap(
        supabase.from("countries").select("id,name").in("id", countryIds),
      ) as Array<{ id: string; name: string }>;
      for (const country of countries) countryNames.set(country.id, country.name);
    }

    return rows.map((row) => ({
      ...row,
      country_name: row.country_id ? countryNames.get(row.country_id) ?? null : null,
    }));
  },
});

export const adminActionsQuery = queryOptions({
  queryKey: ["admin_actions"],
  queryFn: async () =>
    await unwrap(
      supabase.from("admin_actions").select("id,action,created_at,country_id,details").order("created_at", { ascending: false }).limit(50),
    ),
});

export const economyRunsQuery = queryOptions({
  queryKey: ["economy_runs"],
  queryFn: async () =>
    await unwrap(
      supabase.from("economy_runs").select("id,run_date,ran_at,summary").order("run_date", { ascending: false }).limit(14),
    ),
});

export async function rpc<T = unknown>(
  fn: string,
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
      supabase.from("shop_items").select("code,name,category,description,building,cost_kr,cost_coal,cost_oil,cost_copper,cost_iron,cost_uranium,income_kr,upkeep_coal,produces,produces_amount,sort_order,active").order("sort_order"),
    )) as unknown as ShopItem[],
});

export const allRegionOptionsQuery = queryOptions({
  queryKey: ["all_region_options"],
  queryFn: async (): Promise<Array<{ id: string; name: string; country_id: string }>> => {
    const rows = await unwrap(
      supabase.from("regions").select("id,name,country_id").order("created_at"),
    );
    return (rows ?? []) as Array<{ id: string; name: string; country_id: string }>;
  },
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
        .select("id,attacker_country_id,defender_country_id,region_id,region_name,missile_code,result,aa_defense,region_aa,required_aa,destroyed,created_at")
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

const COUNTRY_STATS_SELECT =
  "country_id,name,flag,balance,coal,oil,copper,iron,uranium,aa_defense,missile_1,missile_2,missile_3,soldier_packs,tank_packs,war_votes,fort_votes,total_votes,regions_count,gross_income,coal_upkeep,coal_prod,oil_prod,copper_prod,iron_prod,uranium_prod,forts,military_value,vote_potential,region_aa_total";

async function readCountryStats(view: "world_country_stats" | "country_stats") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from(view).select(COUNTRY_STATS_SELECT).order("name");
  if (error) throw error;
  return (data ?? []) as unknown as CountryStats[];
}

async function readCountryStatsById(view: "world_country_stats" | "country_stats", countryId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from(view)
    .select(COUNTRY_STATS_SELECT)
    .eq("country_id", countryId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as CountryStats | null;
}

async function readPublicCountryFallback(countryId?: string) {
  const query = supabase
    .from("countries")
    .select("id,name,flag,balance,coal,oil,copper,iron,uranium,aa_defense,missile_1,missile_2,missile_3,soldier_packs,tank_packs");
  const { data, error } = countryId
    ? await query.eq("id", countryId).maybeSingle()
    : await query.order("name");
  if (error) throw error;

  const rows = Array.isArray(data) ? data : data ? [data] : [];
  const ids = rows.map((row) => row.id);
  const regionCounts = new Map<string, number>();

  if (ids.length) {
    const { data: regions, error: regionsError } = await supabase.from("regions").select("country_id").in("country_id", ids);
    if (regionsError) throw regionsError;
    for (const region of regions ?? []) {
      regionCounts.set(region.country_id, (regionCounts.get(region.country_id) ?? 0) + 1);
    }
  }

  return (rows.map((row) => ({
    country_id: row.id,
    name: row.name,
    flag: row.flag,
    balance: row.balance,
    coal: row.coal,
    oil: row.oil,
    copper: row.copper,
    iron: row.iron,
    uranium: row.uranium,
    aa_defense: row.aa_defense ?? 0,
    missile_1: row.missile_1 ?? 0,
    missile_2: row.missile_2 ?? 0,
    missile_3: row.missile_3 ?? 0,
    soldier_packs: row.soldier_packs ?? 0,
    tank_packs: row.tank_packs ?? 0,
    war_votes: 0,
    fort_votes: 0,
    total_votes: 0,
    regions_count: regionCounts.get(row.id) ?? 0,
    gross_income: "0",
    coal_upkeep: "0",
    coal_prod: "0",
    oil_prod: "0",
    copper_prod: "0",
    iron_prod: "0",
    uranium_prod: "0",
    forts: 0,
    military_value: "0",
    vote_potential: 0,
    region_aa_total: 0,
  }))) as unknown as CountryStats[];
}

function isMissingRelationError(error: unknown): boolean {
  const value = error as { code?: string; message?: string } | null;
  return value?.code === "42P01" ||
    value?.code === "PGRST205" ||
    /relation .* does not exist|could not find the table|could not find the relation/i.test(value?.message ?? "");
}

export const publicCountriesQuery = queryOptions({
  queryKey: ["public_countries"],
  queryFn: async () => {
    try {
      return await readCountryStats("world_country_stats");
    } catch (error) {
      if (!isMissingRelationError(error)) throw error;
      try {
        return await readCountryStats("country_stats");
      } catch (fallbackError) {
        if (!isMissingRelationError(fallbackError)) throw fallbackError;
        return await readPublicCountryFallback();
      }
    }
  },
});

export function publicCountryQuery(countryId: string | null | undefined) {
  return queryOptions({
    queryKey: ["public_country", countryId],
    enabled: !!countryId,
    queryFn: async () => {
      try {
        return await readCountryStatsById("world_country_stats", countryId!);
      } catch (error) {
        if (!isMissingRelationError(error)) throw error;
        try {
          return await readCountryStatsById("country_stats", countryId!);
        } catch (fallbackError) {
          if (!isMissingRelationError(fallbackError)) throw fallbackError;
          const rows = await readPublicCountryFallback(countryId!);
          return rows[0] ?? null;
        }
      }
    },
  });
}

export function economyBonusQuery(countryId: string | null | undefined) {
  return queryOptions({
    queryKey: ["economy_bonus", countryId],
    enabled: !!countryId,
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("economy_bonuses")
        .select("id,percent,country_id,starts_at,ends_at")
        .lte("starts_at", now)
        .gt("ends_at", now)
        .or(`country_id.eq.${countryId},country_id.is.null`)
        .order("ends_at", { ascending: true });
      if (error) throw new Error(error.message);

      const rows = (data ?? []) as Array<{
        id: string;
        percent: number;
        country_id: string | null;
        starts_at: string;
        ends_at: string;
      }>;

      return rows.sort((a, b) => {
        const aSpecific = a.country_id === countryId ? 0 : 1;
        const bSpecific = b.country_id === countryId ? 0 : 1;
        if (aSpecific !== bSpecific) return aSpecific - bSpecific;
        return a.ends_at.localeCompare(b.ends_at);
      })[0] ?? null;
    },
  });
}
