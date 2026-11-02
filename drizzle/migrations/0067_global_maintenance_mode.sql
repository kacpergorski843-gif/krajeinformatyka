-- Global maintenance mode controlled only by the main administrator.
create table if not exists public.app_maintenance_mode (
  id smallint primary key check (id = 1),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.app_maintenance_mode (id, enabled)
values (1, false)
on conflict (id) do nothing;

alter table public.app_maintenance_mode enable row level security;

drop policy if exists "Authenticated users can read maintenance mode" on public.app_maintenance_mode;
create policy "Authenticated users can read maintenance mode"
  on public.app_maintenance_mode for select
  to authenticated
  using (auth.uid() is not null);

drop policy if exists "Main admins can insert maintenance mode" on public.app_maintenance_mode;
create policy "Main admins can insert maintenance mode"
  on public.app_maintenance_mode for insert
  to authenticated
  with check (public.has_role(auth.uid(), 'MAIN_ADMIN'));

drop policy if exists "Main admins can update maintenance mode" on public.app_maintenance_mode;
create policy "Main admins can update maintenance mode"
  on public.app_maintenance_mode for update
  to authenticated
  using (public.has_role(auth.uid(), 'MAIN_ADMIN'))
  with check (public.has_role(auth.uid(), 'MAIN_ADMIN'));

grant select, insert, update on public.app_maintenance_mode to authenticated;
