create table if not exists public.ai_advisor_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  country_id uuid references public.countries(id) on delete set null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_advisor_conversations_user_created_idx
  on public.ai_advisor_conversations(user_id, created_at desc);

alter table public.ai_advisor_conversations enable row level security;

drop policy if exists "Users can read their own AI advisor conversations"
  on public.ai_advisor_conversations;
create policy "Users can read their own AI advisor conversations"
  on public.ai_advisor_conversations
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own AI advisor conversations"
  on public.ai_advisor_conversations;
create policy "Users can create their own AI advisor conversations"
  on public.ai_advisor_conversations
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

revoke all on table public.ai_advisor_conversations from anon;
grant select, insert on table public.ai_advisor_conversations to authenticated;

notify pgrst, 'reload schema';
