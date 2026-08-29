-- ============================================================================
-- 0026_cash_rpc
-- Atomic SECURITY DEFINER writes for the Company Cash module. The balance and
-- every entry's balance_after are computed here — never trusted from the client.
-- Every write leaves an audit + activity row.
--
-- app.post_cash_entry() is the single insertion point. Later phases wire the
-- automatic order-revenue and payroll-expense hooks by calling it directly with
-- source 'ORDER' / 'PAYROLL_RUN'; nothing calls those paths yet.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- app.post_cash_entry  (internal) — move the balance and append one entry
-- ---------------------------------------------------------------------------
create or replace function app.post_cash_entry(
  p_direction        cash_direction,
  p_amount           numeric,
  p_category         cash_category,
  p_source           cash_entry_source,
  p_created_by       uuid,
  p_occurred_at      timestamptz default null,
  p_note             text default null,
  p_reference_type   reference_type default null,
  p_reference_id     uuid default null,
  p_reverses_entry_id uuid default null,
  p_allow_negative   boolean default false
)
returns cash_entries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_delta   numeric(14, 2);
  v_balance numeric(14, 2);
  v_entry   cash_entries;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter an amount greater than zero' using errcode = 'check_violation';
  end if;
  if p_amount > 999999999999 then
    raise exception 'That amount is too large' using errcode = 'check_violation';
  end if;

  v_delta := case when p_direction = 'IN' then p_amount else -p_amount end;

  select balance into v_balance from cash_account where id = true for update;
  v_balance := v_balance + v_delta;

  if v_balance < 0 and not coalesce(p_allow_negative, false) then
    raise exception 'That expense is more than the % on hand', to_char(v_balance - v_delta, 'FM999999999999.00')
      using errcode = 'check_violation';
  end if;

  insert into cash_entries (
    direction, amount, category, source, balance_after,
    reference_type, reference_id, reverses_entry_id, note, occurred_at, created_by
  )
  values (
    p_direction, p_amount, p_category, p_source, v_balance,
    p_reference_type, p_reference_id, p_reverses_entry_id,
    nullif(btrim(p_note), ''), coalesce(p_occurred_at, now()), p_created_by
  )
  returning * into v_entry;

  update cash_account set balance = v_balance where id = true;

  return v_entry;
end;
$$;

-- ---------------------------------------------------------------------------
-- record_cash_entry  (Super Admin) — record income or an expense by hand
-- ---------------------------------------------------------------------------
create or replace function public.record_cash_entry(
  p_direction      cash_direction,
  p_amount         numeric,
  p_category       cash_category,
  p_occurred_at    timestamptz default null,
  p_note           text default null,
  p_allow_negative boolean default false
)
returns cash_entries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := app.current_member_id();
  v_entry cash_entries;
begin
  perform app.require_super_admin();

  if p_direction is null then
    raise exception 'Choose income or expense' using errcode = 'check_violation';
  end if;
  if p_category is null then
    raise exception 'Choose a category' using errcode = 'check_violation';
  end if;
  if app.cash_category_direction(p_category) <> p_direction then
    raise exception 'That category does not belong to a % entry', lower(p_direction::text)
      using errcode = 'check_violation';
  end if;
  if p_occurred_at is not null and p_occurred_at > now() + interval '1 day' then
    raise exception 'The date cannot be in the future' using errcode = 'check_violation';
  end if;

  -- positional: (direction, amount, category, source, created_by,
  --              occurred_at, note, ref_type, ref_id, reverses_id, allow_negative)
  v_entry := app.post_cash_entry(
    p_direction, p_amount, p_category, 'MANUAL', v_actor,
    p_occurred_at, p_note, null, null, null, coalesce(p_allow_negative, false)
  );

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (
    v_actor, 'cash.recorded',
    format('%s %s recorded (%s) — balance %s',
           initcap(v_entry.direction::text), v_entry.amount,
           lower(replace(v_entry.category::text, '_', ' ')), v_entry.balance_after),
    'CASH_ENTRY', v_entry.id
  );

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values (v_actor, 'CASH_ENTRY_RECORDED', 'cash_entry', v_entry.id, to_jsonb(v_entry));

  return v_entry;
end;
$$;

-- ---------------------------------------------------------------------------
-- reverse_cash_entry  (Super Admin) — cancel an earlier entry with an offset
-- ---------------------------------------------------------------------------
create or replace function public.reverse_cash_entry(
  p_entry_id uuid,
  p_reason   text
)
returns cash_entries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor    uuid := app.current_member_id();
  v_original cash_entries;
  v_opposite cash_direction;
  v_reversal cash_entries;
begin
  perform app.require_super_admin();

  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required' using errcode = 'check_violation';
  end if;

  select * into v_original from cash_entries where id = p_entry_id;
  if not found then
    raise exception 'Cash entry not found' using errcode = 'no_data_found';
  end if;
  if v_original.reverses_entry_id is not null then
    raise exception 'A reversal entry cannot itself be reversed' using errcode = 'check_violation';
  end if;
  if exists (select 1 from cash_entries where reverses_entry_id = p_entry_id) then
    raise exception 'This entry has already been reversed' using errcode = 'check_violation';
  end if;

  v_opposite := case when v_original.direction = 'IN' then 'OUT' else 'IN' end::cash_direction;

  -- A correction always posts, even if it briefly takes the balance negative.
  v_reversal := app.post_cash_entry(
    v_opposite, v_original.amount, v_original.category, 'ADJUSTMENT', v_actor,
    now(), format('Reversal of %s — %s', v_original.entry_number, btrim(p_reason)),
    'CASH_ENTRY', v_original.id, v_original.id, true
  );

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (
    v_actor, 'cash.reversed',
    format('Reversed %s (%s %s) — balance %s',
           v_original.entry_number, initcap(v_original.direction::text),
           v_original.amount, v_reversal.balance_after),
    'CASH_ENTRY', v_reversal.id
  );

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (
    v_actor, 'CASH_ENTRY_REVERSED', 'cash_entry', v_original.id,
    to_jsonb(v_original), jsonb_build_object('reversal_entry_id', v_reversal.id, 'reason', btrim(p_reason))
  );

  return v_reversal;
end;
$$;

-- ---------------------------------------------------------------------------
-- grants
-- ---------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'record_cash_entry(cash_direction, numeric, cash_category, timestamptz, text, boolean)',
    'reverse_cash_entry(uuid, text)'
  ]
  loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end;
$$;

revoke all on function app.post_cash_entry(
  cash_direction, numeric, cash_category, cash_entry_source, uuid,
  timestamptz, text, reference_type, uuid, uuid, boolean
) from public, anon, authenticated;
