-- ============================================================================
-- 0041_fivem_uplink
-- Where the FiveM monitor reads from.
--
-- The game server answers Indonesian residential connections in ~30ms and
-- black-holes datacenter traffic, so the deployment cannot read it directly and
-- goes through a relay running on a machine at home (tools/fivem-uplink.mjs).
-- That relay is published on a tunnel whose hostname changes on every restart,
-- which used to mean editing FIVEM_SERVER_URL in the hosting dashboard and
-- redeploying by hand each time — and the monitor sat "Offline" until someone
-- noticed. Parking the address here instead lets the relay publish its own URL
-- on startup and the app pick it up on the next poll, with no redeploy.
--
-- Singleton, like organization_settings. Writes are service_role only: the
-- relay authenticates with the service key and no RPC exposes this to the UI,
-- so a browser can never repoint where the server makes requests.
-- ============================================================================

create table fivem_uplink (
  id          boolean primary key default true,
  endpoint    text,
  updated_at  timestamptz not null default now(),
  constraint fivem_uplink_singleton check (id),
  -- This value becomes a server-side fetch target. Constrain it to real http(s)
  -- URLs so a bad write cannot aim the proxy at another scheme.
  constraint fivem_uplink_endpoint_scheme
    check (endpoint is null or endpoint ~ '^https?://[^[:space:]]+$')
);

insert into fivem_uplink (id) values (true);

-- updated_at doubles as the relay's heartbeat: it re-publishes on a timer, and
-- an UPDATE bumps this even when the URL is unchanged. A stale timestamp means
-- the relay machine is down, which is what the monitor reports.
create trigger fivem_uplink_set_updated_at
  before update on fivem_uplink
  for each row execute function app.set_updated_at();

create trigger fivem_uplink_no_delete
  before delete on fivem_uplink
  for each row execute function app.forbid_delete();

alter table fivem_uplink enable row level security;

-- Super Admin may read it (the monitor page is Super-Admin-only). No insert /
-- update / delete policy exists, so every write is denied to authenticated and
-- anon; only service_role, which bypasses RLS, can publish.
revoke all on table fivem_uplink from authenticated, anon;
grant select on table fivem_uplink to authenticated;

create policy fivem_uplink_select on fivem_uplink
  for select to authenticated
  using (app.is_super_admin());
