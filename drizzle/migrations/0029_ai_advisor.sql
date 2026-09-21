create table if not exists public.ai_advisor_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  country_id uuid references public.countries(id) on delete set null,
  memory text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_advisor_memory_user_id_idx
  on public.ai_advisor_memory(user_id, created_at desc);

alter table public.ai_advisor_memory enable row level security;

drop policy if exists ai_advisor_memory_owner_read on public.ai_advisor_memory;
create policy ai_advisor_memory_owner_read
  on public.ai_advisor_memory for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists ai_advisor_memory_owner_insert on public.ai_advisor_memory;
create policy ai_advisor_memory_owner_insert
  on public.ai_advisor_memory for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists ai_advisor_memory_owner_delete on public.ai_advisor_memory;
create policy ai_advisor_memory_owner_delete
  on public.ai_advisor_memory for delete
  to authenticated
  using (user_id = auth.uid());

notify pgrst, 'reload schema';
