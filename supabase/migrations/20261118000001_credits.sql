-- =============================================================================
-- MONEX Academy — Phase 5A: credits (Master Prompt 7.2, 7.3, 7.5, 7.6)
-- Credit ledger, atomic spend/grant, signup bonus, idea unlocks with the 50%
-- creator share, post limits per plan, featured ideas, admin adjustments.
-- Payments (Lemon Squeezy) arrive in Phase 5B and only call grant functions.
--
-- Rules:
--   * A balance never changes without a credit_transactions row.
--   * All spending goes through public.spend_credits(), which locks the
--     balance row, so concurrent clicks can't take it below zero.
--   * Spending order: subscription credits, then purchased, then earned.
--   * Creator share = floor(price / 2); the rest stays with the platform.
--
-- The site on `main` keeps working after this migration: save_idea(uuid, jsonb,
-- boolean) still exists and now also enforces post limits.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
create type public.credit_bucket as enum ('subscription', 'purchased', 'earned');
create type public.credit_reason as enum (
  'signup_bonus', 'subscription_grant', 'trial_grant', 'purchase',
  'unlock_idea', 'first_message', 'job_apply', 'extra_post', 'feature_post',
  'lesson_purchase', 'creator_earning', 'admin_adjustment', 'refund', 'expiry'
);

-- -----------------------------------------------------------------------------
-- Prices and plan limits (admin can change them without code changes)
-- -----------------------------------------------------------------------------
create table public.credit_prices (
  action text primary key check (action ~ '^[a-z_]{2,40}$'),
  credits integer not null check (credits between 0 and 100000),
  updated_at timestamptz not null default now()
);

insert into public.credit_prices (action, credits) values
  ('unlock_idea', 5),
  ('first_message', 3),
  ('job_apply', 2),
  ('extra_post', 5),
  ('feature_post', 20)
on conflict (action) do nothing;

create table public.plan_limits (
  plan public.plan_tier primary key,
  -- Free posts per period; null = unlimited.
  free_posts integer check (free_posts is null or free_posts >= 0),
  -- 'never' = lifetime allowance (Free), 'monthly' = resets each calendar month.
  posts_reset text not null check (posts_reset in ('never', 'monthly')),
  featured_per_month integer not null default 0 check (featured_per_month >= 0),
  monthly_credits integer not null default 0 check (monthly_credits >= 0)
);

insert into public.plan_limits (plan, free_posts, posts_reset, featured_per_month, monthly_credits) values
  ('free', 2, 'never', 0, 0),
  ('pro', 10, 'monthly', 1, 60),
  ('elite', null, 'monthly', 5, 200)
on conflict (plan) do nothing;

create or replace function public.credit_price(p_action text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select credits from public.credit_prices where action = p_action), 0);
$$;

-- -----------------------------------------------------------------------------
-- Ledger
-- -----------------------------------------------------------------------------
create table public.credit_balances (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  subscription_credits integer not null default 0 check (subscription_credits >= 0),
  purchased_credits integer not null default 0 check (purchased_credits >= 0),
  earned_credits integer not null default 0 check (earned_credits >= 0),
  updated_at timestamptz not null default now()
);

create table public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  delta integer not null check (delta <> 0),
  bucket public.credit_bucket not null,
  reason public.credit_reason not null,
  related_type text check (char_length(related_type) <= 30),
  related_id uuid,
  note text check (char_length(note) <= 500),
  actor_id uuid references public.profiles (id) on delete set null,
  balance_after integer not null check (balance_after >= 0),
  -- clock_timestamp keeps the order of several rows written in one transaction.
  created_at timestamptz not null default clock_timestamp()
);

create index credit_transactions_user_idx on public.credit_transactions (user_id, created_at desc);
create index credit_transactions_reason_idx on public.credit_transactions (reason, created_at desc);

-- Featured activations (plan quota vs paid), for monthly quota counting.
create table public.feature_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  idea_id uuid not null references public.ideas (id) on delete cascade,
  paid boolean not null,
  created_at timestamptz not null default now()
);

create index feature_events_user_idx on public.feature_events (user_id, created_at desc);

-- Which submissions counted as a "post" against the plan, and whether it was paid.
alter table public.ideas add column post_counted_at timestamptz;
alter table public.ideas add column post_paid boolean not null default false;

alter table public.credit_prices enable row level security;
alter table public.plan_limits enable row level security;
alter table public.credit_balances enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.feature_events enable row level security;

create policy "prices are public" on public.credit_prices for select using (true);
create policy "plan limits are public" on public.plan_limits for select using (true);
create policy "users read own balance" on public.credit_balances for select to authenticated
  using (user_id = (select auth.uid()));
create policy "users read own transactions" on public.credit_transactions for select to authenticated
  using (user_id = (select auth.uid()));

grant select on public.credit_prices, public.plan_limits to anon, authenticated;
grant select on public.credit_balances, public.credit_transactions to authenticated;
-- feature_events: no grants. Balances and transactions: read-only for the owner.

-- Internal: add credits to one bucket and record it. Returns the new total.
create or replace function public.grant_credits(
  p_user uuid, p_bucket public.credit_bucket, p_amount integer, p_reason public.credit_reason,
  p_related_type text, p_related_id uuid, p_note text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.credit_balances%rowtype;
  v_total integer;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  insert into public.credit_balances (user_id) values (p_user) on conflict (user_id) do nothing;
  select * into v_b from public.credit_balances where user_id = p_user for update;

  update public.credit_balances set
    subscription_credits = subscription_credits + case when p_bucket = 'subscription' then p_amount else 0 end,
    purchased_credits = purchased_credits + case when p_bucket = 'purchased' then p_amount else 0 end,
    earned_credits = earned_credits + case when p_bucket = 'earned' then p_amount else 0 end,
    updated_at = now()
  where user_id = p_user
  returning subscription_credits + purchased_credits + earned_credits into v_total;

  insert into public.credit_transactions (user_id, delta, bucket, reason, related_type, related_id, note, actor_id, balance_after)
  values (p_user, p_amount, p_bucket, p_reason, p_related_type, p_related_id, p_note, auth.uid(), v_total);
  return v_total;
end;
$$;

-- Internal: spend credits (subscription -> purchased -> earned). Returns the new total.
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

  -- One ledger row per bucket touched, with the running total after each.
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

create or replace function public.credit_total(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select subscription_credits + purchased_credits + earned_credits
    from public.credit_balances where user_id = p_user
  ), 0);
$$;

-- -----------------------------------------------------------------------------
-- Signup bonus: 10 credits once per account (Free plan, Master Prompt 7.2)
-- -----------------------------------------------------------------------------
create or replace function public.grant_signup_bonus()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.grant_credits(new.id, 'purchased', 10, 'signup_bonus', null, null, null);
  return null;
end;
$$;

create trigger profiles_signup_bonus
  after insert on public.profiles
  for each row execute function public.grant_signup_bonus();

-- Existing accounts get the bonus once.
do $$
declare
  r record;
begin
  for r in
    select p.id from public.profiles p
    where not exists (select 1 from public.credit_transactions t where t.user_id = p.id and t.reason = 'signup_bonus')
  loop
    perform public.grant_credits(r.id, 'purchased', 10, 'signup_bonus', null, null, 'Granted at launch of credits');
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Post limits
-- -----------------------------------------------------------------------------
-- Credits the next counted post would cost this user (0 = within the plan's free posts).
create or replace function public.post_cost(p_user uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limits public.plan_limits%rowtype;
  v_used integer;
begin
  select l.* into v_limits
  from public.plan_limits l
  join public.profiles p on p.plan = l.plan
  where p.id = p_user;

  if not found or v_limits.free_posts is null then
    return 0;
  end if;

  select count(*) into v_used
  from public.ideas
  where author_id = p_user
    and post_counted_at is not null
    and post_paid = false
    and (v_limits.posts_reset = 'never' or post_counted_at >= date_trunc('month', now()));

  return case when v_used < v_limits.free_posts then 0 else public.credit_price('extra_post') end;
end;
$$;

-- save_idea, now with post limits. The first submission of an idea counts as a
-- post; resubmitting after "changes requested" does not count again.
-- Over the plan's free posts, submitting needs p_pay_extra = true (the user
-- agreed to pay) and enough credits; otherwise 'post_limit_reached'.
create or replace function public.save_idea(p_id uuid, p_data jsonb, p_submit boolean, p_pay_extra boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_existing public.ideas%rowtype;
  v_trusted boolean;
  v_status public.idea_status;
  v_plan jsonb := coalesce(p_data -> 'launch_plan', '[]'::jsonb);
  v_checklist jsonb;
  v_id uuid;
  v_counts boolean := false;
  v_cost integer := 0;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  if not public.is_visible_profile(v_uid) then
    raise exception 'profile_not_ready' using errcode = 'P0001';
  end if;

  if p_id is not null then
    select * into v_existing from public.ideas where id = p_id for update;
    if not found or v_existing.author_id is distinct from v_uid then
      raise exception 'idea_not_found' using errcode = 'P0001';
    end if;
    if v_existing.status = 'approved' or v_existing.status = 'hidden' then
      raise exception 'idea_locked' using errcode = 'P0001';
    end if;
  end if;

  if p_submit and (p_id is null or v_existing.post_counted_at is null) then
    v_counts := true;
    v_cost := public.post_cost(v_uid);
    if v_cost > 0 and not coalesce(p_pay_extra, false) then
      raise exception 'post_limit_reached' using errcode = 'P0001', detail = v_cost::text;
    end if;
  end if;

  select trust_level = 'trusted' into v_trusted from public.profiles where id = v_uid;
  v_status := case
    when not p_submit then 'draft'::public.idea_status
    when coalesce(v_trusted, false) then 'approved'::public.idea_status
    else 'pending'::public.idea_status
  end;

  v_checklist := case
    when jsonb_array_length(coalesce(p_data -> 'checklist', '[]'::jsonb)) > 0 then p_data -> 'checklist'
    else v_plan
  end;

  if p_id is null then
    insert into public.ideas (
      author_id, slug, title, short_description, category_id, investment_range,
      earning_min, earning_max, difficulty, time_to_first_income, work_mode, team_mode,
      looking_for_roles, launch_plan, market_analysis, risks, source, status
    ) values (
      v_uid,
      public.slugify(p_data ->> 'title') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6),
      p_data ->> 'title',
      p_data ->> 'short_description',
      (p_data ->> 'category_id')::uuid,
      (p_data ->> 'investment_range')::public.budget_range,
      (p_data ->> 'earning_min')::integer,
      (p_data ->> 'earning_max')::integer,
      (p_data ->> 'difficulty')::public.idea_difficulty,
      (p_data ->> 'time_to_first_income')::public.time_to_income,
      (p_data ->> 'work_mode')::public.work_preference,
      (p_data ->> 'team_mode')::public.team_mode,
      coalesce(array(select jsonb_array_elements_text(coalesce(p_data -> 'looking_for_roles', '[]'::jsonb))), '{}'),
      v_plan,
      nullif(p_data ->> 'market_analysis', ''),
      nullif(p_data ->> 'risks', ''),
      'user',
      v_status
    )
    returning id into v_id;
  else
    update public.ideas set
      title = p_data ->> 'title',
      short_description = p_data ->> 'short_description',
      category_id = (p_data ->> 'category_id')::uuid,
      investment_range = (p_data ->> 'investment_range')::public.budget_range,
      earning_min = (p_data ->> 'earning_min')::integer,
      earning_max = (p_data ->> 'earning_max')::integer,
      difficulty = (p_data ->> 'difficulty')::public.idea_difficulty,
      time_to_first_income = (p_data ->> 'time_to_first_income')::public.time_to_income,
      work_mode = (p_data ->> 'work_mode')::public.work_preference,
      team_mode = (p_data ->> 'team_mode')::public.team_mode,
      looking_for_roles = coalesce(array(select jsonb_array_elements_text(coalesce(p_data -> 'looking_for_roles', '[]'::jsonb))), '{}'),
      launch_plan = v_plan,
      market_analysis = nullif(p_data ->> 'market_analysis', ''),
      risks = nullif(p_data ->> 'risks', ''),
      status = v_status,
      moderation_note = null
    where id = p_id
    returning id into v_id;
  end if;

  if v_counts then
    update public.ideas set post_counted_at = now(), post_paid = v_cost > 0 where id = v_id;
    if v_cost > 0 then
      perform public.spend_credits(v_uid, v_cost, 'extra_post', 'idea', v_id, null);
    end if;
  end if;

  delete from public.idea_skills where idea_id = v_id;
  insert into public.idea_skills (idea_id, skill_id)
  select v_id, s::uuid
  from jsonb_array_elements_text(coalesce(p_data -> 'skill_ids', '[]'::jsonb)) s
  on conflict do nothing;

  delete from public.idea_checklist_items where idea_id = v_id;
  insert into public.idea_checklist_items (idea_id, position, text)
  select v_id, (x.ord - 1)::integer, x.val
  from jsonb_array_elements_text(v_checklist) with ordinality as x(val, ord);

  return v_id;
end;
$$;

-- Old 3-argument version (used by the live site until it is updated):
-- same rules, never pays for an extra post.
create or replace function public.save_idea(p_id uuid, p_data jsonb, p_submit boolean)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.save_idea(p_id, p_data, p_submit, false);
$$;

-- -----------------------------------------------------------------------------
-- Unlocking an idea (5 credits; 50% to the author, rounded down)
-- p_max_cost protects the user from a price change between seeing and clicking.
-- -----------------------------------------------------------------------------
create or replace function public.unlock_idea(p_idea_id uuid, p_max_cost integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_idea public.ideas%rowtype;
  v_price integer := public.credit_price('unlock_idea');
  v_share integer;
  v_total integer;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  if not public.is_visible_profile(v_uid) then
    raise exception 'profile_not_ready' using errcode = 'P0001';
  end if;

  select * into v_idea from public.ideas
  where id = p_idea_id
    and status = 'approved'
    and (author_id is null or public.is_visible_profile(author_id))
  for update;
  if not found then
    raise exception 'idea_not_found' using errcode = 'P0001';
  end if;
  if v_idea.author_id = v_uid
     or exists (select 1 from public.idea_unlocks where idea_id = p_idea_id and user_id = v_uid) then
    return jsonb_build_object('status', 'already', 'balance', public.credit_total(v_uid));
  end if;
  if p_max_cost is null or v_price > p_max_cost then
    raise exception 'price_changed' using errcode = 'P0001';
  end if;

  if v_price > 0 then
    v_total := public.spend_credits(v_uid, v_price, 'unlock_idea', 'idea', p_idea_id, null);
  else
    v_total := public.credit_total(v_uid);
  end if;

  insert into public.idea_unlocks (user_id, idea_id) values (v_uid, p_idea_id);
  update public.ideas set unlocks_count = unlocks_count + 1 where id = p_idea_id;

  v_share := floor(v_price / 2.0)::integer;
  if v_idea.author_id is not null and v_share > 0 then
    perform public.grant_credits(v_idea.author_id, 'earned', v_share, 'creator_earning', 'idea', p_idea_id, null);
  end if;

  return jsonb_build_object('status', 'unlocked', 'balance', v_total);
end;
$$;

-- -----------------------------------------------------------------------------
-- Featuring an idea for 7 days (plan quota first, then 20 credits)
-- -----------------------------------------------------------------------------
create or replace function public.feature_cost(p_user uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_quota integer;
  v_used integer;
begin
  select l.featured_per_month into v_quota
  from public.plan_limits l join public.profiles p on p.plan = l.plan
  where p.id = p_user;
  select count(*) into v_used from public.feature_events
  where user_id = p_user and paid = false and created_at >= date_trunc('month', now());
  return case when v_used < coalesce(v_quota, 0) then 0 else public.credit_price('feature_post') end;
end;
$$;

create or replace function public.feature_idea(p_idea_id uuid, p_max_cost integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_idea public.ideas%rowtype;
  v_cost integer;
  v_until timestamptz;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  select * into v_idea from public.ideas where id = p_idea_id for update;
  if not found or v_idea.author_id is distinct from v_uid or v_idea.status <> 'approved' then
    raise exception 'idea_not_found' using errcode = 'P0001';
  end if;

  v_cost := public.feature_cost(v_uid);
  if p_max_cost is null or v_cost > p_max_cost then
    raise exception 'price_changed' using errcode = 'P0001';
  end if;
  if v_cost > 0 then
    perform public.spend_credits(v_uid, v_cost, 'feature_post', 'idea', p_idea_id, null);
  end if;

  insert into public.feature_events (user_id, idea_id, paid) values (v_uid, p_idea_id, v_cost > 0);
  v_until := greatest(coalesce(v_idea.is_featured_until, now()), now()) + interval '7 days';
  update public.ideas set is_featured_until = v_until where id = p_idea_id;

  return jsonb_build_object('featured_until', v_until, 'cost', v_cost, 'balance', public.credit_total(v_uid));
end;
$$;

-- -----------------------------------------------------------------------------
-- Wallet for the signed-in user
-- -----------------------------------------------------------------------------
create or replace function public.get_my_wallet(p_limit integer, p_offset integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_plan public.plan_tier;
  v_limits public.plan_limits%rowtype;
  v_posts_used integer;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  select plan into v_plan from public.profiles where id = v_uid;
  select * into v_limits from public.plan_limits where plan = v_plan;
  select count(*) into v_posts_used from public.ideas
  where author_id = v_uid and post_counted_at is not null and post_paid = false
    and (v_limits.posts_reset = 'never' or post_counted_at >= date_trunc('month', now()));

  return jsonb_build_object(
    'plan', v_plan,
    'balances', coalesce((
      select jsonb_build_object('subscription', subscription_credits, 'purchased', purchased_credits, 'earned', earned_credits)
      from public.credit_balances where user_id = v_uid
    ), jsonb_build_object('subscription', 0, 'purchased', 0, 'earned', 0)),
    'total', public.credit_total(v_uid),
    'prices', coalesce((select jsonb_object_agg(action, credits) from public.credit_prices), '{}'::jsonb),
    'posts', jsonb_build_object(
      'free_posts', v_limits.free_posts,
      'reset', v_limits.posts_reset,
      'used', v_posts_used,
      'next_cost', public.post_cost(v_uid)
    ),
    'featured', jsonb_build_object(
      'quota', v_limits.featured_per_month,
      'next_cost', public.feature_cost(v_uid)
    ),
    'transactions_total', (select count(*) from public.credit_transactions where user_id = v_uid),
    'transactions', coalesce((
      select jsonb_agg(s.item order by s.created_at desc, s.id)
      from (
        select t.created_at, t.id, jsonb_build_object(
          'id', t.id, 'delta', t.delta, 'bucket', t.bucket, 'reason', t.reason,
          'related_type', t.related_type, 'related_id', t.related_id,
          'related_title', case when t.related_type = 'idea' then (select title from public.ideas where id = t.related_id) end,
          'related_slug', case when t.related_type = 'idea' then (select slug from public.ideas where id = t.related_id and status = 'approved') end,
          'note', t.note, 'balance_after', t.balance_after, 'created_at', t.created_at
        ) as item
        from public.credit_transactions t
        where t.user_id = v_uid
        order by t.created_at desc, t.id
        limit v_limit offset v_offset
      ) s
    ), '[]'::jsonb)
  );
end;
$$;

-- Current account, now with the credit total (shown in the header).
create or replace function public.get_my_account()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'email', u.email,
    'username', p.username,
    'avatar_url', p.avatar_url,
    'bio', p.bio,
    'experience', p.experience,
    'country', p.country,
    'city', p.city,
    'availability_hours', p.availability_hours,
    'looking_for', to_jsonb(p.looking_for),
    'intents', to_jsonb(p.intents),
    'role', p.role,
    'trust_level', p.trust_level,
    'plan', p.plan,
    'is_blocked', p.is_blocked,
    'age_check_required', p.age_check_required,
    'deleted_at', p.deleted_at,
    'onboarding_completed', p.onboarding_completed,
    'birth_date', pp.birth_date,
    'terms_accepted_at', pp.terms_accepted_at,
    'has_password', coalesce(u.encrypted_password, '') <> '',
    'credits', public.credit_total(p.id),
    'created_at', p.created_at
  )
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.profiles_private pp on pp.id = p.id
  where p.id = auth.uid();
$$;

-- -----------------------------------------------------------------------------
-- Admin
-- -----------------------------------------------------------------------------
-- Add (positive) or remove (negative) credits, with a required reason.
create or replace function public.admin_adjust_credits(p_user uuid, p_amount integer, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_total integer;
begin
  perform public.require_admin();
  if v_reason is null then
    raise exception 'note_required' using errcode = 'P0001';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'note_too_long' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 100000 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;

  if p_amount > 0 then
    v_total := public.grant_credits(p_user, 'purchased', p_amount, 'admin_adjustment', null, null, v_reason);
  else
    v_total := public.spend_credits(p_user, -p_amount, 'admin_adjustment', null, null, v_reason);
  end if;

  perform public.log_action('credits.adjust', 'profile', p_user, jsonb_build_object('amount', p_amount, 'reason', v_reason));
  return v_total;
end;
$$;

create or replace function public.admin_get_user_credits(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'balances', coalesce((
      select jsonb_build_object('subscription', subscription_credits, 'purchased', purchased_credits, 'earned', earned_credits)
      from public.credit_balances where user_id = p_user
    ), jsonb_build_object('subscription', 0, 'purchased', 0, 'earned', 0)),
    'total', public.credit_total(p_user),
    'transactions', coalesce((
      select jsonb_agg(s.item order by s.created_at desc)
      from (
        select t.created_at, jsonb_build_object(
          'delta', t.delta, 'bucket', t.bucket, 'reason', t.reason, 'note', t.note,
          'balance_after', t.balance_after, 'created_at', t.created_at
        ) as item
        from public.credit_transactions t where t.user_id = p_user
        order by t.created_at desc limit 20
      ) s
    ), '[]'::jsonb)
  );
end;
$$;

-- Credit movement by reason over the last p_days days, plus credits in circulation.
create or replace function public.admin_credit_stats(p_days integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 3650));
begin
  perform public.require_admin();
  return jsonb_build_object(
    'by_reason', coalesce((
      select jsonb_agg(jsonb_build_object('reason', reason, 'granted', granted, 'spent', spent, 'count', n) order by reason)
      from (
        select reason,
          coalesce(sum(delta) filter (where delta > 0), 0) as granted,
          coalesce(-sum(delta) filter (where delta < 0), 0) as spent,
          count(*) as n
        from public.credit_transactions
        where created_at >= v_since
        group by reason
      ) x
    ), '[]'::jsonb),
    'in_circulation', (
      select jsonb_build_object(
        'subscription', coalesce(sum(subscription_credits), 0),
        'purchased', coalesce(sum(purchased_credits), 0),
        'earned', coalesce(sum(earned_credits), 0)
      ) from public.credit_balances
    ),
    'unlocks', (select count(*) from public.idea_unlocks where created_at >= v_since),
    'featured', (select count(*) from public.feature_events where created_at >= v_since)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Function permissions
-- -----------------------------------------------------------------------------
revoke execute on function public.credit_price(text) from public, anon, authenticated;
revoke execute on function public.grant_credits(uuid, public.credit_bucket, integer, public.credit_reason, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.spend_credits(uuid, integer, public.credit_reason, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.credit_total(uuid) from public, anon, authenticated;
revoke execute on function public.grant_signup_bonus() from public, anon, authenticated;
revoke execute on function public.post_cost(uuid) from public, anon, authenticated;
revoke execute on function public.feature_cost(uuid) from public, anon, authenticated;
revoke execute on function public.save_idea(uuid, jsonb, boolean, boolean) from public, anon;
revoke execute on function public.unlock_idea(uuid, integer) from public, anon;
revoke execute on function public.feature_idea(uuid, integer) from public, anon;
revoke execute on function public.get_my_wallet(integer, integer) from public, anon;
revoke execute on function public.admin_adjust_credits(uuid, integer, text) from public, anon;
revoke execute on function public.admin_get_user_credits(uuid) from public, anon;
revoke execute on function public.admin_credit_stats(integer) from public, anon;

grant execute on function public.save_idea(uuid, jsonb, boolean, boolean) to authenticated;
grant execute on function public.unlock_idea(uuid, integer) to authenticated;
grant execute on function public.feature_idea(uuid, integer) to authenticated;
grant execute on function public.get_my_wallet(integer, integer) to authenticated;
grant execute on function public.admin_adjust_credits(uuid, integer, text) to authenticated;
grant execute on function public.admin_get_user_credits(uuid) to authenticated;
grant execute on function public.admin_credit_stats(integer) to authenticated;
-- grant_credits / spend_credits stay internal; Phase 5B webhooks will call
-- dedicated service_role functions that use them.
