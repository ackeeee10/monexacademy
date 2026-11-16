// Security and behaviour tests for the admin migration, run against a throwaway local Postgres 17.
// Usage (as a non-root user, outside the app): npm i embedded-postgres@17 pg, then
//   node admin.test.mjs <accounts.sql> <ideas.sql> <admin.sql> <seed.sql> <seed-ideas.sql> <empty-data-dir> \
//     <admin_mfa_optional.sql> <admin_email_code.sql>
// Follow-up migrations are applied in the given order. Production chain today:
//   ... <empty-data-dir> 20261117000004_admin_no_second_step.sql
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import fs from "node:fs";

const [,, accountsPath, ideasPath, adminPath, seedPath, seedIdeasPath, dataDir, ...followUps] = process.argv;
const db = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: "pw", port: 54331, persistent: false });
await db.initialise();
await db.start();
const c = new pg.Client({ host: "localhost", port: 54331, user: "postgres", password: "pw", database: "postgres" });
await c.connect();

await c.query(`
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, encrypted_password text,
  raw_user_meta_data jsonb default '{}', banned_until timestamptz);
create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid, status text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant execute on function auth.jwt() to anon, authenticated;
`);
await c.query(fs.readFileSync(accountsPath, "utf8").split("create extension if not exists pg_cron")[0]);
await c.query(fs.readFileSync(seedPath, "utf8"));
await c.query(fs.readFileSync(ideasPath, "utf8"));
await c.query(fs.readFileSync(seedIdeasPath, "utf8"));
await c.query(fs.readFileSync(adminPath, "utf8"));
for (const f of followUps) await c.query(fs.readFileSync(f, "utf8"));
const EMAIL_CODE = followUps.some((f) => f.includes("admin_email_code"));
const NO_SECOND_STEP = followUps.some((f) => f.includes("admin_no_second_step"));
const enableMfa = async (uid) => { await owner(); await c.query("insert into auth.mfa_factors (user_id, status) values ($1,'verified')", [uid]); };

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await c.query("begin"); await fn(); pass++; console.log("PASS", name); }
  catch (e) { fail++; console.log("FAIL", name, "-", e.message); }
  finally { await c.query("rollback"); }
}
async function expectErr(fn, msg) {
  await c.query("savepoint e");
  try { await fn(); } catch (e) {
    await c.query("rollback to savepoint e");
    if (!e.message.includes(msg)) throw new Error(`expected "${msg}", got "${e.message}"`);
    return;
  }
  await c.query("rollback to savepoint e");
  throw new Error(`expected error "${msg}"`);
}
const SESSION_A = "11111111-1111-4111-8111-111111111111";
const SESSION_B = "22222222-2222-4222-8222-222222222222";
const as = async (role, uid, aal = "aal1", session = SESSION_A) => {
  await c.query("reset role");
  await c.query(`set local role ${role}`);
  await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ""]);
  await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid ?? null, aal, session_id: session })]);
};
const owner = () => c.query("reset role");
const newUser = async () => {
  await owner();
  return (await c.query("insert into auth.users (email, encrypted_password, raw_user_meta_data) values ($1,'x',$2) returning id",
    [`u${Math.random()}@x.com`, { birth_date: "1990-01-01", terms_accepted: "true" }])).rows[0].id;
};
const cat = (await c.query("select id from public.categories where slug='services'")).rows[0].id;
const skills = (await c.query("select array_agg(id) a from (select id from public.skills limit 2) s")).rows[0].a;
const makeUser = async (username) => {
  const id = await newUser();
  await as("authenticated", id);
  await c.query(`select public.complete_onboarding($1,null,false,'{idea_owner}','100_1000','online','solo','5_15',$2,$3)`,
    [username, [cat], skills]);
  return id;
};
const makeAdmin = async (username) => {
  const id = await makeUser(username);
  await owner();
  await c.query("update public.profiles set role='admin' where id=$1", [id]);
  return id;
};
const ideaData = (title = "Test idea") => JSON.stringify({
  title, short_description: "A short test description.", category_id: cat, investment_range: "0",
  earning_min: 1, earning_max: 10, difficulty: "easy", time_to_first_income: "1_4w", work_mode: "online",
  team_mode: "solo", looking_for_roles: [], skill_ids: [skills[0]], launch_plan: ["a1", "b2", "c3"],
});
const submitIdea = async (author, title) => {
  await as("authenticated", author);
  return (await c.query("select public.save_idea(null,$1::jsonb,true) id", [ideaData(title)])).rows[0].id;
};
const moderate = (id, action, note = null) => c.query("select public.admin_moderate_idea($1,$2,$3) s", [id, action, note]);

await t("anon and users cannot read reports or audit log", async () => {
  const u = await makeUser("plain1");
  await as("authenticated", u);
  await expectErr(() => c.query("select * from public.reports"), "permission denied");
  await expectErr(() => c.query("select * from public.audit_log"), "permission denied");
  await as("anon");
  await expectErr(() => c.query("select * from public.reports"), "permission denied");
});
await t("non-admin cannot call admin functions", async () => {
  const u = await makeUser("plain2");
  await as("authenticated", u, "aal2");
  await expectErr(() => c.query("select public.admin_overview()"), "not_admin");
  await expectErr(() => c.query("select public.admin_list_users(null,'all',10,0)"), "not_admin");
});
await t("admin without a second step: allowed only in no-second-step mode", async () => {
  const a = await makeAdmin("boss0");
  await as("authenticated", a, "aal1");
  if (NO_SECOND_STEP) await c.query("select public.admin_overview()");
  else await expectErr(() => c.query("select public.admin_overview()"), "not_admin");
});
await t("admin with 2FA turned on is refused until the session passes it", async () => {
  const a = await makeAdmin("boss1");
  await enableMfa(a);
  await as("authenticated", a, "aal1");
  await expectErr(() => c.query("select public.admin_overview()"), "not_admin");
  await as("authenticated", a, "aal2");
  const o = (await c.query("select public.admin_overview() o")).rows[0].o;
  if (typeof o.pending_ideas !== "number") throw new Error(JSON.stringify(o));
});
await t("anon cannot execute admin functions at all", async () => {
  await as("anon");
  await expectErr(() => c.query("select public.admin_overview()"), "permission denied");
});
await t("admin sees pending queue and approves; idea becomes public", async () => {
  const author = await makeUser("writer1");
  const id = await submitIdea(author, "Pending one");
  const a = await makeAdmin("boss2");
  await as("authenticated", a, "aal2");
  const list = (await c.query("select public.admin_list_ideas('pending',null,10,0) l")).rows[0].l;
  if (!list.items.some((x) => x.id === id)) throw new Error("not in queue");
  const full = (await c.query("select public.get_idea_full($1) f", [id])).rows[0].f;
  if (!full || full.launch_plan.length !== 3) throw new Error("admin cannot read locked content");
  await moderate(id, "approve");
  await as("anon");
  const vis = await c.query("select id from public.ideas where id=$1", [id]);
  if (vis.rows.length !== 1) throw new Error("not public after approve");
  await owner();
  const log = await c.query("select actor_id from public.audit_log where action='idea.approve' and target_id=$1", [id]);
  if (log.rows[0]?.actor_id !== a) throw new Error("audit missing");
});
await t("admin without 2FA cannot read others' pending ideas", async () => {
  const author = await makeUser("writer2");
  const id = await submitIdea(author, "Hidden pending");
  const a = await makeAdmin("boss3");
  await enableMfa(a);
  await as("authenticated", a, "aal1");
  if ((await c.query("select id from public.ideas where id=$1", [id])).rows.length) throw new Error("visible");
  if ((await c.query("select public.get_idea_full($1) f", [id])).rows[0].f !== null) throw new Error("locked leaked");
});
await t("admin never sees drafts", async () => {
  const author = await makeUser("writer3");
  await as("authenticated", author);
  const id = (await c.query("select public.save_idea(null,$1::jsonb,false) id", [ideaData("Draft")])).rows[0].id;
  const a = await makeAdmin("boss4");
  await as("authenticated", a, "aal2");
  if ((await c.query("select id from public.ideas where id=$1", [id])).rows.length) throw new Error("draft visible");
  await expectErr(() => moderate(id, "approve"), "idea_not_found");
});
await t("reject and request changes need a note; wrong state refused", async () => {
  const author = await makeUser("writer4");
  const id = await submitIdea(author, "Needs note");
  const a = await makeAdmin("boss5");
  await as("authenticated", a, "aal2");
  await expectErr(() => moderate(id, "reject", "  "), "note_required");
  await expectErr(() => moderate(id, "hide"), "invalid_state");
  await moderate(id, "request_changes", "Add more steps");
  await expectErr(() => moderate(id, "approve"), "invalid_state");
  await as("authenticated", author);
  const f = (await c.query("select public.get_idea_full($1) f", [id])).rows[0].f;
  if (f.moderation_note !== "Add more steps") throw new Error("author can't see note");
  // Author edits and resubmits -> pending again, note cleared.
  await c.query("select public.save_idea($1,$2::jsonb,true)", [id, ideaData("Needs note v2")]);
  await owner();
  const st = (await c.query("select status, moderation_note from public.ideas where id=$1", [id])).rows[0];
  if (st.status !== "pending" || st.moderation_note !== null) throw new Error(JSON.stringify(st));
});
await t("hide and restore an approved idea", async () => {
  const author = await makeUser("writer5");
  const id = await submitIdea(author, "Hide me");
  const a = await makeAdmin("boss6");
  await as("authenticated", a, "aal2");
  await moderate(id, "approve");
  await moderate(id, "hide", "Reported scam");
  await as("anon");
  if ((await c.query("select id from public.ideas where id=$1", [id])).rows.length) throw new Error("hidden still public");
  await as("authenticated", a, "aal2");
  await moderate(id, "restore");
  await as("anon");
  if (!(await c.query("select id from public.ideas where id=$1", [id])).rows.length) throw new Error("not restored");
});
await t("third approval promotes author to trusted", async () => {
  const author = await makeUser("writer6");
  const ids = [await submitIdea(author, "One"), await submitIdea(author, "Two"), await submitIdea(author, "Three")];
  const a = await makeAdmin("boss7");
  await as("authenticated", a, "aal2");
  await moderate(ids[0], "approve");
  await moderate(ids[1], "approve");
  await owner();
  if ((await c.query("select trust_level from public.profiles where id=$1", [author])).rows[0].trust_level !== "new") throw new Error("too early");
  await as("authenticated", a, "aal2");
  await moderate(ids[2], "approve");
  await owner();
  if ((await c.query("select trust_level from public.profiles where id=$1", [author])).rows[0].trust_level !== "trusted") throw new Error("not promoted");
});
await t("a rejection in the last 30 days blocks promotion", async () => {
  const author = await makeUser("writer7");
  const ids = [];
  for (const n of ["Alpha one", "Alpha two", "Alpha three", "Alpha four"]) ids.push(await submitIdea(author, n));
  const a = await makeAdmin("boss8");
  await as("authenticated", a, "aal2");
  await moderate(ids[0], "reject", "No");
  for (const id of ids.slice(1)) await moderate(id, "approve");
  await owner();
  if ((await c.query("select trust_level from public.profiles where id=$1", [author])).rows[0].trust_level !== "new") throw new Error("promoted despite rejection");
});
await t("manual trust level is not overridden by automatic promotion", async () => {
  const author = await makeUser("writer8");
  const ids = [];
  for (const n of ["Beta one", "Beta two", "Beta three"]) ids.push(await submitIdea(author, n));
  const a = await makeAdmin("boss9");
  await as("authenticated", a, "aal2");
  await c.query("select public.admin_set_user_trust($1,'new','Watch closely')", [author]);
  for (const id of ids) await moderate(id, "approve");
  await owner();
  if ((await c.query("select trust_level from public.profiles where id=$1", [author])).rows[0].trust_level !== "new") throw new Error("overridden");
});
await t("users report ideas and profiles; duplicates ignored; self-report refused", async () => {
  const u = await makeUser("reporter1");
  const target = await makeUser("target1");
  const idea = (await c.query("select id from public.ideas where slug='niche-directory-website'")).rows[0].id;
  await as("authenticated", u);
  await c.query("select public.create_report('idea',$1,'scam','Looks fake')", [idea]);
  await c.query("select public.create_report('idea',$1,'scam','Again')", [idea]);
  await c.query("select public.create_report('profile',$1,'suspected_minor',null)", [target]);
  await expectErr(() => c.query("select public.create_report('profile',$1,'spam',null)", [u]), "cannot_report_self");
  await expectErr(() => c.query("select public.create_report('profile',gen_random_uuid(),'spam',null)"), "target_not_found");
  await owner();
  const n = (await c.query("select count(*)::int n from public.reports where reporter_id=$1", [u])).rows[0].n;
  if (n !== 2) throw new Error("reports " + n);
});
await t("cannot report a pending idea; anon cannot report", async () => {
  const author = await makeUser("writer9");
  const id = await submitIdea(author, "Not yet");
  const u = await makeUser("reporter2");
  await as("authenticated", u);
  await expectErr(() => c.query("select public.create_report('idea',$1,'spam',null)", [id]), "target_not_found");
  await as("anon");
  await expectErr(() => c.query("select public.create_report('idea',$1,'spam',null)", [id]), "permission denied");
});
await t("admin lists and resolves reports", async () => {
  const u = await makeUser("reporter3");
  const target = await makeUser("target3");
  await as("authenticated", u);
  await c.query("select public.create_report('profile',$1,'spam','Spam links')", [target]);
  const a = await makeAdmin("boss10");
  await as("authenticated", a, "aal2");
  const list = (await c.query("select public.admin_list_reports('open',10,0) l")).rows[0].l;
  const r = list.items.find((x) => x.target_id === target);
  if (!r || r.target.username !== "target3" || r.reporter_username !== "reporter3") throw new Error(JSON.stringify(list));
  await c.query("select public.admin_resolve_report($1,'dismissed','Not spam')", [r.id]);
  await expectErr(() => c.query("select public.admin_resolve_report($1,'resolved',null)", [r.id]), "invalid_state");
});
await t("blocking hides the user, bans login, and stops posting", async () => {
  const target = await makeUser("baduser1");
  const ideaId = await submitIdea(target, "Bad idea");
  const a = await makeAdmin("boss11");
  await as("authenticated", a, "aal2");
  await moderate(ideaId, "approve");
  await expectErr(() => c.query("select public.admin_set_user_block($1,true,'')", [target]), "note_required");
  await c.query("select public.admin_set_user_block($1,true,'Scams')", [target]);
  await as("anon");
  if ((await c.query("select id from public.profiles where id=$1", [target])).rows.length) throw new Error("profile visible");
  if ((await c.query("select id from public.ideas where id=$1", [ideaId])).rows.length) throw new Error("idea visible");
  await owner();
  const b = (await c.query("select banned_until from auth.users where id=$1", [target])).rows[0].banned_until;
  if (b === null) throw new Error("not banned in auth");
  await as("authenticated", target);
  await expectErr(() => c.query("select public.save_idea(null,$1::jsonb,true)", [ideaData("More")]), "profile_not_ready");
  await as("authenticated", a, "aal2");
  await c.query("select public.admin_set_user_block($1,false,null)", [target]);
  await owner();
  if ((await c.query("select banned_until from auth.users where id=$1", [target])).rows[0].banned_until !== null) throw new Error("ban not lifted");
});
await t("admin cannot target self or other admins, nor grant admin", async () => {
  const a = await makeAdmin("boss12");
  const b = await makeAdmin("boss13");
  const u = await makeUser("normal12");
  await as("authenticated", a, "aal2");
  await expectErr(() => c.query("select public.admin_set_user_block($1,true,'x')", [a]), "cannot_target_self");
  await expectErr(() => c.query("select public.admin_set_user_block($1,true,'x')", [b]), "cannot_target_admin");
  await expectErr(() => c.query("select public.admin_set_user_role($1,'admin')", [u]), "cannot_target_admin");
  await c.query("select public.admin_set_user_role($1,'moderator')", [u]);
});
await t("age check hides the account until the user confirms 18+", async () => {
  const u = await makeUser("young1");
  const a = await makeAdmin("boss14");
  await as("authenticated", a, "aal2");
  await c.query("select public.admin_set_age_check($1,true,'Reported as minor')", [u]);
  await as("anon");
  if ((await c.query("select id from public.profiles where id=$1", [u])).rows.length) throw new Error("visible");
  await as("authenticated", u);
  const acct = (await c.query("select public.get_my_account() a")).rows[0].a;
  if (acct.age_check_required !== true) throw new Error("flag missing in account");
  await expectErr(() => c.query("select public.confirm_my_age('2012-01-01')"), "must_be_18");
  await c.query("select public.confirm_my_age('1995-05-05')");
  await expectErr(() => c.query("select public.confirm_my_age('1995-05-05')"), "not_required");
  await as("anon");
  if (!(await c.query("select id from public.profiles where id=$1", [u])).rows.length) throw new Error("still hidden");
});
await t("user search finds by username and email; filters work", async () => {
  const u = await makeUser("findme_x");
  const a = await makeAdmin("boss15");
  await as("authenticated", a, "aal2");
  const r = (await c.query("select public.admin_list_users('findme',null,10,0) l")).rows[0].l;
  if (r.total !== 1 || r.items[0].id !== u || !r.items[0].email) throw new Error(JSON.stringify(r));
  const pct = (await c.query("select public.admin_list_users('%',null,10,0) l")).rows[0].l;
  if (pct.total !== 0) throw new Error("wildcard not escaped");
  const staff = (await c.query("select public.admin_list_users(null,'staff',100,0) l")).rows[0].l;
  if (!staff.items.some((x) => x.id === a)) throw new Error("staff filter");
  const detail = (await c.query("select public.admin_get_user($1) d", [u])).rows[0].d;
  if (detail.username !== "findme_x") throw new Error("detail");
});
await t("categories and skills: create, rename, refuse delete when in use", async () => {
  const a = await makeAdmin("boss16");
  await as("authenticated", a, "aal2");
  const id = (await c.query("select public.admin_save_category(null,'Education','education',70) id")).rows[0].id;
  await expectErr(() => c.query("select public.admin_save_category(null,'Dup','education',1)"), "slug_taken");
  await c.query("select public.admin_save_category($1,'Education & tutoring','education',70)", [id]);
  await c.query("select public.admin_delete_category($1)", [id]);
  const used = (await c.query("select id from public.categories where slug='services'")).rows[0].id;
  await expectErr(() => c.query("select public.admin_delete_category($1)", [used]), "in_use");
  const sk = (await c.query("select public.admin_save_skill(null,'Pottery','pottery') id")).rows[0].id;
  await c.query("select public.admin_delete_skill($1)", [sk]);
  await expectErr(() => c.query("select public.admin_delete_skill($1)", [skills[0]]), "in_use");
  const tax = (await c.query("select public.admin_list_taxonomy() t")).rows[0].t;
  if (!tax.categories.length || !tax.skills.length) throw new Error("taxonomy");
  const audit = (await c.query("select public.admin_list_audit(50,0) a")).rows[0].a;
  if (!audit.items.some((x) => x.action === "category.delete")) throw new Error("audit");
});
await t("users cannot change age_check_required or trust_manual themselves", async () => {
  const u = await makeUser("sneaky1");
  await as("authenticated", u);
  await expectErr(() => c.query("update public.profiles set age_check_required=false where id=$1", [u]), "permission denied");
  await expectErr(() => c.query("update public.profiles set trust_manual=true where id=$1", [u]), "permission denied");
});


if (EMAIL_CODE && !NO_SECOND_STEP) {
  const issue = async (uid, session = SESSION_A) => {
    await as("service_role", null);
    return (await c.query("select public.issue_admin_email_code($1,$2) code", [uid, session])).rows[0].code;
  };
  const verify = async (code) => (await c.query("select public.verify_admin_email_code($1) r", [code])).rows[0].r;

  await t("email code: correct code verifies only this session", async () => {
    const a = await makeAdmin("mail1");
    const code = await issue(a);
    if (!/^\d{6}$/.test(code)) throw new Error("bad code " + code);
    await as("authenticated", a, "aal1", SESSION_A);
    await expectErr(() => c.query("select public.admin_overview()"), "not_admin");
    if ((await verify(code)) !== "ok") throw new Error("not ok");
    await c.query("select public.admin_overview()");
    if ((await verify(code)) !== "expired") throw new Error("code reusable");
    await as("authenticated", a, "aal1", SESSION_B);
    await expectErr(() => c.query("select public.admin_overview()"), "not_admin");
  });
  await t("email code: wrong codes are counted; 5 wrong attempts burn the code", async () => {
    const a = await makeAdmin("mail2");
    const code = await issue(a);
    const wrong = code === "000000" ? "111111" : "000000";
    await as("authenticated", a);
    for (let i = 0; i < 5; i++) if ((await verify(wrong)) !== "incorrect") throw new Error("attempt " + i);
    if ((await verify(code)) !== "expired") throw new Error("not burned");
  });
  await t("email code: only the newest code works; expired codes fail", async () => {
    const a = await makeAdmin("mail3");
    const first = await issue(a);
    const second = await issue(a);
    await as("authenticated", a);
    if (first !== second && (await verify(first)) === "ok") throw new Error("old code worked");
    await owner();
    await c.query("update public.admin_email_codes set expires_at = now() - interval '1 minute' where user_id=$1", [a]);
    await as("authenticated", a);
    if ((await verify(second)) !== "expired") throw new Error("expired code worked");
  });
  await t("email code: users and anon cannot issue codes; non-admins get none", async () => {
    const a = await makeAdmin("mail4");
    const u = await makeUser("mail5");
    await as("authenticated", a);
    await expectErr(() => c.query("select public.issue_admin_email_code($1,$2)", [a, SESSION_A]), "permission denied");
    await as("anon");
    await expectErr(() => c.query("select public.issue_admin_email_code($1,$2)", [a, SESSION_A]), "permission denied");
    await as("service_role", null);
    await expectErr(() => c.query("select public.issue_admin_email_code($1,$2)", [u, SESSION_A]), "not_admin");
  });
  await t("email code: at most 5 codes per 15 minutes", async () => {
    const a = await makeAdmin("mail6");
    for (let i = 0; i < 5; i++) await issue(a);
    await as("service_role", null);
    await expectErr(() => c.query("select public.issue_admin_email_code($1,$2)", [a, SESSION_A]), "rate_limited");
  });
}

await t("internal helpers are not callable by users", async () => {
  const u = await makeUser("mail7");
  await as("authenticated", u);
  await expectErr(() => c.query("select public.log_action('x.y','t',null,'{}')"), "permission denied");
  await expectErr(() => c.query("select public.refresh_trust_level($1)", [u]), "permission denied");
});

console.log(`\n${pass} passed, ${fail} failed`);
await c.end();
await db.stop();
process.exit(fail ? 1 : 0);
