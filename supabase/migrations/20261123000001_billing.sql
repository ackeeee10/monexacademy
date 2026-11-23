-- =============================================================================
-- Main Quest Academy — Phase 5B: billing with Polar (Master Prompt 7.1, 7.2, 7.4)
-- Subscriptions, credit-pack orders and webhook bookkeeping. Only the server
-- (service_role, called from the Polar webhook) can change billing data.
--
-- Rules:
--   * Every webhook is recorded once by its id; repeats are skipped.
--   * Orders are unique by Polar order id, so credits are never granted twice.
--   * Plan credits (subscription bucket) expire when the next period's credits
--     arrive and when the subscription ends. Bought and earned credits stay.
--   * Yearly plans still get their credits monthly: the next grant happens the
--     first time the user's credits are read or spent after a month has passed.
--   * Trial: 15 credits once per account (Pro, 7 days, card required).
--
-- Safe for the code on `main`: only adds tables and functions, and keeps the
-- signature of spend_credits().
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null default 'polar' check (provider = 'polar'),
  provider_subscription_id text not null unique check (char_length(provider_subscription_id) <= 100),
  provider_customer_id text check (char_length(provider_customer_id) <= 100),
  product_id text not null check (char_length(product_id) <= 100),
  plan public.plan_tier not null check (plan <> 'free'),
  billing_interval text not null check (billing_interval in ('month', 'year')),
  status text not null check (char_length(status) <= 30),
  trial_end timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  ended_at timestamptz,
  trial_credits_granted boolean not null default false,
  provider_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_user_idx on public.subscriptions (user_id, created_at desc);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null default 'polar' check (provider = 'polar'),
  provider_order_id text not null unique check (char_length(provider_order_id) <= 100),
  provider_subscription_id text check (char_length(provider_subscription_id) <= 100),
  kind text not null check (kind in ('credits', 'subscription')),
  product_key text not null check (char_length(product_key) <= 40),
  credits integer not null default 0 check (credits >= 0),
  amount_cents integer not null default 0 check (amount_cents >= 0),
  currency text check (char_length(currency) <= 10),
  billing_reason text check (char_length(billing_reason) <= 40),
  status text not null check (char_length(status) <= 30),
  refunded_cents integer not null default 0 check (refunded_cents >= 0),
  refunded_credits integer not null default 0 check (refunded_credits >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_user_idx on public.orders (user_id, created_at desc);
create index orders_created_idx on public.orders (created_at desc);

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- Webhook bookkeeping (no grants: server only).
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'polar',
  provider_event_id text not null unique check (char_length(provider_event_id) <= 200),
  type text not null check (char_length(type) <= 60),
  payload jsonb not null,
  attempts integer not null default 1,
  last_error text check (char_length(last_error) <= 1000),
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.subscriptions enable row level security;
alter table public.orders enable row level security;
alter table public.webhook_events enable row level security;

create policy "users read own subscriptions" on public.subscriptions for select to authenticated
  using (user_id = auth.uid());
create policy "users read own orders" on public.orders for select to authenticated
  using (user_id = auth.uid());

grant select (id, user_id, plan, billing_interval, status, trial_end, current_period_start, current_period_end,
  cancel_at_period_end, ended_at, created_at) on public.subscriptions to authenticated;
grant select (id, user_id, kind, product_key, credits, amount_cents, currency, status, refunded_cents, created_at)
  on public.orders to authenticated;

-- -----------------------------------------------------------------------------
-- Internal helpers
-- -----------------------------------------------------------------------------
create or replace function public.subscription_is_live(p_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_status in ('trialing', 'active', 'past_due');
$$;

-- Removes all remaining plan credits, with a ledger row.
create or replace function public.expire_subscription_credits(p_user uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.credit_balances%rowtype;
  v_total integer;
begin
  select * into v_b from public.credit_balances where user_id = p_user for update;
  if not found or v_b.subscription_credits = 0 then
    return;
  end if;
  update public.credit_balances set subscription_credits = 0, updated_at = now()
  where user_id = p_user
  returning subscription_credits + purchased_credits + earned_credits into v_total;
  insert into public.credit_transactions (user_id, delta, bucket, reason, note, actor_id, balance_after)
  values (p_user, -v_b.subscription_credits, 'subscription', 'expiry', p_note, auth.uid(), v_total);
end;
$$;

-- Puts the best live subscription's plan on the profile (Elite over Pro).
create or replace function public.sync_profile_plan(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions%rowtype;
begin
  select * into v_sub from public.subscriptions
  where user_id = p_user and public.subscription_is_live(status)
  order by (plan = 'elite') desc, current_period_end desc nulls last, created_at desc
  limit 1;

  if found then
    update public.profiles set plan = v_sub.plan, plan_status = v_sub.status
    where id = p_user and (plan is distinct from v_sub.plan or plan_status is distinct from v_sub.status);
  else
    update public.profiles set plan = 'free', plan_status = null
    where id = p_user and (plan <> 'free' or plan_status is not null);
  end if;
end;
$$;

-- Swaps last period's plan credits for this period's.
create or replace function public.grant_period_credits(p_user uuid, p_plan public.plan_tier, p_related uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credits integer;
begin
  select monthly_credits into v_credits from public.plan_limits where plan = p_plan;
  perform public.expire_subscription_credits(p_user, 'New billing period');
  if coalesce(v_credits, 0) > 0 then
    perform public.grant_credits(p_user, 'subscription', v_credits, 'subscription_grant', 'subscription', p_related, p_note);
  end if;
end;
$$;

-- Yearly plans: one month of credits each month, granted lazily.
create or replace function public.refresh_subscription_credits(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions%rowtype;
  v_last timestamptz;
begin
  if p_user is null then
    return;
  end if;
  select * into v_sub from public.subscriptions
  where user_id = p_user and status = 'active' and billing_interval = 'year'
  order by (plan = 'elite') desc, current_period_end desc nulls last
  limit 1;
  if not found then
    return;
  end if;

  -- Serialize with other grants for this user.
  perform 1 from public.credit_balances where user_id = p_user for update;

  select max(created_at) into v_last from public.credit_transactions
  where user_id = p_user and reason = 'subscription_grant' and related_type = 'subscription' and related_id = v_sub.id;

  -- The first grant comes with the paid order; refresh only continues the schedule.
  if v_last is null or v_last + interval '1 month' > now() then
    return;
  end if;
  if v_sub.current_period_end is not null and now() >= v_sub.current_period_end then
    return;
  end if;
  perform public.grant_period_credits(p_user, v_sub.plan, v_sub.id, 'Monthly credits (yearly plan)');
end;
$$;

-- For the signed-in user (wallet page).
create or replace function public.refresh_my_credits()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refresh_subscription_credits(auth.uid());
end;
$$;

-- spend_credits now tops up yearly plans first. Same signature and behavior otherwise.
create or replace function public.spend_credits(
  p_user uuid, p_amount integer, p_reason public.credit_reason,
  p_related_type text, p_related_id uuid, p_note text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.credit_balances%rowtype;
  v_from_sub integer;
  v_from_pur integer;
  v_from_earn integer;
  v_total integer;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  perform public.refresh_subscription_credits(p_user);
  insert into public.credit_balances (user_id) values (p_user) on conflict (user_id) do nothing;
  select * into v_b from public.credit_balances where user_id = p_user for update;

  v_total := v_b.subscription_credits + v_b.purchased_credits + v_b.earned_credits;
  if v_total < p_amount then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  v_from_sub := least(v_b.subscription_credits, p_amount);
  v_from_pur := least(v_b.purchased_credits, p_amount - v_from_sub);
  v_from_earn := p_amount - v_from_sub - v_from_pur;

  update public.credit_balances set
    subscription_credits = subscription_credits - v_from_sub,
    purchased_credits = purchased_credits - v_from_pur,
    earned_credits = earned_credits - v_from_earn,
    updated_at = now()
  where user_id = p_user;

  if v_from_sub > 0 then
    v_total := v_total - v_from_sub;
    insert into public.credit_transactions (user_id, delta, bucket, reason, related_type, related_id, note, actor_id, balance_after)
    values (p_user, -v_from_sub, 'subscription', p_reason, p_related_type, p_related_id, p_note, auth.uid(), v_total);
  end if;
  if v_from_pur > 0 then
    v_total := v_total - v_from_pur;
    insert into public.credit_transactions (user_id, delta, bucket, reason, related_type, related_id, note, actor_id, balance_after)
    values (p_user, -v_from_pur, 'purchased', p_reason, p_related_type, p_related_id, p_note, auth.uid(), v_total);
  end if;
  if v_from_earn > 0 then
    v_total := v_total - v_from_earn;
    insert into public.credit_transactions (user_id, delta, bucket, reason, related_type, related_id, note, actor_id, balance_after)
    values (p_user, -v_from_earn, 'earned', p_reason, p_related_type, p_related_id, p_note, auth.uid(), v_total);
  end if;
  return v_total;
end;
$$;

-- -----------------------------------------------------------------------------
-- Webhook entry points (service_role only)
-- -----------------------------------------------------------------------------
-- Records a webhook delivery. Returns true when it still needs processing.
create or replace function public.billing_record_event(p_event_id text, p_type text, p_payload jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_processed timestamptz;
begin
  insert into public.webhook_events (provider_event_id, type, payload)
  values (p_event_id, p_type, p_payload)
  on conflict (provider_event_id) do update set attempts = public.webhook_events.attempts + 1
  returning processed_at into v_processed;
  return v_processed is null;
end;
$$;

create or replace function public.billing_finish_event(p_event_id text, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.webhook_events set
    processed_at = case when p_error is null then now() else processed_at end,
    last_error = left(p_error, 1000)
  where provider_event_id = p_event_id;
end;
$$;

-- Creates or updates a subscription from a Polar subscription event.
-- p_sub: id, customer_id, product_id, plan, interval, status, trial_end,
-- current_period_start, current_period_end, cancel_at_period_end, ended_at, modified_at.
create or replace function public.billing_upsert_subscription(p_user uuid, p_sub jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.subscriptions%rowtype;
  v_row public.subscriptions%rowtype;
  v_modified timestamptz := nullif(p_sub ->> 'modified_at', '')::timestamptz;
  v_status text := p_sub ->> 'status';
begin
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;

  select * into v_existing from public.subscriptions where provider_subscription_id = p_sub ->> 'id' for update;
  if found and v_existing.user_id <> p_user then
    raise exception 'subscription_owner_mismatch' using errcode = 'P0001';
  end if;
  if found and v_existing.provider_modified_at is not null and v_modified is not null
     and v_modified < v_existing.provider_modified_at then
    return 'stale';
  end if;

  insert into public.subscriptions (
    user_id, provider_subscription_id, provider_customer_id, product_id, plan, billing_interval, status,
    trial_end, current_period_start, current_period_end, cancel_at_period_end, ended_at, provider_modified_at
  ) values (
    p_user, p_sub ->> 'id', p_sub ->> 'customer_id', p_sub ->> 'product_id',
    (p_sub ->> 'plan')::public.plan_tier, p_sub ->> 'interval', v_status,
    nullif(p_sub ->> 'trial_end', '')::timestamptz,
    nullif(p_sub ->> 'current_period_start', '')::timestamptz,
    nullif(p_sub ->> 'current_period_end', '')::timestamptz,
    coalesce((p_sub ->> 'cancel_at_period_end')::boolean, false),
    nullif(p_sub ->> 'ended_at', '')::timestamptz,
    v_modified
  )
  on conflict (provider_subscription_id) do update set
    provider_customer_id = excluded.provider_customer_id,
    product_id = excluded.product_id,
    plan = excluded.plan,
    billing_interval = excluded.billing_interval,
    status = excluded.status,
    trial_end = excluded.trial_end,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    ended_at = excluded.ended_at,
    provider_modified_at = coalesce(excluded.provider_modified_at, public.subscriptions.provider_modified_at)
  returning * into v_row;

  -- Trial credits, once per account.
  if v_status = 'trialing' and not v_row.trial_credits_granted then
    update public.subscriptions set trial_credits_granted = true where id = v_row.id;
    if not (select trial_used from public.profiles where id = p_user) then
      perform public.grant_credits(p_user, 'subscription', 15, 'trial_grant', 'subscription', v_row.id, 'Pro trial');
    end if;
    update public.profiles set trial_used = true where id = p_user;
  end if;

  -- Plan credits end with the last live subscription.
  if not public.subscription_is_live(v_status)
     and not exists (select 1 from public.subscriptions where user_id = p_user and public.subscription_is_live(status)) then
    perform public.expire_subscription_credits(p_user, 'Subscription ended');
  end if;

  perform public.sync_profile_plan(p_user);
  return 'ok';
end;
$$;

-- Books a paid Polar order. p_order: id, kind, product_key, credits, plan,
-- subscription_id, amount_cents, currency, billing_reason, status.
create or replace function public.billing_apply_order(p_user uuid, p_order jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_sub_id uuid;
begin
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;

  insert into public.orders (
    user_id, provider_order_id, provider_subscription_id, kind, product_key, credits,
    amount_cents, currency, billing_reason, status
  ) values (
    p_user, p_order ->> 'id', nullif(p_order ->> 'subscription_id', ''), p_order ->> 'kind', p_order ->> 'product_key',
    coalesce((p_order ->> 'credits')::integer, 0), coalesce((p_order ->> 'amount_cents')::integer, 0),
    p_order ->> 'currency', p_order ->> 'billing_reason', coalesce(p_order ->> 'status', 'paid')
  )
  on conflict (provider_order_id) do nothing
  returning * into v_order;

  if not found then
    return 'duplicate';
  end if;

  if v_order.kind = 'credits' then
    if v_order.credits <= 0 then
      raise exception 'invalid_amount' using errcode = 'P0001';
    end if;
    perform public.grant_credits(p_user, 'purchased', v_order.credits, 'purchase', 'order', v_order.id, v_order.product_key);
    return 'ok';
  end if;

  -- Subscription orders: a new paid period brings the plan's credits.
  -- $0 orders (trial start) and mid-period plan changes don't.
  if v_order.billing_reason in ('subscription_create', 'subscription_cycle') and v_order.amount_cents > 0 then
    select id into v_sub_id from public.subscriptions where provider_subscription_id = v_order.provider_subscription_id;
    if v_sub_id is null then
      -- The subscription event hasn't arrived yet; create a placeholder it will fill in.
      insert into public.subscriptions (user_id, provider_subscription_id, product_id, plan, billing_interval, status)
      values (p_user, v_order.provider_subscription_id, coalesce(p_order ->> 'product_id', ''),
        (p_order ->> 'plan')::public.plan_tier, coalesce(p_order ->> 'interval', 'month'), 'active')
      returning id into v_sub_id;
      perform public.sync_profile_plan(p_user);
    end if;
    perform public.grant_period_credits(p_user, (p_order ->> 'plan')::public.plan_tier, v_sub_id, v_order.product_key);
  end if;
  return 'ok';
end;
$$;

-- Books a refund. Credit packs lose the refunded share of their credits
-- (as many as are still unspent in the purchased bucket).
create or replace function public.billing_apply_refund(p_order_id text, p_refunded_cents integer, p_status text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_target integer;
  v_delta integer;
  v_take integer;
  v_total integer;
begin
  select * into v_order from public.orders where provider_order_id = p_order_id for update;
  if not found then
    return 'unknown_order';
  end if;

  update public.orders set
    refunded_cents = greatest(refunded_cents, coalesce(p_refunded_cents, 0)),
    status = coalesce(p_status, status)
  where id = v_order.id;

  if v_order.kind <> 'credits' or v_order.amount_cents <= 0 then
    return 'ok';
  end if;

  v_target := least(v_order.credits,
    floor(v_order.credits::numeric * least(coalesce(p_refunded_cents, 0), v_order.amount_cents) / v_order.amount_cents)::integer);
  v_delta := v_target - v_order.refunded_credits;
  if v_delta <= 0 then
    return 'ok';
  end if;
  update public.orders set refunded_credits = v_target where id = v_order.id;

  insert into public.credit_balances (user_id) values (v_order.user_id) on conflict (user_id) do nothing;
  select least(purchased_credits, v_delta) into v_take from public.credit_balances where user_id = v_order.user_id for update;
  if v_take > 0 then
    update public.credit_balances set purchased_credits = purchased_credits - v_take, updated_at = now()
    where user_id = v_order.user_id
    returning subscription_credits + purchased_credits + earned_credits into v_total;
    insert into public.credit_transactions (user_id, delta, bucket, reason, related_type, related_id, note, balance_after)
    values (v_order.user_id, -v_take, 'purchased', 'refund', 'order', v_order.id, v_order.product_key, v_total);
  end if;
  return 'ok';
end;
$$;

-- -----------------------------------------------------------------------------
-- Billing summary for the signed-in user (wallet page)
-- -----------------------------------------------------------------------------
create or replace function public.get_my_billing()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'plan', p.plan,
    'trial_used', p.trial_used,
    'has_customer', exists (select 1 from public.orders o where o.user_id = p.id)
      or exists (select 1 from public.subscriptions s where s.user_id = p.id),
    'subscription', (
      select jsonb_build_object(
        'plan', s.plan, 'interval', s.billing_interval, 'status', s.status,
        'trial_end', s.trial_end, 'current_period_end', s.current_period_end,
        'cancel_at_period_end', s.cancel_at_period_end
      )
      from public.subscriptions s
      where s.user_id = p.id and public.subscription_is_live(s.status)
      order by (s.plan = 'elite') desc, s.current_period_end desc nulls last
      limit 1
    )
  )
  from public.profiles p
  where p.id = auth.uid();
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
revoke execute on function public.subscription_is_live(text) from public, anon, authenticated;
revoke execute on function public.expire_subscription_credits(uuid, text) from public, anon, authenticated;
revoke execute on function public.sync_profile_plan(uuid) from public, anon, authenticated;
revoke execute on function public.grant_period_credits(uuid, public.plan_tier, uuid, text) from public, anon, authenticated;
revoke execute on function public.refresh_subscription_credits(uuid) from public, anon, authenticated;
revoke execute on function public.spend_credits(uuid, integer, public.credit_reason, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.billing_record_event(text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.billing_finish_event(text, text) from public, anon, authenticated;
revoke execute on function public.billing_upsert_subscription(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.billing_apply_order(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.billing_apply_refund(text, integer, text) from public, anon, authenticated;
revoke execute on function public.refresh_my_credits() from public, anon;
revoke execute on function public.get_my_billing() from public, anon;

grant execute on function public.billing_record_event(text, text, jsonb) to service_role;
grant execute on function public.billing_finish_event(text, text) to service_role;
grant execute on function public.billing_upsert_subscription(uuid, jsonb) to service_role;
grant execute on function public.billing_apply_order(uuid, jsonb) to service_role;
grant execute on function public.billing_apply_refund(text, integer, text) to service_role;
grant execute on function public.refresh_my_credits() to authenticated;
grant execute on function public.get_my_billing() to authenticated;
