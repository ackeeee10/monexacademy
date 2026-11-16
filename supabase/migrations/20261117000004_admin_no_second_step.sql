-- =============================================================================
-- MONEX Academy — owner decision 16. 11. 2026: NO second step for the admin
-- until after launch. Supersedes 20261117000002 and 20261117000003 (those do
-- not need to be run). Run after 20261117000001_admin.sql.
--
-- Rule: an active admin passes. If the admin turned on an authenticator app
-- in Settings, the session must still have passed it (aal2).
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

-- Hardening: Supabase can grant EXECUTE on new functions to anon/authenticated
-- by default. Internal helpers must never be callable from the browser.
revoke execute on function public.log_action(text, text, uuid, jsonb) from anon, authenticated;
revoke execute on function public.refresh_trust_level(uuid) from anon, authenticated;
revoke execute on function public.admin_guard_target(uuid) from anon, authenticated;
revoke execute on function public.require_admin() from anon, authenticated;
revoke execute on function public.purge_deleted_accounts() from anon, authenticated;
revoke execute on function public.bump_idea_saves() from anon, authenticated;
revoke execute on function public.ideas_before_write() from anon, authenticated;
