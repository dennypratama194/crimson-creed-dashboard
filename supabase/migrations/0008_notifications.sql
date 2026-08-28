-- ============================================================================
-- 0008_notifications
-- Generic notification model reused by every module (PRD §17).
-- ============================================================================

create table notifications (
  id              uuid primary key default gen_random_uuid(),
  recipient_id    uuid not null references members (id) on delete cascade,
  type            notification_type not null,
  title           text not null,
  body            text,
  reference_type  reference_type,
  reference_id    uuid,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index notifications_recipient_idx on notifications (recipient_id);
create index notifications_unread_idx on notifications (recipient_id) where read_at is null;
create index notifications_created_at_idx on notifications (created_at desc);

-- Recipients may only ever toggle read_at (see RLS update policy in 0014).
create or replace function app.guard_notification_update()
returns trigger
language plpgsql
as $$
begin
  if new.id             is distinct from old.id
     or new.recipient_id is distinct from old.recipient_id
     or new.type         is distinct from old.type
     or new.title        is distinct from old.title
     or new.body         is distinct from old.body
     or new.reference_type is distinct from old.reference_type
     or new.reference_id is distinct from old.reference_id
     or new.created_at   is distinct from old.created_at
  then
    raise exception 'Only read_at may be updated on a notification'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger notifications_guard_update
  before update on notifications
  for each row execute function app.guard_notification_update();
