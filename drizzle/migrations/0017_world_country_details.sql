-- Make the World directory independent from invoker RLS on the country_stats view.
-- The World screen is intentionally read-only; expose only the same public country
-- statistics already used by the UI, without granting write access.
create or replace view public.world_country_stats
with (security_invoker = false) as
select
  country_id,
  name,
  flag,
  balance,
  coal,
  oil,
  copper,
  iron,
  uranium,
  aa_defense,
  missile_1,
  missile_2,
  missile_3,
  soldier_packs,
  tank_packs,
  war_votes,
  fort_votes,
  total_votes,
  regions_count,
  gross_income,
  coal_upkeep,
  coal_prod,
  oil_prod,
  copper_prod,
  iron_prod,
  uranium_prod,
  forts,
  military_value,
  vote_potential,
  region_aa_total
from public.country_stats;

grant select on public.world_country_stats to authenticated;
