-- =============================================================================
-- MONEX Academy — Phase 4: admin and moderation
-- Reports, audit log, admin functions (moderation, users, categories and skills),
-- automatic trust levels and the "suspected minor" age check.
--
-- Every admin function checks, inside the database, that the caller is an admin
-- AND that the session passed two-factor authentication (JWT claim aal = aal2).
-- None of the new tables are granted to anon/authenticated: everything goes
-- through security definer functions.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
create type public.report_target as enum ('idea', 'profile');
create type public.report_reason as enum (
  'spam', 'scam', 'prohibited', 'inappropriate', 'copyright', 'suspected_minor', 'other'
);
create type public.report_status as enum ('open', 'resolved', 'dismissed');

-- -----------------------------------------------------------------------------
-- New columns
-- -----------------------------------------------------------------------------
-- Admin asked the user to confirm their age; the account is hidden until they do.
alter table public.profiles add column age_check_required boolean not null default false;
-- Trust level was set by an admin; automatic promotion leaves it alone.
alter table public.profiles add column trust_manual boolean not null default false;

alter table public.ideas add column moderated_at timestamptz;
alter table public.ideas add column moderated_by uuid references public.profiles (id) on delete set null;

-- -----------------------------------------------------------------------------
-- Admin check
-- -----------------------------------------------------------------------------
-- True only for an active admin whose current session passed 2FA.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'aal') = 'aal2', false)
     and exists (
       select 1 from public.profiles
       where id = auth.uid() and role = 'admin' and deleted_at is null and is_blocked = false
     );
$$;

create or replace function public.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  return auth.uid();
end;
$$;

-- '%text%' for ILIKE with % and _ escaped; null when the search is empty.
create or replace function public.like_pattern(p_search text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_search is null or btrim(p_search) = '' then null
    else '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  end;
$$;

-- -----------------------------------------------------------------------------
-- Profile visibility now also hides accounts waiting for an age check.
-- (Same signature as Phase 2, so existing policies keep using it.)
-- -----------------------------------------------------------------------------
create or replace function public.is_visible_profile(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = p_id
      and username is not null
      and deleted_at is null
      and is_blocked = false
      and age_check_required = false
  );
$$;

-- The public profile policy lists its conditions inline, so it is replaced too.
drop policy "visible profiles are public" on public.profiles;
create policy "visible profiles are public" on public.profiles for select
  using (
    (username is not null and deleted_at is null and is_blocked = false and age_check_required = false)
    or id = (select auth.uid())
  );

-- Current account, now with age_check_required.
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
    'created_at', p.created_at
  )
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.profiles_private pp on pp.id = p.id
  where p.id = auth.uid();
$$;

-- -----------------------------------------------------------------------------
-- Audit log
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  target_type text not null check (char_length(target_type) between 1 and 30),
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_target_idx on public.audit_log (target_type, target_id);
create index audit_log_action_idx on public.audit_log (action, created_at desc);

alter table public.audit_log enable row level security;
-- No policies and no grants: written and read only through functions below.

create or replace function public.log_action(p_action text, p_target_type text, p_target_id uuid, p_details jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (actor_id, action, target_type, target_id, details)
  values (auth.uid(), p_action, p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb));
$$;

-- -----------------------------------------------------------------------------
-- Reports
-- -----------------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles (id) on delete set null,
  target_type public.report_target not null,
  target_id uuid not null,
  reason public.report_reason not null,
  details text check (char_length(details) <= 1000),
  status public.report_status not null default 'open',
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  resolution_note text check (char_length(resolution_note) <= 1000),
  created_at timestamptz not null default now()
);

-- One open report per person and target; a repeat report is simply ignored.
create unique index reports_one_open_idx on public.reports (reporter_id, target_type, target_id) where status = 'open';
create index reports_status_idx on public.reports (status, created_at desc);
create index reports_target_idx on public.reports (target_type, target_id);
create index reports_reporter_idx on public.reports (reporter_id, created_at desc);

alter table public.reports enable row level security;
-- No policies and no grants: created through create_report(), read by admins only.

create or replace function public.create_report(
  p_target_type public.report_target,
  p_target_id uuid,
  p_reason public.report_reason,
  p_details text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  if not public.is_visible_profile(v_uid) then
    raise exception 'profile_not_ready' using errcode = 'P0001';
  end if;
  if (select count(*) from public.reports where reporter_id = v_uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  if p_target_type = 'idea' then
    select author_id into v_owner
    from public.ideas
    where id = p_target_id
      and status = 'approved'
      and (author_id is null or public.is_visible_profile(author_id));
    if not found then
      raise exception 'target_not_found' using errcode = 'P0001';
    end if;
  else
    if not public.is_visible_profile(p_target_id) then
      raise exception 'target_not_found' using errcode = 'P0001';
    end if;
    v_owner := p_target_id;
  end if;

  if v_owner = v_uid then
    raise exception 'cannot_report_self' using errcode = 'P0001';
  end if;

  insert into public.reports (reporter_id, target_type, target_id, reason, details)
  values (v_uid, p_target_type, p_target_id, p_reason, nullif(btrim(coalesce(p_details, '')), ''))
  on conflict (reporter_id, target_type, target_id) where status = 'open' do nothing;
end;
$$;

-- -----------------------------------------------------------------------------
-- Ideas: admins can read everything except drafts
-- -----------------------------------------------------------------------------
create policy "admins read submitted ideas" on public.ideas for select to authenticated
  using (status <> 'draft' and public.is_admin());

-- Locked content: the admin path now also requires 2FA (is_admin) and skips drafts.
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
  v_is_admin := v_idea.status <> 'draft' and public.is_admin();
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

-- -----------------------------------------------------------------------------
-- Trust levels (Master Prompt 4.8)
-- New -> trusted after 3 approved ideas and no rejected idea in the last 30 days.
-- (The "average rating >= 4" rule joins when ratings exist, Phase 7.)
-- -----------------------------------------------------------------------------
create or replace function public.refresh_trust_level(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set trust_level = 'trusted'
  where id = p_user
    and trust_level = 'new'
    and trust_manual = false
    and (select count(*) from public.ideas where author_id = p_user and status = 'approved') >= 3
    and not exists (
      select 1 from public.audit_log
      where action = 'idea.reject'
        and details ->> 'author_id' = p_user::text
        and created_at > now() - interval '30 days'
    );
  if found then
    perform public.log_action('user.auto_trusted', 'profile', p_user, '{}'::jsonb);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin: moderation
-- -----------------------------------------------------------------------------
create or replace function public.admin_list_ideas(
  p_status public.idea_status,
  p_search text,
  p_limit integer,
  p_offset integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pattern text := public.like_pattern(p_search);
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_items jsonb;
begin
  perform public.require_admin();

  select count(*) into v_total
  from public.ideas i
  where i.status = p_status and i.status <> 'draft'
    and (v_pattern is null or i.title ilike v_pattern);

  select coalesce(jsonb_agg(s.item order by s.ord), '[]'::jsonb) into v_items
  from (
    select
      jsonb_build_object(
        'id', i.id,
        'slug', i.slug,
        'title', i.title,
        'short_description', i.short_description,
        'status', i.status,
        'source', i.source,
        'category', c.name,
        'author_id', i.author_id,
        'author_username', p.username,
        'author_trust', p.trust_level,
        'moderation_note', i.moderation_note,
        'created_at', i.created_at,
        'updated_at', i.updated_at,
        'open_reports', (
          select count(*) from public.reports r
          where r.target_type = 'idea' and r.target_id = i.id and r.status = 'open'
        )
      ) as item,
      -- The pending queue is first come, first served; other lists show newest first.
      row_number() over (
        order by
          case when p_status = 'pending' then i.updated_at end asc,
          i.updated_at desc
      ) as ord
    from public.ideas i
    join public.categories c on c.id = i.category_id
    left join public.profiles p on p.id = i.author_id
    where i.status = p_status and i.status <> 'draft'
      and (v_pattern is null or i.title ilike v_pattern)
    order by ord
    limit v_limit offset v_offset
  ) s;

  return jsonb_build_object('total', v_total, 'items', v_items);
end;
$$;

-- p_action: approve | reject | request_changes (from pending), hide (from approved),
-- restore (from hidden). Reject and request_changes need a note for the author.
create or replace function public.admin_moderate_idea(p_idea_id uuid, p_action text, p_note text)
returns public.idea_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
  v_idea public.ideas%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_new public.idea_status;
begin
  select * into v_idea from public.ideas where id = p_idea_id for update;
  if not found or v_idea.status = 'draft' then
    raise exception 'idea_not_found' using errcode = 'P0001';
  end if;

  if p_action in ('approve', 'reject', 'request_changes') and v_idea.status <> 'pending' then
    raise exception 'invalid_state' using errcode = 'P0001';
  elsif p_action = 'hide' and v_idea.status <> 'approved' then
    raise exception 'invalid_state' using errcode = 'P0001';
  elsif p_action = 'restore' and v_idea.status <> 'hidden' then
    raise exception 'invalid_state' using errcode = 'P0001';
  elsif p_action not in ('approve', 'reject', 'request_changes', 'hide', 'restore') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  if p_action in ('reject', 'request_changes') and v_note is null then
    raise exception 'note_required' using errcode = 'P0001';
  end if;
  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'note_too_long' using errcode = 'P0001';
  end if;

  v_new := case p_action
    when 'approve' then 'approved'
    when 'reject' then 'rejected'
    when 'request_changes' then 'changes_requested'
    when 'hide' then 'hidden'
    when 'restore' then 'approved'
  end;

  update public.ideas
  set status = v_new,
      moderation_note = case when p_action = 'restore' then moderation_note else v_note end,
      moderated_at = now(),
      moderated_by = v_admin
  where id = p_idea_id;

  perform public.log_action(
    'idea.' || p_action,
    'idea',
    p_idea_id,
    jsonb_build_object('author_id', v_idea.author_id, 'from', v_idea.status, 'to', v_new, 'note', v_note, 'title', v_idea.title)
  );

  if p_action = 'approve' and v_idea.author_id is not null then
    perform public.refresh_trust_level(v_idea.author_id);
  end if;

  return v_new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin: reports
-- -----------------------------------------------------------------------------
create or replace function public.admin_list_reports(p_status public.report_status, p_limit integer, p_offset integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_items jsonb;
begin
  perform public.require_admin();

  select count(*) into v_total from public.reports where status = p_status;

  select coalesce(jsonb_agg(s.item order by s.ord), '[]'::jsonb) into v_items
  from (
    select
      jsonb_build_object(
        'id', r.id,
        'target_type', r.target_type,
        'target_id', r.target_id,
        'reason', r.reason,
        'details', r.details,
        'status', r.status,
        'created_at', r.created_at,
        'resolved_at', r.resolved_at,
        'resolution_note', r.resolution_note,
        'reporter_username', rp.username,
        'resolver_username', rs.username,
        'target', case r.target_type
          when 'idea' then (
            select jsonb_build_object(
              'title', i.title, 'slug', i.slug, 'status', i.status,
              'owner_id', i.author_id, 'owner_username', ap.username
            )
            from public.ideas i
            left join public.profiles ap on ap.id = i.author_id
            where i.id = r.target_id
          )
          when 'profile' then (
            select jsonb_build_object(
              'username', tp.username, 'is_blocked', tp.is_blocked,
              'owner_id', tp.id, 'owner_username', tp.username
            )
            from public.profiles tp
            where tp.id = r.target_id
          )
        end
      ) as item,
      row_number() over (
        order by
          case when p_status = 'open' then r.created_at end asc,
          coalesce(r.resolved_at, r.created_at) desc
      ) as ord
    from public.reports r
    left join public.profiles rp on rp.id = r.reporter_id
    left join public.profiles rs on rs.id = r.resolved_by
    where r.status = p_status
    order by ord
    limit v_limit offset v_offset
  ) s;

  return jsonb_build_object('total', v_total, 'items', v_items);
end;
$$;

create or replace function public.admin_resolve_report(p_report_id uuid, p_status public.report_status, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
  v_report public.reports%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if p_status not in ('resolved', 'dismissed') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'note_too_long' using errcode = 'P0001';
  end if;

  select * into v_report from public.reports where id = p_report_id for update;
  if not found then
    raise exception 'report_not_found' using errcode = 'P0001';
  end if;
  if v_report.status <> 'open' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  update public.reports
  set status = p_status, resolved_by = v_admin, resolved_at = now(), resolution_note = v_note
  where id = p_report_id;

  perform public.log_action(
    case when p_status = 'resolved' then 'report.resolve' else 'report.dismiss' end,
    'report',
    p_report_id,
    jsonb_build_object('target_type', v_report.target_type, 'target_id', v_report.target_id, 'reason', v_report.reason, 'note', v_note)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin: users
-- -----------------------------------------------------------------------------
-- p_filter: all | blocked | age_check | deleted | trusted | staff
create or replace function public.admin_list_users(p_search text, p_filter text, p_limit integer, p_offset integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pattern text := public.like_pattern(p_search);
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_items jsonb;
begin
  perform public.require_admin();

  with filtered as (
    select p.*, u.email
    from public.profiles p
    join auth.users u on u.id = p.id
    where (v_pattern is null or p.username ilike v_pattern or u.email ilike v_pattern)
      and case coalesce(p_filter, 'all')
        when 'blocked' then p.is_blocked
        when 'age_check' then p.age_check_required
        when 'deleted' then p.deleted_at is not null
        when 'trusted' then p.trust_level = 'trusted'
        when 'staff' then p.role <> 'user'
        else true
      end
  )
  select
    (select count(*) from filtered),
    coalesce(
      (
        select jsonb_agg(s.item order by s.created_at desc)
        from (
          select f.created_at, jsonb_build_object(
            'id', f.id,
            'username', f.username,
            'email', f.email,
            'role', f.role,
            'trust_level', f.trust_level,
            'plan', f.plan,
            'is_blocked', f.is_blocked,
            'age_check_required', f.age_check_required,
            'deleted_at', f.deleted_at,
            'onboarding_completed', f.onboarding_completed,
            'created_at', f.created_at
          ) as item
          from filtered f
          order by f.created_at desc
          limit v_limit offset v_offset
        ) s
      ),
      '[]'::jsonb
    )
  into v_total, v_items;

  return jsonb_build_object('total', v_total, 'items', v_items);
end;
$$;

create or replace function public.admin_get_user(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform public.require_admin();

  select jsonb_build_object(
    'id', p.id,
    'username', p.username,
    'email', u.email,
    'role', p.role,
    'trust_level', p.trust_level,
    'trust_manual', p.trust_manual,
    'plan', p.plan,
    'is_blocked', p.is_blocked,
    'age_check_required', p.age_check_required,
    'deleted_at', p.deleted_at,
    'onboarding_completed', p.onboarding_completed,
    'country', p.country,
    'created_at', p.created_at,
    'ideas', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'slug', i.slug, 'title', i.title, 'status', i.status, 'updated_at', i.updated_at) order by i.updated_at desc)
      from public.ideas i where i.author_id = p.id and i.status <> 'draft'
    ), '[]'::jsonb),
    'reports_against', (
      select count(*) from public.reports r
      where (r.target_type = 'profile' and r.target_id = p.id)
         or (r.target_type = 'idea' and r.target_id in (select id from public.ideas where author_id = p.id))
    ),
    'open_reports_against', (
      select count(*) from public.reports r
      where r.status = 'open'
        and ((r.target_type = 'profile' and r.target_id = p.id)
          or (r.target_type = 'idea' and r.target_id in (select id from public.ideas where author_id = p.id)))
    ),
    'history', coalesce((
      select jsonb_agg(h.item order by h.created_at desc)
      from (
        select a.created_at, jsonb_build_object(
          'action', a.action, 'created_at', a.created_at, 'details', a.details, 'actor_username', ap.username
        ) as item
        from public.audit_log a
        left join public.profiles ap on ap.id = a.actor_id
        where a.target_type = 'profile' and a.target_id = p.id
        order by a.created_at desc
        limit 20
      ) h
    ), '[]'::jsonb)
  )
  into v_result
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = p_user;

  return v_result;
end;
$$;

-- Admins cannot act on themselves or on other admins (the owner is the only admin).
create or replace function public.admin_guard_target(p_user uuid)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.profiles%rowtype;
begin
  select * into v_target from public.profiles where id = p_user for update;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;
  if v_target.id = auth.uid() then
    raise exception 'cannot_target_self' using errcode = 'P0001';
  end if;
  if v_target.role = 'admin' then
    raise exception 'cannot_target_admin' using errcode = 'P0001';
  end if;
  return v_target;
end;
$$;

-- Blocking also bans the login in Supabase Auth, so the person can't sign in
-- or refresh an existing session.
create or replace function public.admin_set_user_block(p_user uuid, p_blocked boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform public.require_admin();
  perform public.admin_guard_target(p_user);
  if p_blocked and v_reason is null then
    raise exception 'note_required' using errcode = 'P0001';
  end if;

  update public.profiles set is_blocked = p_blocked where id = p_user;
  update auth.users set banned_until = case when p_blocked then 'infinity'::timestamptz else null end where id = p_user;

  perform public.log_action(
    case when p_blocked then 'user.block' else 'user.unblock' end,
    'profile', p_user, jsonb_build_object('reason', v_reason)
  );
end;
$$;

create or replace function public.admin_set_user_trust(p_user uuid, p_level public.trust_level, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  perform public.admin_guard_target(p_user);
  update public.profiles set trust_level = p_level, trust_manual = true where id = p_user;
  perform public.log_action('user.trust', 'profile', p_user,
    jsonb_build_object('level', p_level, 'reason', nullif(btrim(coalesce(p_reason, '')), '')));
end;
$$;

-- Admin role can only be given in the SQL editor by the owner.
create or replace function public.admin_set_user_role(p_user uuid, p_role public.user_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  perform public.admin_guard_target(p_user);
  if p_role = 'admin' then
    raise exception 'cannot_target_admin' using errcode = 'P0001';
  end if;
  update public.profiles set role = p_role where id = p_user;
  perform public.log_action('user.role', 'profile', p_user, jsonb_build_object('role', p_role));
end;
$$;

-- "Suspected minor": hide the account until the person confirms their age.
create or replace function public.admin_set_age_check(p_user uuid, p_required boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform public.require_admin();
  perform public.admin_guard_target(p_user);
  if p_required and v_reason is null then
    raise exception 'note_required' using errcode = 'P0001';
  end if;
  update public.profiles set age_check_required = p_required where id = p_user;
  perform public.log_action(
    case when p_required then 'user.age_check' else 'user.age_check_cleared' end,
    'profile', p_user, jsonb_build_object('reason', v_reason)
  );
end;
$$;

-- The person confirms they are 18+; this clears the age check.
create or replace function public.confirm_my_age(p_birth_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and age_check_required) then
    raise exception 'not_required' using errcode = 'P0001';
  end if;
  if not public.is_adult(p_birth_date) then
    raise exception 'must_be_18' using errcode = 'P0001';
  end if;

  insert into public.profiles_private (id, birth_date) values (v_uid, p_birth_date)
  on conflict (id) do update set birth_date = excluded.birth_date;
  update public.profiles set age_check_required = false where id = v_uid;
  perform public.log_action('user.age_confirmed', 'profile', v_uid, '{}'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin: categories and skills
-- -----------------------------------------------------------------------------
create or replace function public.admin_save_category(p_id uuid, p_name text, p_slug text, p_sort_order integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.require_admin();
  begin
    if p_id is null then
      insert into public.categories (name, slug, sort_order)
      values (btrim(p_name), p_slug, coalesce(p_sort_order, 0))
      returning id into v_id;
    else
      update public.categories
      set name = btrim(p_name), slug = p_slug, sort_order = coalesce(p_sort_order, 0)
      where id = p_id
      returning id into v_id;
      if v_id is null then
        raise exception 'not_found' using errcode = 'P0001';
      end if;
    end if;
  exception when unique_violation then
    raise exception 'slug_taken' using errcode = 'P0001';
  end;
  perform public.log_action(case when p_id is null then 'category.create' else 'category.update' end,
    'category', v_id, jsonb_build_object('name', btrim(p_name), 'slug', p_slug));
  return v_id;
end;
$$;

create or replace function public.admin_delete_category(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  perform public.require_admin();
  if exists (select 1 from public.ideas where category_id = p_id) then
    raise exception 'in_use' using errcode = 'P0001';
  end if;
  delete from public.categories where id = p_id returning name into v_name;
  if v_name is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  update public.onboarding_answers set categories = array_remove(categories, p_id) where p_id = any (categories);
  perform public.log_action('category.delete', 'category', p_id, jsonb_build_object('name', v_name));
end;
$$;

create or replace function public.admin_save_skill(p_id uuid, p_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.require_admin();
  begin
    if p_id is null then
      insert into public.skills (name, slug) values (btrim(p_name), p_slug) returning id into v_id;
    else
      update public.skills set name = btrim(p_name), slug = p_slug where id = p_id returning id into v_id;
      if v_id is null then
        raise exception 'not_found' using errcode = 'P0001';
      end if;
    end if;
  exception when unique_violation then
    raise exception 'slug_taken' using errcode = 'P0001';
  end;
  perform public.log_action(case when p_id is null then 'skill.create' else 'skill.update' end,
    'skill', v_id, jsonb_build_object('name', btrim(p_name), 'slug', p_slug));
  return v_id;
end;
$$;

create or replace function public.admin_delete_skill(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  perform public.require_admin();
  if exists (select 1 from public.idea_skills where skill_id = p_id)
     or exists (select 1 from public.profile_skills where skill_id = p_id) then
    raise exception 'in_use' using errcode = 'P0001';
  end if;
  delete from public.skills where id = p_id returning name into v_name;
  if v_name is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  perform public.log_action('skill.delete', 'skill', p_id, jsonb_build_object('name', v_name));
end;
$$;

-- Categories and skills with usage counts, for the admin screen.
create or replace function public.admin_list_taxonomy()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'slug', c.slug, 'sort_order', c.sort_order,
        'ideas', (select count(*) from public.ideas i where i.category_id = c.id)
      ) order by c.sort_order, c.name)
      from public.categories c
    ), '[]'::jsonb),
    'skills', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'slug', s.slug,
        'ideas', (select count(*) from public.idea_skills x where x.skill_id = s.id),
        'profiles', (select count(*) from public.profile_skills x where x.skill_id = s.id)
      ) order by s.name)
      from public.skills s
    ), '[]'::jsonb)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin: audit log and overview
-- -----------------------------------------------------------------------------
create or replace function public.admin_list_audit(p_limit integer, p_offset integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  perform public.require_admin();
  return jsonb_build_object(
    'total', (select count(*) from public.audit_log),
    'items', coalesce((
      select jsonb_agg(s.item order by s.created_at desc)
      from (
        select a.created_at, jsonb_build_object(
          'id', a.id, 'action', a.action, 'target_type', a.target_type, 'target_id', a.target_id,
          'details', a.details, 'created_at', a.created_at, 'actor_username', p.username
        ) as item
        from public.audit_log a
        left join public.profiles p on p.id = a.actor_id
        order by a.created_at desc
        limit v_limit offset v_offset
      ) s
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'pending_ideas', (select count(*) from public.ideas where status = 'pending'),
    'open_reports', (select count(*) from public.reports where status = 'open'),
    'approved_ideas', (select count(*) from public.ideas where status = 'approved'),
    'users', (select count(*) from public.profiles where deleted_at is null),
    'new_users_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'blocked_users', (select count(*) from public.profiles where is_blocked),
    'age_checks', (select count(*) from public.profiles where age_check_required)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Function permissions: no PUBLIC default, explicit grants only.
-- -----------------------------------------------------------------------------
revoke execute on function public.is_admin() from public;
revoke execute on function public.require_admin() from public;
revoke execute on function public.like_pattern(text) from public;
revoke execute on function public.log_action(text, text, uuid, jsonb) from public;
revoke execute on function public.create_report(public.report_target, uuid, public.report_reason, text) from public;
revoke execute on function public.refresh_trust_level(uuid) from public;
revoke execute on function public.admin_list_ideas(public.idea_status, text, integer, integer) from public;
revoke execute on function public.admin_moderate_idea(uuid, text, text) from public;
revoke execute on function public.admin_list_reports(public.report_status, integer, integer) from public;
revoke execute on function public.admin_resolve_report(uuid, public.report_status, text) from public;
revoke execute on function public.admin_list_users(text, text, integer, integer) from public;
revoke execute on function public.admin_get_user(uuid) from public;
revoke execute on function public.admin_guard_target(uuid) from public;
revoke execute on function public.admin_set_user_block(uuid, boolean, text) from public;
revoke execute on function public.admin_set_user_trust(uuid, public.trust_level, text) from public;
revoke execute on function public.admin_set_user_role(uuid, public.user_role) from public;
revoke execute on function public.admin_set_age_check(uuid, boolean, text) from public;
revoke execute on function public.confirm_my_age(date) from public;
revoke execute on function public.admin_save_category(uuid, text, text, integer) from public;
revoke execute on function public.admin_delete_category(uuid) from public;
revoke execute on function public.admin_save_skill(uuid, text, text) from public;
revoke execute on function public.admin_delete_skill(uuid) from public;
revoke execute on function public.admin_list_taxonomy() from public;
revoke execute on function public.admin_list_audit(integer, integer) from public;
revoke execute on function public.admin_overview() from public;

-- is_admin is used inside RLS policies, so both roles need it.
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.create_report(public.report_target, uuid, public.report_reason, text) to authenticated;
grant execute on function public.confirm_my_age(date) to authenticated;
grant execute on function public.admin_list_ideas(public.idea_status, text, integer, integer) to authenticated;
grant execute on function public.admin_moderate_idea(uuid, text, text) to authenticated;
grant execute on function public.admin_list_reports(public.report_status, integer, integer) to authenticated;
grant execute on function public.admin_resolve_report(uuid, public.report_status, text) to authenticated;
grant execute on function public.admin_list_users(text, text, integer, integer) to authenticated;
grant execute on function public.admin_get_user(uuid) to authenticated;
grant execute on function public.admin_set_user_block(uuid, boolean, text) to authenticated;
grant execute on function public.admin_set_user_trust(uuid, public.trust_level, text) to authenticated;
grant execute on function public.admin_set_user_role(uuid, public.user_role) to authenticated;
grant execute on function public.admin_set_age_check(uuid, boolean, text) to authenticated;
grant execute on function public.admin_save_category(uuid, text, text, integer) to authenticated;
grant execute on function public.admin_delete_category(uuid) to authenticated;
grant execute on function public.admin_save_skill(uuid, text, text) to authenticated;
grant execute on function public.admin_delete_skill(uuid) to authenticated;
grant execute on function public.admin_list_taxonomy() to authenticated;
grant execute on function public.admin_list_audit(integer, integer) to authenticated;
grant execute on function public.admin_overview() to authenticated;
