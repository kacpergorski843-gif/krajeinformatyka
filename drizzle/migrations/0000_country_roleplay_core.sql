-- ROLES ---------------------------------------------------------------
create type public.app_role as enum ('PLAYER','ADMIN','MAIN_ADMIN');
create type public.building_type as enum (
  'factory_1','factory_2','factory_3','factory_4','factory_5',
  'mine_coal','mine_oil','mine_copper','mine_iron','mine_uranium',
  'fort_1','fort_2','fort_3'
);

create table public.countries (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  flag text not null default '🏳️',
  balance numeric(30,0) not null default 1500000000000,
  coal numeric(30,0) not null default 0,
  oil numeric(30,0) not null default 0,
  copper numeric(30,0) not null default 0,
  iron numeric(30,0) not null default 0,
  uranium numeric(30,0) not null default 0,
  aa_defense integer not null default 0,
  missile_1 integer not null default 0,
  missile_2 integer not null default 0,
  missile_3 integer not null default 0,
  soldier_packs integer not null default 0,
  tank_packs integer not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.countries to authenticated;
grant all on public.countries to service_role;
alter table public.countries enable row level security;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  country_id uuid references public.countries(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create table public.regions (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.countries(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
grant select on public.regions to authenticated;
grant all on public.regions to service_role;
alter table public.regions enable row level security;

create table public.region_slots (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.regions(id) on delete cascade,
  slot_index smallint not null check (slot_index between 1 and 9),
  building public.building_type not null,
  created_at timestamptz not null default now(),
  unique (region_id, slot_index)
);
grant select on public.region_slots to authenticated;
grant all on public.region_slots to service_role;
alter table public.region_slots enable row level security;

create table public.shop_items (
  code text primary key,
  name text not null,
  category text not null,
  description text not null default '',
  building public.building_type,
  cost_kr numeric(30,0) not null default 0,
  cost_coal numeric(30,0) not null default 0,
  cost_oil numeric(30,0) not null default 0,
  cost_copper numeric(30,0) not null default 0,
  cost_iron numeric(30,0) not null default 0,
  cost_uranium numeric(30,0) not null default 0,
  income_kr numeric(30,0) not null default 0,
  upkeep_coal numeric(30,0) not null default 0,
  produces text,
  produces_amount numeric(30,0) not null default 0,
  sort_order integer not null default 0,
  active boolean not null default true
);
grant select on public.shop_items to authenticated;
grant all on public.shop_items to service_role;
alter table public.shop_items enable row level security;

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  country_id uuid references public.countries(id) on delete cascade,
  kind text not null,
  label text not null,
  amount_kr numeric(30,0) not null default 0,
  details jsonb not null default '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz not null default now()
);
create index transactions_country_idx on public.transactions(country_id, created_at desc);
grant select on public.transactions to authenticated;
grant all on public.transactions to service_role;
alter table public.transactions enable row level security;

create table public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  country_id uuid references public.countries(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select on public.admin_actions to authenticated;
grant all on public.admin_actions to service_role;
alter table public.admin_actions enable row level security;

create table public.economy_runs (
  id uuid primary key default gen_random_uuid(),
  run_date date not null unique,
  ran_at timestamptz not null default now(),
  triggered_by uuid,
  summary jsonb not null default '{}'::jsonb
);
grant select on public.economy_runs to authenticated;
grant all on public.economy_runs to service_role;
alter table public.economy_runs enable row level security;

-- HELPERS -------------------------------------------------------------
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;

create or replace function public.is_admin(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('ADMIN','MAIN_ADMIN'));
$$;

create or replace function public.my_country_id()
returns uuid language sql stable security definer set search_path = public as $$
  select country_id from public.profiles where id = auth.uid();
$$;

-- POLICIES ------------------------------------------------------------
create policy "countries readable" on public.countries for select to authenticated using (true);
create policy "regions readable" on public.regions for select to authenticated using (true);
create policy "slots readable" on public.region_slots for select to authenticated using (true);
create policy "shop readable" on public.shop_items for select to authenticated using (true);
create policy "runs readable" on public.economy_runs for select to authenticated using (true);
create policy "tx readable" on public.transactions for select to authenticated
  using (public.is_admin(auth.uid()) or country_id = public.my_country_id());
create policy "admin actions readable" on public.admin_actions for select to authenticated
  using (public.is_admin(auth.uid()));
create policy "profiles self or admin" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin(auth.uid()));
create policy "profiles update self name" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "roles self or admin" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

-- SIGNUP TRIGGER ------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'PLAYER')
  on conflict do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();
