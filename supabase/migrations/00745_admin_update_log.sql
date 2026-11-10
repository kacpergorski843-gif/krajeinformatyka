-- 00745: persistent Update log for project releases and administrative changes.
create table if not exists public.app_update_log (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'admin' check (source in ('admin', 'project')),
  actor_id uuid,
  actor_label text not null default 'Administrator',
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists app_update_log_created_idx
  on public.app_update_log (created_at desc);

alter table public.app_update_log enable row level security;
drop policy if exists "admins read update log" on public.app_update_log;
create policy "admins read update log"
  on public.app_update_log for select to authenticated
  using (public.is_admin(auth.uid()));

grant select on public.app_update_log to authenticated;
revoke insert, update, delete on public.app_update_log from anon, authenticated, public;

-- Mirror existing admin audit actions into the readable Update journal.
create or replace function public.capture_admin_action_in_update_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor_label text;
begin
  -- Shop changes are captured with before/after values by the shop_items trigger below.
  if new.action in ('UPSERT_SHOP_ITEM', 'TOGGLE_SHOP_ITEM') then
    return new;
  end if;

  select coalesce(nullif(p.display_name, ''), nullif(p.email, ''), 'Administrator')
    into v_actor_label
  from public.profiles p
  where p.id = new.actor_id;

  insert into public.app_update_log(source, actor_id, actor_label, summary, details, created_at)
  values (
    'admin',
    new.actor_id,
    coalesce(v_actor_label, case when new.actor_id is null then 'System' else 'Administrator' end),
    'Operacja administracyjna: ' || new.action,
    coalesce(new.details, '{}'::jsonb),
    coalesce(new.created_at, now())
  );
  return new;
end;
$function$;

drop trigger if exists capture_admin_action_in_update_log on public.admin_actions;
create trigger capture_admin_action_in_update_log
after insert on public.admin_actions
for each row execute function public.capture_admin_action_in_update_log();

-- Capture every direct or RPC-driven shop item edit, including price changes.
create or replace function public.capture_shop_item_change_in_update_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor_label text;
  v_old jsonb := '{}'::jsonb;
  v_new jsonb := '{}'::jsonb;
  v_code text;
  v_name text;
  v_summary text;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_code := new.code;
    v_name := new.name;
    v_summary := 'Dodano produkt w sklepie: ' || new.name || ' (' || new.code || ')';
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_code := new.code;
    v_name := new.name;
    if v_old = v_new then return new; end if;
    v_summary := 'Zmieniono produkt lub ceny: ' || new.name || ' (' || new.code || ')';
  else
    v_old := to_jsonb(old);
    v_code := old.code;
    v_name := old.name;
    v_summary := 'Usunięto produkt ze sklepu: ' || old.name || ' (' || old.code || ')';
  end if;

  select coalesce(nullif(p.display_name, ''), nullif(p.email, ''), 'Administrator')
    into v_actor_label
  from public.profiles p
  where p.id = auth.uid();

  insert into public.app_update_log(source, actor_id, actor_label, summary, details)
  values (
    'admin',
    auth.uid(),
    coalesce(v_actor_label, case when auth.uid() is null then 'System / migracja' else 'Administrator' end),
    v_summary,
    jsonb_build_object(
      'table', 'shop_items',
      'operation', tg_op,
      'code', v_code,
      'product', v_name,
      'old', v_old,
      'new', v_new
    )
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

drop trigger if exists capture_shop_item_change_in_update_log on public.shop_items;
create trigger capture_shop_item_change_in_update_log
after insert or update or delete on public.shop_items
for each row execute function public.capture_shop_item_change_in_update_log();

-- Reset is available only to administrators and intentionally clears this journal only.
create or replace function public.admin_reset_update_log()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_deleted integer;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Brak uprawnień administratora';
  end if;
  delete from public.app_update_log;
  get diagnostics v_deleted = row_count;
  return jsonb_build_object('ok', true, 'deleted', v_deleted);
end;
$function$;

revoke all on function public.admin_reset_update_log() from public, anon;
grant execute on function public.admin_reset_update_log() to authenticated;

-- Record the introduction of the Update journal itself as the first project entry.
insert into public.app_update_log(source, actor_label, summary, details)
values (
  'project',
  'ChatGPT / zespół projektu',
  'Dodano dziennik Update w administracji',
  jsonb_build_object(
    'changes', jsonb_build_array(
      'Nowa zakładka Update w panelu administracyjnym',
      'Automatyczny zapis operacji administracyjnych',
      'Automatyczny zapis zmian produktów i cen z wartościami przed i po zmianie',
      'Kopiowanie dziennika oraz reset wpisów'
    )
  )
);

notify pgrst, 'reload schema';
