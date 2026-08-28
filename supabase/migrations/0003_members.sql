-- ============================================================================
-- 0003_members
-- Application member profiles, 1:1 with auth.users. Rank is metadata only.
-- ============================================================================

create table members (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references auth.users (id) on delete restrict,
  username      text not null,
  display_name  text not null,
  rank          member_rank not null default 'SOLDIER',
  role          app_role not null default 'MEMBER',
  status        member_status not null default 'ACTIVE',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint members_username_not_blank check (length(trim(username)) between 3 and 32),
  constraint members_display_name_not_blank check (length(trim(display_name)) >= 1)
);

comment on table members is 'Application profile for each auth user. INACTIVE members cannot sign in (enforced in proxy + auth predicates).';

create unique index members_username_lower_key on members (lower(username));
create index members_status_idx on members (status);
create index members_role_idx on members (role);

create trigger members_set_updated_at
  before update on members
  for each row execute function app.set_updated_at();

-- A member may edit only their own display_name. All privileged fields
-- (username, rank, role, status, user_id) require Super Admin. This backs the
-- RLS self-update policy added in 0014.
create or replace function app.guard_member_self_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if app.is_super_admin() then
    return new;
  end if;

  if new.user_id     is distinct from old.user_id
     or new.username is distinct from old.username
     or new.rank     is distinct from old.rank
     or new.role     is distinct from old.role
     or new.status   is distinct from old.status
  then
    raise exception 'Members may only change their own display name'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger members_guard_self_update
  before update on members
  for each row execute function app.guard_member_self_update();
