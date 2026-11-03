-- Extend global maintenance mode with per-page switches and editable player copy.
alter table public.app_maintenance_mode
  add column if not exists pages text[] not null default '{}',
  add column if not exists message_title text not null default 'Ekonomia jest aktualnie w remoncie',
  add column if not exists message_body text not null default 'Szykuje się aktualizacja! Po więcej informacji skontaktuj się z informatykiem.';
