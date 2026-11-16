-- =============================================================================
-- MONEX Academy — Phase 3: ideas
-- Business ideas, their skills and launch checklist, saves, unlocks (table only;
-- unlocking itself arrives with credits in Phase 5), and the moderation status.
--
-- Locked content (launch plan, market analysis, risks, checklist) is never
-- granted to anon/authenticated directly. It is read only through
-- public.get_idea_full(), which checks authorship, unlocks and admin role.
-- Writes go only through public.save_idea(), a security definer function.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
create type public.idea_status as enum ('draft', 'pending', 'approved', 'rejected', 'changes_requested', 'hidden');
create type public.idea_source as enum ('user', 'monex', 'ai');
create type public.idea_difficulty as enum ('easy', 'medium', 'hard');
create type public.time_to_income as enum ('lt_1w', '1_4w', '1_3m', '3_6m', '6m_plus');

-- Reused from Phase 2: budget_range (investment, ordered from lowest to highest,
-- so "up to budget X" is a plain comparison), work_preference (online / irl /
-- both = hybrid), team_mode (solo / team).

-- -----------------------------------------------------------------------------
-- Slugs
-- -----------------------------------------------------------------------------
create or replace function public.slugify(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(left(trim(both '-' from regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g')), 60), ''),
    'idea'
  );
$$;

-- -----------------------------------------------------------------------------
-- Ideas
-- -----------------------------------------------------------------------------
create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  -- Null only for MONEX Originals (source = 'monex').
  author_id uuid references public.profiles (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,100}$'),
  title text not null check (char_length(title) between 3 and 90),
  short_description text not null check (char_length(short_description) between 10 and 280),
  category_id uuid not null references public.categories (id),
  investment_range public.budget_range not null,
  earning_min integer not null check (earning_min >= 0 and earning_min <= 100000000),
  earning_max integer not null check (earning_max >= 0 and earning_max <= 100000000),
  difficulty public.idea_difficulty not null,
  time_to_first_income public.time_to_income not null,
  work_mode public.work_preference not null,
  team_mode public.team_mode not null,
  looking_for_roles text[] not null default '{}' check (cardinality(looking_for_roles) <= 10),
  -- Locked content.
  launch_plan jsonb not null default '[]'::jsonb
    check (jsonb_typeof(launch_plan) = 'array' and jsonb_array_length(launch_plan) <= 20),
  market_analysis text check (char_length(market_analysis) <= 4000),
  risks text check (char_length(risks) <= 4000),
  cover_image_url text,
  source public.idea_source not null default 'user',
  status public.idea_status not null default 'draft',
  moderation_note text check (char_length(moderation_note) <= 1000),
  is_featured_until timestamptz,
  saves_count integer not null default 0 check (saves_count >= 0),
  unlocks_count integer not null default 0 check (unlocks_count >= 0),
  published_at timestamptz,
  search_tsv tsvector generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(short_description, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ideas_earning_range check (earning_max >= earning_min),
  constraint ideas_author_or_monex check (author_id is not null or source = 'monex')
);

create trigger ideas_set_updated_at
  before update on public.ideas
  for each row execute function public.set_updated_at();

create or replace function public.ideas_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Stamp the first approval time; approval itself is set by moderation (Phase 4)
  -- or by save_idea() for trusted authors.
  if new.status = 'approved' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create trigger ideas_before_write
  before insert or update on public.ideas
  for each row execute function public.ideas_before_write();

create index ideas_approved_newest_idx on public.ideas (published_at desc) where status = 'approved';
create index ideas_category_idx on public.ideas (category_id);
create index ideas_investment_idx on public.ideas (investment_range);
create index ideas_earning_idx on public.ideas (earning_max desc);
create index ideas_difficulty_idx on public.ideas (difficulty);
create index ideas_time_idx on public.ideas (time_to_first_income);
create index ideas_work_mode_idx on public.ideas (work_mode);
create index ideas_team_mode_idx on public.ideas (team_mode);
create index ideas_saves_idx on public.ideas (saves_count desc);
create index ideas_author_idx on public.ideas (author_id);
create index ideas_search_idx on public.ideas using gin (search_tsv);

-- -----------------------------------------------------------------------------
-- Skills, launch checklist, saves, unlocks
-- -----------------------------------------------------------------------------
create table public.idea_skills (
  idea_id uuid not null references public.ideas (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete cascade,
  primary key (idea_id, skill_id)
);

create index idea_skills_skill_idx on public.idea_skills (skill_id);

-- Checklist is locked content; no grants to anon/authenticated.
create table public.idea_checklist_items (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.ideas (id) on delete cascade,
  position integer not null check (position >= 0),
  text text not null check (char_length(text) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (idea_id, position)
);

create table public.saved_ideas (
  user_id uuid not null references public.profiles (id) on delete cascade,
  idea_id uuid not null references public.ideas (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, idea_id)
);

create index saved_ideas_idea_idx on public.saved_ideas (idea_id);

-- Written by the Phase 5 unlock function, not by the client.
create table public.idea_unlocks (
  user_id uuid not null references public.profiles (id) on delete cascade,
  idea_id uuid not null references public.ideas (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, idea_id)
);

-- Keeps saves_count in step with saved_ideas (runs as owner; users cannot update ideas).
create or replace function public.bump_idea_saves()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.ideas set saves_count = saves_count + 1 where id = new.idea_id;
  else
    update public.ideas set saves_count = greatest(saves_count - 1, 0) where id = old.idea_id;
  end if;
  return null;
end;
$$;

create trigger saved_ideas_count
  after insert or delete on public.saved_ideas
  for each row execute function public.bump_idea_saves();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.ideas enable row level security;
alter table public.idea_skills enable row level security;
alter table public.idea_checklist_items enable row level security;
alter table public.saved_ideas enable row level security;
alter table public.idea_unlocks enable row level security;

-- Approved ideas from visible authors (or MONEX Originals) are public.
create policy "approved ideas are public" on public.ideas for select
  using (
    status = 'approved'
    and (author_id is null or public.is_visible_profile(author_id))
  );

-- Authors see all their own ideas, including drafts and pending ones.
create policy "authors read own ideas" on public.ideas for select to authenticated
  using (author_id = (select auth.uid()));

create policy "idea skills follow idea visibility" on public.idea_skills for select
  using (exists (select 1 from public.ideas i where i.id = idea_id));

create policy "users read own saves" on public.saved_ideas for select to authenticated
  using (user_id = (select auth.uid()));

create policy "users save visible ideas" on public.saved_ideas for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.ideas i where i.id = idea_id)
  );

create policy "users unsave own" on public.saved_ideas for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "users read own unlocks" on public.idea_unlocks for select to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Grants (explicit; Data API does not expose new tables automatically)
-- -----------------------------------------------------------------------------
grant select (
  id, author_id, slug, title, short_description, category_id, investment_range,
  earning_min, earning_max, difficulty, time_to_first_income, work_mode, team_mode,
  looking_for_roles, cover_image_url, source, status, is_featured_until,
  saves_count, unlocks_count, published_at, created_at, updated_at
) on public.ideas to anon, authenticated;

-- search_tsv holds only lexemes of the public title and short description; it must be
-- readable so that full-text search can filter on it.
grant select (search_tsv) on public.ideas to anon, authenticated;

grant select on public.idea_skills to anon, authenticated;
grant select, insert, delete on public.saved_ideas to authenticated;
grant select on public.idea_unlocks to authenticated;
-- ideas, idea_checklist_items: no direct grants (see get_idea_full / save_idea).

-- -----------------------------------------------------------------------------
-- Functions
-- -----------------------------------------------------------------------------

-- Locked content for one idea. Returns null unless the caller is the author,
-- an admin, or (for approved ideas) has unlocked it. Moderation note only goes
-- to the author and admins.
create or replace function public.get_idea_full(p_idea_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_idea public.ideas%rowtype;
  v_is_author boolean;
  v_is_admin boolean;
  v_unlocked boolean;
begin
  select * into v_idea from public.ideas where id = p_idea_id;
  if not found then
    return null;
  end if;

  v_is_author := v_uid is not null and v_idea.author_id = v_uid;
  v_is_admin := exists (select 1 from public.profiles where id = v_uid and role = 'admin');
  v_unlocked := exists (select 1 from public.idea_unlocks where idea_id = p_idea_id and user_id = v_uid)
    and v_idea.status = 'approved';

  if not (v_is_author or v_is_admin or v_unlocked) then
    return null;
  end if;

  return jsonb_build_object(
    'launch_plan', v_idea.launch_plan,
    'market_analysis', v_idea.market_analysis,
    'risks', v_idea.risks,
    'checklist', coalesce(
      (select jsonb_agg(c.text order by c.position) from public.idea_checklist_items c where c.idea_id = p_idea_id),
      '[]'::jsonb
    ),
    'moderation_note', case when v_is_author or v_is_admin then v_idea.moderation_note end,
    'is_author', v_is_author
  );
end;
$$;

-- Create or update an idea (and its skills and checklist) in one transaction.
-- p_data keys: title, short_description, category_id, investment_range,
-- earning_min, earning_max, difficulty, time_to_first_income, work_mode,
-- team_mode, looking_for_roles (text[]), skill_ids (uuid[]),
-- launch_plan (text[]), market_analysis, risks, checklist (text[], optional;
-- defaults to the launch plan steps).
-- Rules:
--   * Only the author can change an idea, and only while it is not approved.
--   * Saving without p_submit keeps it as a draft.
--   * Submitting sends it to 'pending', or straight to 'approved' for trusted authors.
create or replace function public.save_idea(p_id uuid, p_data jsonb, p_submit boolean)
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
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  if not public.is_visible_profile(v_uid) then
    raise exception 'profile_not_ready' using errcode = 'P0001';
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
    select * into v_existing from public.ideas where id = p_id for update;
    if not found or v_existing.author_id is distinct from v_uid then
      raise exception 'idea_not_found' using errcode = 'P0001';
    end if;
    if v_existing.status = 'approved' or v_existing.status = 'hidden' then
      raise exception 'idea_locked' using errcode = 'P0001';
    end if;

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

-- Lock down function execution: no PUBLIC default, explicit grants only.
revoke execute on function public.slugify(text) from public;
revoke execute on function public.get_idea_full(uuid) from public;
revoke execute on function public.save_idea(uuid, jsonb, boolean) from public;
revoke execute on function public.bump_idea_saves() from public;
revoke execute on function public.ideas_before_write() from public;
grant execute on function public.get_idea_full(uuid) to anon, authenticated;
grant execute on function public.save_idea(uuid, jsonb, boolean) to authenticated;
