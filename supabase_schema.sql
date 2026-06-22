-- ============================================================
--  SAKU Journal — Supabase schema
--  Run this in Supabase  ->  SQL Editor  ->  New query  ->  Run
-- ============================================================

-- One row per user. The whole journal (trades, sheets, notes, pairs)
-- is stored as a single JSONB blob, keyed to the logged-in user.
create table if not exists public.journals (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Row Level Security: each user can only read/write their OWN row.
alter table public.journals enable row level security;

drop policy if exists "journal_select_own" on public.journals;
create policy "journal_select_own" on public.journals
  for select using (auth.uid() = user_id);

drop policy if exists "journal_insert_own" on public.journals;
create policy "journal_insert_own" on public.journals
  for insert with check (auth.uid() = user_id);

drop policy if exists "journal_update_own" on public.journals;
create policy "journal_update_own" on public.journals
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "journal_delete_own" on public.journals;
create policy "journal_delete_own" on public.journals
  for delete using (auth.uid() = user_id);
