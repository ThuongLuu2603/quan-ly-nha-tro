-- Cho phep dong bo khoan thu/chi (expense) len cloud.
alter table public.sync_records drop constraint if exists sync_records_entity_type_check;

alter table public.sync_records add constraint sync_records_entity_type_check check (
  entity_type in (
    'room',
    'tenancy',
    'tenant',
    'reading',
    'invoice',
    'settings',
    'expense'
  )
);
