-- =============================================================================
-- MONEX Academy — owner decision 16. 11. 2026: admin two-step check by EMAIL CODE
-- (simpler than an authenticator app). Replaces 20261117000002_admin_mfa_optional.
--
-- Flow:
--   1. The server (with the Supabase secret key) calls issue_admin_email_code()
--      for the signed-in admin's current session and emails the 6-digit code.
--      The code is never returned to the browser or to the 'authenticated' role.
--   2. The admin types the code; verify_admin_email_code() marks THIS session
--      (JWT claim session_id) as verified for 30 days.
--   3. is_admin() passes for an admin whose session is verified by email code,
--      or whose session passed an authenticator app (aal2).
-- Run after 20261117000001_admin.sql (and 20261117000002 if it was run).
-- =============================================================================

create table public.admin_email_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  session_id uuid not null,
  code_hash bytea not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index admin_email_codes_user_idx on public.admin_email_codes (user_id, created_at desc);

create table public.admin_step_ups (
  user_id uuid not null references public.profiles (id) on delete cascade,
  session_id uuid not null,
  verified_until timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (user_id, session_id)
);

alter table public.admin_email_codes enable row level security;
alter table public.admin_step_ups enable row level security;
-- No policies and no grants: only the functions below touch these tables.

-- Session id of the caller's current login (Supabase puts it in the JWT).
create or replace function public.current_session_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'session_id', '')::uuid;
$$;

-- Admin check: active admin AND (authenticator app passed OR email code verified for this session).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin' and deleted_at is null and is_blocked = false
    )
    and (
      coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      or exists (
        select 1 from public.admin_step_ups s
        where s.user_id = auth.uid()
          and s.session_id = public.current_session_id()
          and s.verified_until > now()
      )
    );
$$;

-- Called ONLY by the server with the secret key (service_role). Returns the code to email.
create or replace function public.issue_admin_email_code(p_user uuid, p_session uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if p_user is null or p_session is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = p_user and role = 'admin' and deleted_at is null and is_blocked = false
  ) then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  if (select count(*) from public.admin_email_codes
      where user_id = p_user and created_at > now() - interval '15 minutes') >= 5 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  -- Housekeeping: old codes and expired verifications.
  delete from public.admin_email_codes where user_id = p_user and created_at < now() - interval '1 day';
  delete from public.admin_step_ups where user_id = p_user and verified_until < now();
  -- Only the newest code works.
  update public.admin_email_codes set used_at = now()
  where user_id = p_user and session_id = p_session and used_at is null;

  -- 48 random bits from gen_random_uuid (strong RNG) -> 6 digits.
  v_code := lpad(
    (('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))::bit(48)::bigint % 1000000)::text,
    6, '0'
  );

  insert into public.admin_email_codes (user_id, session_id, code_hash, expires_at)
  values (p_user, p_session, sha256(convert_to(p_user::text || ':' || v_code, 'UTF8')), now() + interval '10 minutes');

  return v_code;
end;
$$;

-- Called by the signed-in admin. Returns 'ok', 'incorrect' or 'expired'
-- (a status, not an error, so failed attempts are counted and kept).
create or replace function public.verify_admin_email_code(p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_session uuid := public.current_session_id();
  v_row public.admin_email_codes%rowtype;
begin
  if v_uid is null or v_session is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  select * into v_row
  from public.admin_email_codes
  where user_id = v_uid and session_id = v_session and used_at is null and expires_at > now()
  order by created_at desc
  limit 1
  for update;

  if not found or v_row.attempts >= 5 then
    return 'expired';
  end if;

  if v_row.code_hash <> sha256(convert_to(v_uid::text || ':' || coalesce(btrim(p_code), ''), 'UTF8')) then
    update public.admin_email_codes set attempts = attempts + 1 where id = v_row.id;
    return 'incorrect';
  end if;

  update public.admin_email_codes set used_at = now() where id = v_row.id;
  insert into public.admin_step_ups (user_id, session_id, verified_until)
  values (v_uid, v_session, now() + interval '30 days')
  on conflict (user_id, session_id) do update set verified_until = excluded.verified_until;

  perform public.log_action('admin.email_verified', 'profile', v_uid, '{}'::jsonb);
  return 'ok';
end;
$$;

revoke execute on function public.current_session_id() from public;
revoke execute on function public.issue_admin_email_code(uuid, uuid) from public;
revoke execute on function public.verify_admin_email_code(text) from public;
grant execute on function public.current_session_id() to anon, authenticated;
grant execute on function public.issue_admin_email_code(uuid, uuid) to service_role;
grant execute on function public.verify_admin_email_code(text) to authenticated;

-- Hardening: Supabase can grant EXECUTE on new functions to anon/authenticated
-- by default. Internal helpers must never be callable from the browser.
revoke execute on function public.issue_admin_email_code(uuid, uuid) from anon, authenticated;
revoke execute on function public.log_action(text, text, uuid, jsonb) from anon, authenticated;
revoke execute on function public.refresh_trust_level(uuid) from anon, authenticated;
revoke execute on function public.admin_guard_target(uuid) from anon, authenticated;
revoke execute on function public.require_admin() from anon, authenticated;
revoke execute on function public.purge_deleted_accounts() from anon, authenticated;
revoke execute on function public.bump_idea_saves() from anon, authenticated;
revoke execute on function public.ideas_before_write() from anon, authenticated;
