-- ============================================================================
-- 0025_cash
-- Company Cash — a single treasury with an append-only ledger.
--
--   cash_account  : one row, materialized running balance (like `inventory`).
--   cash_entries  : immutable ledger. Income (IN) and expense (OUT) lines.
--                   Corrections are REVERSING entries, never edits/deletes
--                   (same rule as audit_logs / order_items).
--
-- Every write goes through the SECURITY DEFINER RPCs in 0026. No direct
-- INSERT/UPDATE grants for application users. The balance and each entry's
-- balance_after are computed server-side — never trusted from the browser.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- category <-> direction map (single source of truth in the DB)
-- ---------------------------------------------------------------------------
create or replace function app.cash_category_direction(p_category cash_category)
returns cash_direction
language sql
immutable
as $$
  select case p_category
    when 'SALES_REVENUE'     then 'IN'
    when 'CAPITAL_INJECTION' then 'IN'
    when 'OTHER_INCOME'      then 'IN'
    else 'OUT'
  end::cash_direction;
$$;

-- ---------------------------------------------------------------------------
-- cash_account  (singleton)
-- ---------------------------------------------------------------------------
create table cash_account (
  id          boolean primary key default true,
  balance     numeric(14, 2) not null default 0,
  updated_at  timestamptz not null default now(),
  constraint cash_account_singleton check (id)
);

insert into cash_account (id) values (true);

create trigger cash_account_set_updated_at
  before update on cash_account
  for each row execute function app.set_updated_at();

create trigger cash_account_no_delete
  before delete on cash_account
  for each row execute function app.forbid_delete();

-- ---------------------------------------------------------------------------
-- cash_entries  (append-only ledger)
-- ---------------------------------------------------------------------------
create sequence cash_entry_number_seq start 1001;

create table cash_entries (
  id              uuid primary key default gen_random_uuid(),
  entry_number    text not null unique
                    default 'CE-' || lpad(nextval('cash_entry_number_seq')::text, 6, '0'),
  direction       cash_direction not null,
  amount          numeric(14, 2) not null check (amount > 0),
  category        cash_category not null,
  source          cash_entry_source not null default 'MANUAL',
  balance_after   numeric(14, 2) not null,
  reference_type  reference_type,
  reference_id    uuid,
  reverses_entry_id uuid references cash_entries (id) on delete restrict,
  note            text,
  occurred_at     timestamptz not null default now(),
  handled_by      uuid references members (id) on delete set null,
  created_by      uuid references members (id) on delete set null,
  created_at      timestamptz not null default now()
);

comment on table cash_entries is 'Append-only. A correction is a new reversing entry (source ADJUSTMENT), never an edit.';
comment on column cash_entries.balance_after is 'Treasury balance immediately after this entry was posted. Computed server-side.';
comment on column cash_entries.reverses_entry_id is 'Set on a reversal entry; points at the entry it cancels out.';
comment on column cash_entries.handled_by is 'The Super Admin this entry is attributed to (who handled the money). Set by the recorder; null on auto-posted entries.';

-- One reversal per entry, at most.
create unique index cash_entries_one_reversal
  on cash_entries (reverses_entry_id)
  where reverses_entry_id is not null;

create index cash_entries_occurred_at_idx on cash_entries (occurred_at desc);
create index cash_entries_created_at_idx on cash_entries (created_at desc);
create index cash_entries_direction_idx on cash_entries (direction);
create index cash_entries_category_idx on cash_entries (category);
create index cash_entries_source_idx on cash_entries (source);
create index cash_entries_handled_by_idx on cash_entries (handled_by);
create index cash_entries_reference_idx on cash_entries (reference_type, reference_id);

create trigger cash_entries_no_change
  before update or delete on cash_entries
  for each row execute function app.reject_mutation();
