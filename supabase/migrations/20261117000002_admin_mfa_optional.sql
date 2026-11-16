-- SUPERSEDED by 20261117000004_admin_no_second_step.sql. Do not run; kept as history.
-- =============================================================================
-- MONEX Academy — owner decision 16. 11. 2026: 2FA is optional for the admin
-- for now (Master Prompt 4.3 asks for it to be mandatory; to be turned back on
-- before launch).
--
-- Rule now: an active admin passes when the session is aal2, OR when the admin
-- has no verified 2FA factor at all. If the admin has turned 2FA on, a session
-- that hasn't passed it is still refused.
-- Run after 20261117000001_admin.sql.
-- =============================================================================

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
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = auth.uid() and f.status = 'verified'
      )
    );
$$;
