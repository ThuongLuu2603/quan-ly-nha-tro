-- Chay file nay trong Supabase SQL Editor (Dashboard > SQL > New query).
-- Tao bang dong bo va bat Row Level Security: moi user chi thay data cua minh.

create table if not exists public.sync_records (
  user_id uuid not null references auth.users (id) on delete cascade,
  entity_type text not null check (
    entity_type in (
      'room',
      'tenancy',
      'tenant',
      'reading',
      'invoice',
      'settings'
    )
  ),
  entity_id text not null,
  payload jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, entity_type, entity_id)
);

create index if not exists sync_records_updated_at_idx
  on public.sync_records (user_id, updated_at);

alter table public.sync_records enable row level security;

create policy "sync_records_select_own"
  on public.sync_records
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "sync_records_insert_own"
  on public.sync_records
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "sync_records_update_own"
  on public.sync_records
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "sync_records_delete_own"
  on public.sync_records
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Cho phep API doc bang (neu project chua bat tu dong).
grant select, insert, update, delete on public.sync_records to authenticated;

-- Bat realtime de may khac nhan thay doi gan nhu ngay lap tuc.
alter publication supabase_realtime add table public.sync_records;
