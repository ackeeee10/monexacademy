-- =============================================================================
-- MONEX Academy — Phase 2: accounts
-- Profiles, private profile data, onboarding answers, skills, categories,
-- links, portfolio, account deletion (soft + hard after 30 days), data export.
--
-- Project settings assumed (Master Prompt 9): Data API on, automatic exposure
-- of new tables OFF, automatic RLS ON. Every table therefore gets explicit
-- RLS policies and only the grants the site needs.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
create type public.user_role as enum ('user', 'moderator', 'admin');
create type public.trust_level as enum ('new', 'trusted');
create type public.plan_tier as enum ('free', 'pro', 'elite');
create type public.user_intent as enum ('seeking_idea', 'idea_owner', 'talent');
create type public.looking_for as enum ('partner', 'job', 'idea');
create type public.budget_range as enum ('0', '1_100', '100_1000', '1000_5000', '5000_20000', '20000_plus');
create type public.work_preference as enum ('online', 'irl', 'both');
create type public.team_mode as enum ('solo', 'team');
create type public.weekly_time as enum ('lt_5', '5_15', '15_30', 'full_time');

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- True when the person born on p_birth_date is 18 or older today (UTC).
create or replace function public.is_adult(p_birth_date date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_birth_date is not null
     and p_birth_date <= (current_date - interval '18 years')::date
     and p_birth_date >= date '1900-01-01';
$$;

-- -----------------------------------------------------------------------------
-- Reference data: categories and skills
-- -----------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Profiles (public-facing data; sensitive columns are not granted publicly)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique check (username ~ '^[a-z0-9._]{3,20}$'),
  avatar_url text check (avatar_url is null or avatar_url ~ '^https://'),
  bio text check (char_length(bio) <= 500),
  experience text check (char_length(experience) <= 2000),
  country char(2) check (country ~ '^[A-Z]{2}$'),
  city text check (char_length(city) <= 80),
  availability_hours smallint check (availability_hours between 0 and 80),
  looking_for public.looking_for[] not null default '{}',
  intents public.user_intent[] not null default '{}',
  role public.user_role not null default 'user',
  trust_level public.trust_level not null default 'new',
  plan public.plan_tier not null default 'free',
  plan_status text,
  trial_used boolean not null default false,
  is_blocked boolean not null default false,
  deleted_at timestamptz,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_public_idx on public.profiles (username)
  where deleted_at is null and is_blocked = false;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Private profile data: only the owner (and server functions) can read it.
create table public.profiles_private (
  id uuid primary key references public.profiles (id) on delete cascade,
  birth_date date,
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_private_set_updated_at
  before update on public.profiles_private
  for each row execute function public.set_updated_at();

create or replace function public.enforce_adult()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.birth_date is not null and not public.is_adult(new.birth_date) then
    raise exception 'must_be_18' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger profiles_private_enforce_adult
  before insert or update of birth_date on public.profiles_private
  for each row execute function public.enforce_adult();

-- Onboarding answers (private; used for personalised recommendations).
create table public.onboarding_answers (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  budget_range public.budget_range,
  work_preference public.work_preference,
  team_mode public.team_mode,
  weekly_time public.weekly_time,
  categories uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger onboarding_answers_set_updated_at
  before update on public.onboarding_answers
  for each row execute function public.set_updated_at();

create table public.profile_skills (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, skill_id)
);

create index profile_skills_skill_idx on public.profile_skills (skill_id);

create table public.profile_links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 40),
  url text not null check (url ~ '^https?://' and char_length(url) <= 300),
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

create index profile_links_profile_idx on public.profile_links (profile_id, position);

create table public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  image_url text check (image_url is null or image_url ~ '^https://'),
  url text check (url is null or (url ~ '^https?://' and char_length(url) <= 300)),
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

create index portfolio_items_profile_idx on public.portfolio_items (profile_id, position);

-- -----------------------------------------------------------------------------
-- New user: create profile rows from sign-up metadata
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_birth_date date;
  v_avatar text;
begin
  begin
    v_birth_date := nullif(new.raw_user_meta_data ->> 'birth_date', '')::date;
  exception when others then
    v_birth_date := null;
  end;

  v_avatar := coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture');
  if v_avatar is not null and v_avatar !~ '^https://' then
    v_avatar := null;
  end if;

  insert into public.profiles (id, avatar_url) values (new.id, v_avatar);

  insert into public.profiles_private (id, birth_date, terms_accepted_at)
  values (
    new.id,
    v_birth_date,
    case when (new.raw_user_meta_data ->> 'terms_accepted') = 'true' then now() end
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- RPC: current user's full account (public + private fields)
-- -----------------------------------------------------------------------------
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
    'deleted_at', p.deleted_at,
    'onboarding_completed', p.onboarding_completed,
    'birth_date', pp.birth_date,
    'terms_accepted_at', pp.terms_accepted_at,
    -- Magic-link accounts also have an 'email' identity, so check the password itself.
    'has_password', coalesce(u.encrypted_password, '') <> '',
    'created_at', p.created_at
  )
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.profiles_private pp on pp.id = p.id
  where p.id = auth.uid();
$$;

-- -----------------------------------------------------------------------------
-- RPC: username availability (usernames are public anyway)
-- -----------------------------------------------------------------------------
create or replace function public.is_username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_username ~ '^[a-z0-9._]{3,20}$'
     and not exists (
       select 1 from public.profiles
       where username = p_username and id is distinct from auth.uid()
     );
$$;

-- -----------------------------------------------------------------------------
-- RPC: finish onboarding in one transaction
-- -----------------------------------------------------------------------------
create or replace function public.complete_onboarding(
  p_username text,
  p_birth_date date,
  p_accept_terms boolean,
  p_intents public.user_intent[],
  p_budget_range public.budget_range,
  p_work_preference public.work_preference,
  p_team_mode public.team_mode,
  p_weekly_time public.weekly_time,
  p_categories uuid[],
  p_skills uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_private public.profiles_private%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if coalesce(array_length(p_intents, 1), 0) = 0 then
    raise exception 'intents_required' using errcode = 'P0001';
  end if;

  if coalesce(array_length(p_skills, 1), 0) > 30 or coalesce(array_length(p_categories, 1), 0) > 20 then
    raise exception 'too_many_items' using errcode = 'P0001';
  end if;

  select * into v_private from public.profiles_private where id = v_uid for update;

  -- Accounts created with Google or a magic link have no birth date yet.
  if v_private.birth_date is null then
    if p_birth_date is null or not public.is_adult(p_birth_date) then
      raise exception 'must_be_18' using errcode = 'P0001';
    end if;
    update public.profiles_private set birth_date = p_birth_date where id = v_uid;
  end if;

  if v_private.terms_accepted_at is null then
    if coalesce(p_accept_terms, false) is false then
      raise exception 'terms_required' using errcode = 'P0001';
    end if;
    update public.profiles_private set terms_accepted_at = now() where id = v_uid;
  end if;

  if not public.is_username_available(p_username) then
    raise exception 'username_taken' using errcode = 'P0001';
  end if;

  update public.profiles
  set username = p_username,
      intents = p_intents,
      onboarding_completed = true
  where id = v_uid;

  insert into public.onboarding_answers (profile_id, budget_range, work_preference, team_mode, weekly_time, categories)
  values (
    v_uid, p_budget_range, p_work_preference, p_team_mode, p_weekly_time,
    array(select c.id from public.categories c where c.id = any (coalesce(p_categories, '{}')))
  )
  on conflict (profile_id) do update
  set budget_range = excluded.budget_range,
      work_preference = excluded.work_preference,
      team_mode = excluded.team_mode,
      weekly_time = excluded.weekly_time,
      categories = excluded.categories;

  delete from public.profile_skills where profile_id = v_uid;
  insert into public.profile_skills (profile_id, skill_id)
  select v_uid, s.id from public.skills s where s.id = any (coalesce(p_skills, '{}'));
exception
  when unique_violation then
    raise exception 'username_taken' using errcode = 'P0001';
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: replace the current user's skills
-- -----------------------------------------------------------------------------
create or replace function public.set_my_skills(p_skills uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if coalesce(array_length(p_skills, 1), 0) > 30 then
    raise exception 'too_many_items' using errcode = 'P0001';
  end if;

  delete from public.profile_skills where profile_id = v_uid;
  insert into public.profile_skills (profile_id, skill_id)
  select v_uid, s.id from public.skills s where s.id = any (coalesce(p_skills, '{}'));
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: replace the current user's links and portfolio (max 10 each)
-- p_links / p_portfolio: jsonb arrays of {label,url} / {title,url}
-- -----------------------------------------------------------------------------
create or replace function public.set_my_links(p_links jsonb, p_portfolio jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if jsonb_array_length(coalesce(p_links, '[]')) > 10 or jsonb_array_length(coalesce(p_portfolio, '[]')) > 10 then
    raise exception 'too_many_items' using errcode = 'P0001';
  end if;

  delete from public.profile_links where profile_id = v_uid;
  insert into public.profile_links (profile_id, label, url, position)
  select v_uid, e.value ->> 'label', e.value ->> 'url', (e.ordinality - 1)::smallint
  from jsonb_array_elements(coalesce(p_links, '[]')) with ordinality as e (value, ordinality);

  delete from public.portfolio_items where profile_id = v_uid;
  insert into public.portfolio_items (profile_id, title, url, position)
  select v_uid, e.value ->> 'title', nullif(e.value ->> 'url', ''), (e.ordinality - 1)::smallint
  from jsonb_array_elements(coalesce(p_portfolio, '[]')) with ordinality as e (value, ordinality);
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: account deletion (GDPR, Master Prompt 4.7)
-- -----------------------------------------------------------------------------
create or replace function public.request_account_deletion()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  update public.profiles set deleted_at = now() where id = auth.uid() and deleted_at is null;
end;
$$;

-- Signing in within 30 days restores the account. Returns true if restored.
create or replace function public.restore_my_account()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restored boolean;
begin
  update public.profiles
  set deleted_at = null
  where id = auth.uid()
    and deleted_at is not null
    and deleted_at > now() - interval '30 days'
  returning true into v_restored;
  return coalesce(v_restored, false);
end;
$$;

-- Permanently deletes accounts 30+ days after a deletion request.
-- Deleting auth.users cascades to profiles and every table that references them.
-- Not callable by users; scheduled with pg_cron below.
create or replace function public.purge_deleted_accounts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with doomed as (
    select id from public.profiles
    where deleted_at is not null and deleted_at <= now() - interval '30 days'
    limit 500
  )
  delete from auth.users u using doomed d where u.id = d.id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- RPC: export of the current user's personal data (JSON download).
create or replace function public.export_my_data()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'exported_at', now(),
    'account', public.get_my_account(),
    'onboarding', (select to_jsonb(o) - 'profile_id' from public.onboarding_answers o where o.profile_id = auth.uid()),
    'skills', coalesce((
      select jsonb_agg(s.name order by s.name)
      from public.profile_skills ps join public.skills s on s.id = ps.skill_id
      where ps.profile_id = auth.uid()
    ), '[]'),
    'links', coalesce((
      select jsonb_agg(jsonb_build_object('label', l.label, 'url', l.url) order by l.position)
      from public.profile_links l where l.profile_id = auth.uid()
    ), '[]'),
    'portfolio', coalesce((
      select jsonb_agg(jsonb_build_object('title', pi.title, 'url', pi.url, 'image_url', pi.image_url) order by pi.position)
      from public.portfolio_items pi where pi.profile_id = auth.uid()
    ), '[]')
  )
  where auth.uid() is not null;
$$;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.categories enable row level security;
alter table public.skills enable row level security;
alter table public.profiles enable row level security;
alter table public.profiles_private enable row level security;
alter table public.onboarding_answers enable row level security;
alter table public.profile_skills enable row level security;
alter table public.profile_links enable row level security;
alter table public.portfolio_items enable row level security;

-- A profile is publicly visible when it is finished, not deleted and not blocked.
create or replace function public.is_visible_profile(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = p_id and username is not null and deleted_at is null and is_blocked = false
  );
$$;

create policy "categories are public" on public.categories for select using (true);
create policy "skills are public" on public.skills for select using (true);

create policy "visible profiles are public" on public.profiles for select
  using (
    (username is not null and deleted_at is null and is_blocked = false)
    or id = (select auth.uid())
  );

create policy "users update own profile" on public.profiles for update
  using (id = (select auth.uid()) and deleted_at is null)
  with check (id = (select auth.uid()));

create policy "users read own private data" on public.profiles_private for select
  using (id = (select auth.uid()));

create policy "users read own onboarding" on public.onboarding_answers for select
  using (profile_id = (select auth.uid()));

create policy "users upsert own onboarding" on public.onboarding_answers for insert
  with check (profile_id = (select auth.uid()));

create policy "users update own onboarding" on public.onboarding_answers for update
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy "profile skills are public" on public.profile_skills for select
  using (public.is_visible_profile(profile_id) or profile_id = (select auth.uid()));

create policy "profile links are public" on public.profile_links for select
  using (public.is_visible_profile(profile_id) or profile_id = (select auth.uid()));

create policy "portfolio is public" on public.portfolio_items for select
  using (public.is_visible_profile(profile_id) or profile_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Grants (new tables are not exposed automatically)
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select on public.categories, public.skills to anon, authenticated;

-- Only public columns of profiles are readable; everything else goes through RPCs.
grant select (
  id, username, avatar_url, bio, experience, country, city,
  availability_hours, looking_for, plan, created_at
) on public.profiles to anon, authenticated;

-- Users may edit only these profile columns (role, plan, trust etc. are server-only).
grant update (
  username, bio, experience, country, city, availability_hours, looking_for, intents
) on public.profiles to authenticated;

grant select on public.profiles_private to authenticated;
grant select, insert, update on public.onboarding_answers to authenticated;
grant select on public.profile_skills, public.profile_links, public.portfolio_items to anon, authenticated;

-- Functions: revoke the default PUBLIC execute, then grant explicitly.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.is_adult(date) to anon, authenticated;
grant execute on function public.is_username_available(text) to anon, authenticated;
grant execute on function public.is_visible_profile(uuid) to anon, authenticated;
grant execute on function public.get_my_account() to authenticated;
grant execute on function public.complete_onboarding(
  text, date, boolean, public.user_intent[], public.budget_range, public.work_preference,
  public.team_mode, public.weekly_time, uuid[], uuid[]
) to authenticated;
grant execute on function public.set_my_skills(uuid[]) to authenticated;
grant execute on function public.set_my_links(jsonb, jsonb) to authenticated;
grant execute on function public.request_account_deletion() to authenticated;
grant execute on function public.restore_my_account() to authenticated;
grant execute on function public.export_my_data() to authenticated;
-- purge_deleted_accounts, handle_new_user, enforce_adult, set_updated_at: no client access.

alter default privileges in schema public revoke execute on functions from public;

-- -----------------------------------------------------------------------------
-- Scheduled job: permanent deletion after 30 days (daily, 03:17 UTC)
-- -----------------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'purge-deleted-accounts',
  '17 3 * * *',
  $$select public.purge_deleted_accounts();$$
);
