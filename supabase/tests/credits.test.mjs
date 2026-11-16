// Tests for the credits migration (Phase 5A), run against a throwaway local Postgres 17.
// Usage (as a non-root user, outside the app): npm i embedded-postgres@17 pg, then
//   node credits.test.mjs <migrations-dir> <seed.sql> <seed-ideas.sql> <empty-data-dir>
// Applies the production chain: accounts, ideas, admin, admin_no_second_step, credits.
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";

const [,, dir, seedPath, seedIdeasPath, dataDir] = process.argv;
const db = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: "pw", port: 54332, persistent: false });
await db.initialise();
await db.start();
const c = new pg.Client({ host: "localhost", port: 54332, user: "postgres", password: "pw", database: "postgres" });
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
const mig = (f) => fs.readFileSync(path.join(dir, f), "utf8");
await c.query(mig("20261111000001_accounts.sql").split("create extension if not exists pg_cron")[0]);
await c.query(fs.readFileSync(seedPath, "utf8"));
await c.query(mig("20261116000001_ideas.sql"));
await c.query(fs.readFileSync(seedIdeasPath, "utf8"));
await c.query(mig("20261117000001_admin.sql"));
await c.query(mig("20261117000004_admin_no_second_step.sql"));
// One account that exists before credits launch, to check the backfill.
const early = (await c.query("insert into auth.users (email, encrypted_password, raw_user_meta_data) values ('early@x.com','x',$1) returning id",
  [{ birth_date: "1990-01-01", terms_accepted: "true" }])).rows[0].id;
await c.query(mig("20261118000001_credits.sql"));

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
    return e;
  }
  await c.query("rollback to savepoint e");
  throw new Error(`expected error "${msg}"`);
}
const owner = () => c.query("reset role");
const as = async (role, uid, aal = "aal1") => {
  await owner();
  await c.query(`set local role ${role}`);
  await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ""]);
  await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid ?? null, aal })]);
};
const cat = (await c.query("select id from public.categories where slug='services'")).rows[0].id;
const skill = (await c.query("select id from public.skills limit 1")).rows[0].id;
const makeUser = async (username, plan = "free") => {
  await owner();
  const id = (await c.query("insert into auth.users (email, encrypted_password, raw_user_meta_data) values ($1,'x',$2) returning id",
    [`${username}@x.com`, { birth_date: "1990-01-01", terms_accepted: "true" }])).rows[0].id;
  await as("authenticated", id);
  await c.query(`select public.complete_onboarding($1,null,false,'{idea_owner}','100_1000','online','solo','5_15',$2,$3)`, [username, [cat], [skill]]);
  if (plan !== "free") { await owner(); await c.query("update public.profiles set plan=$2 where id=$1", [id, plan]); }
  return id;
};
const total = async (uid) => { await owner(); return (await c.query("select public.credit_total($1) n", [uid])).rows[0].n; };
const setBalance = async (uid, sub, pur, earn) => {
  await owner();
  await c.query("update public.credit_balances set subscription_credits=$2, purchased_credits=$3, earned_credits=$4 where user_id=$1", [uid, sub, pur, earn]);
};
const ideaJson = (title) => JSON.stringify({
  title, short_description: "A short test description.", category_id: cat, investment_range: "0",
  earning_min: 1, earning_max: 10, difficulty: "easy", time_to_first_income: "1_4w", work_mode: "online",
  team_mode: "solo", looking_for_roles: [], skill_ids: [skill], launch_plan: ["Step one", "Step two", "Step three"],
});
const submit = async (uid, title, payExtra = false, id = null) => {
  await as("authenticated", uid);
  return (await c.query("select public.save_idea($1,$2::jsonb,true,$3) id", [id, ideaJson(title), payExtra])).rows[0].id;
};
const approve = async (id) => { await owner(); await c.query("update public.ideas set status='approved' where id=$1", [id]); };
const monexIdea = (await c.query("select id from public.ideas where slug='niche-directory-website'")).rows[0].id;
const unlock = async (uid, id, max = 5) => { await as("authenticated", uid); return (await c.query("select public.unlock_idea($1,$2) r", [id, max])).rows[0].r; };

await t("signup bonus: new and existing accounts get 10 credits once", async () => {
  const u = await makeUser("bonus1");
  if ((await total(u)) !== 10) throw new Error("new " + (await total(u)));
  if ((await total(early)) !== 10) throw new Error("backfill " + (await total(early)));
  const n = (await c.query("select count(*)::int n from public.credit_transactions where user_id=$1 and reason='signup_bonus'", [early])).rows[0].n;
  if (n !== 1) throw new Error("bonus rows " + n);
});
await t("users read only their own balance and cannot change it", async () => {
  const a = await makeUser("own1");
  const b = await makeUser("own2");
  await as("authenticated", a);
  const rows = (await c.query("select user_id from public.credit_balances")).rows;
  if (rows.length !== 1 || rows[0].user_id !== a) throw new Error("saw others");
  await expectErr(() => c.query("update public.credit_balances set purchased_credits=999 where user_id=$1", [a]), "permission denied");
  await expectErr(() => c.query("insert into public.credit_transactions (user_id,delta,bucket,reason,balance_after) values ($1,5,'purchased','purchase',5)", [a]), "permission denied");
  await expectErr(() => c.query("select public.grant_credits($1,'purchased',100,'purchase',null,null,null)", [a]), "permission denied");
  await expectErr(() => c.query("select public.spend_credits($1,1,'unlock_idea',null,null,null)", [b]), "permission denied");
  await as("anon");
  await expectErr(() => c.query("select * from public.credit_balances"), "permission denied");
  const prices = (await c.query("select credits from public.credit_prices where action='unlock_idea'")).rows[0].credits;
  if (prices !== 5) throw new Error("public prices");
});
await t("unlock: 5 credits, author earns 2, content opens, second unlock is free", async () => {
  const author = await makeUser("writer1");
  const idea = await submit(author, "Paid idea");
  await approve(idea);
  const buyer = await makeUser("buyer1");
  await as("authenticated", buyer);
  if ((await c.query("select public.get_idea_full($1) f", [idea])).rows[0].f !== null) throw new Error("open before unlock");
  const r = await unlock(buyer, idea);
  if (r.status !== "unlocked" || r.balance !== 5) throw new Error(JSON.stringify(r));
  if ((await total(author)) !== 12) throw new Error("author " + (await total(author)));
  await as("authenticated", buyer);
  const f = (await c.query("select public.get_idea_full($1) f", [idea])).rows[0].f;
  if (!f || f.launch_plan.length !== 3) throw new Error("not opened");
  const again = await unlock(buyer, idea);
  if (again.status !== "already" || (await total(buyer)) !== 5) throw new Error("charged twice");
  await owner();
  if ((await c.query("select unlocks_count from public.ideas where id=$1", [idea])).rows[0].unlocks_count !== 1) throw new Error("count");
});
await t("unlock: MONEX Originals pay no creator share; own idea is never charged", async () => {
  const buyer = await makeUser("buyer2");
  const r = await unlock(buyer, monexIdea);
  if (r.status !== "unlocked" || (await total(buyer)) !== 5) throw new Error("monex");
  await owner();
  const shares = (await c.query("select count(*)::int n from public.credit_transactions where reason='creator_earning' and related_id=$1", [monexIdea])).rows[0].n;
  if (shares !== 0) throw new Error("share paid");
  const author = await makeUser("writer2");
  const idea = await submit(author, "Mine");
  await approve(idea);
  const mine = await unlock(author, idea);
  if (mine.status !== "already" || (await total(author)) !== 10) throw new Error("own charged");
});
await t("unlock: not enough credits or a changed price is refused and nothing changes", async () => {
  const buyer = await makeUser("buyer3");
  await setBalance(buyer, 0, 3, 0);
  await expectErr(() => unlock(buyer, monexIdea), "insufficient_credits");
  await expectErr(() => unlock(buyer, monexIdea, 4), "price_changed");
  await owner();
  if ((await c.query("select count(*)::int n from public.idea_unlocks where user_id=$1", [buyer])).rows[0].n !== 0) throw new Error("unlocked anyway");
  if ((await total(buyer)) !== 3) throw new Error("balance changed");
});
await t("unlock: pending ideas can't be unlocked", async () => {
  const author = await makeUser("writer3");
  const idea = await submit(author, "Still pending");
  const buyer = await makeUser("buyer4");
  await expectErr(() => unlock(buyer, idea), "idea_not_found");
});
await t("spending order: subscription, then purchased, then earned", async () => {
  const buyer = await makeUser("order1");
  await setBalance(buyer, 2, 2, 5);
  await unlock(buyer, monexIdea);
  await owner();
  const b = (await c.query("select * from public.credit_balances where user_id=$1", [buyer])).rows[0];
  if (b.subscription_credits !== 0 || b.purchased_credits !== 0 || b.earned_credits !== 4) throw new Error(JSON.stringify(b));
  const rows = (await c.query("select bucket, delta, balance_after from public.credit_transactions where user_id=$1 and reason='unlock_idea' order by balance_after desc", [buyer])).rows;
  if (rows.map((r) => `${r.bucket}:${r.delta}:${r.balance_after}`).join(",") !== "subscription:-2:7,purchased:-2:5,earned:-1:4") throw new Error(JSON.stringify(rows));
});
await t("free plan: 2 free posts, then 5 credits with consent; drafts and resubmits don't count", async () => {
  const u = await makeUser("poster1");
  await as("authenticated", u);
  await c.query("select public.save_idea(null,$1::jsonb,false,false)", [ideaJson("Just a draft")]);
  const first = await submit(u, "First post");
  await submit(u, "Second post");
  const e = await expectErr(() => submit(u, "Third post"), "post_limit_reached");
  if (e.detail !== "5") throw new Error("detail " + e.detail);
  // The old 3-argument function also refuses.
  await as("authenticated", u);
  await expectErr(() => c.query("select public.save_idea(null,$1::jsonb,true)", [ideaJson("Old path")]), "post_limit_reached");
  await submit(u, "Third post", true);
  if ((await total(u)) !== 5) throw new Error("not charged " + (await total(u)));
  // Resubmitting after changes requested is free.
  await owner();
  await c.query("update public.ideas set status='changes_requested' where id=$1", [first]);
  await submit(u, "First post v2", false, first);
  if ((await total(u)) !== 5) throw new Error("resubmit charged");
});
await t("extra post without enough credits fails and saves nothing", async () => {
  const u = await makeUser("poster2");
  await submit(u, "Post one");
  await submit(u, "Post two");
  await setBalance(u, 0, 2, 0);
  await expectErr(() => submit(u, "Post three", true), "insufficient_credits");
  await owner();
  const n = (await c.query("select count(*)::int n from public.ideas where author_id=$1", [u])).rows[0].n;
  if (n !== 2) throw new Error("saved anyway " + n);
});
await t("pro gets 10 posts a month; elite is unlimited", async () => {
  const pro = await makeUser("poster3", "pro");
  for (let i = 0; i < 10; i++) await submit(pro, `Pro post ${i + 1}`);
  await expectErr(() => submit(pro, "Pro post 11"), "post_limit_reached");
  // Last month's posts don't count.
  await owner();
  await c.query("update public.ideas set post_counted_at = date_trunc('month', now()) - interval '1 day' where author_id=$1", [pro]);
  await submit(pro, "Pro post next month");
  const elite = await makeUser("poster4", "elite");
  for (let i = 0; i < 12; i++) await submit(elite, `Elite post ${i + 1}`);
});
await t("feature: free plan pays 20; pro gets 1 free per month; lasts 7 days and stacks", async () => {
  const u = await makeUser("feat1");
  const idea = await submit(u, "Feature me");
  await approve(idea);
  await as("authenticated", u);
  await expectErr(() => c.query("select public.feature_idea($1,20)", [idea]), "insufficient_credits");
  await setBalance(u, 0, 30, 0);
  await as("authenticated", u);
  await expectErr(() => c.query("select public.feature_idea($1,0)", [idea]), "price_changed");
  const r = (await c.query("select public.feature_idea($1,20) r", [idea])).rows[0].r;
  if (r.cost !== 20 || r.balance !== 10) throw new Error(JSON.stringify(r));
  await owner();
  const days = (await c.query("select extract(day from is_featured_until - now())::int d from public.ideas where id=$1", [idea])).rows[0].d;
  if (days < 6 || days > 7) throw new Error("days " + days);

  const pro = await makeUser("feat2", "pro");
  const pIdea = await submit(pro, "Pro feature");
  await approve(pIdea);
  await as("authenticated", pro);
  const free = (await c.query("select public.feature_idea($1,0) r", [pIdea])).rows[0].r;
  if (free.cost !== 0) throw new Error("pro quota");
  await expectErr(() => c.query("select public.feature_idea($1,0)", [pIdea]), "price_changed");
  await owner();
  const d2 = (await c.query("select extract(day from is_featured_until - now())::int d from public.ideas where id=$1", [pIdea])).rows[0].d;
  if (d2 < 6) throw new Error("not featured");
});
await t("feature: only the author, only approved ideas", async () => {
  const u = await makeUser("feat3");
  const idea = await submit(u, "Pending feature");
  await as("authenticated", u);
  await expectErr(() => c.query("select public.feature_idea($1,20)", [idea]), "idea_not_found");
  const other = await makeUser("feat4");
  await approve(idea);
  await as("authenticated", other);
  await expectErr(() => c.query("select public.feature_idea($1,20)", [idea]), "idea_not_found");
});
await t("admin adjusts credits with a reason; non-admins can't", async () => {
  const u = await makeUser("adj1");
  const a = await makeUser("adj_admin");
  await owner();
  await c.query("update public.profiles set role='admin' where id=$1", [a]);
  await as("authenticated", u);
  await expectErr(() => c.query("select public.admin_adjust_credits($1,100,'x')", [u]), "not_admin");
  await as("authenticated", a);
  await expectErr(() => c.query("select public.admin_adjust_credits($1,100,'')", [u]), "note_required");
  const n = (await c.query("select public.admin_adjust_credits($1,40,'Beta tester') n", [u])).rows[0].n;
  if (n !== 50) throw new Error("grant " + n);
  await c.query("select public.admin_adjust_credits($1,-15,'Correction')", [u]);
  if ((await total(u)) !== 35) throw new Error("after remove");
  await as("authenticated", a);
  await expectErr(() => c.query("select public.admin_adjust_credits($1,-999,'Too much')", [u]), "insufficient_credits");
  const info = (await c.query("select public.admin_get_user_credits($1) i", [u])).rows[0].i;
  if (info.total !== 35 || info.transactions.length !== 3) throw new Error(JSON.stringify(info));
  const stats = (await c.query("select public.admin_credit_stats(30) s")).rows[0].s;
  if (!stats.by_reason.some((r) => r.reason === "admin_adjustment")) throw new Error("stats");
  await owner();
  if (!(await c.query("select 1 from public.audit_log where action='credits.adjust' and target_id=$1", [u])).rows.length) throw new Error("audit");
});
await t("wallet shows balance, history, prices and plan allowances", async () => {
  const u = await makeUser("wallet1");
  await unlock(u, monexIdea);
  await as("authenticated", u);
  const w = (await c.query("select public.get_my_wallet(10,0) w")).rows[0].w;
  if (w.total !== 5 || w.transactions_total !== 2 || w.prices.unlock_idea !== 5) throw new Error(JSON.stringify(w));
  if (w.posts.free_posts !== 2 || w.posts.next_cost !== 0 || w.featured.next_cost !== 20) throw new Error(JSON.stringify(w.posts));
  if (w.transactions[0].related_title !== "Niche directory website") throw new Error("title " + w.transactions[0].related_title);
  const acct = (await c.query("select public.get_my_account() a")).rows[0].a;
  if (acct.credits !== 5) throw new Error("account credits");
});
await t("ledger invariant: transactions add up to every balance", async () => {
  const bad = (await c.query(`
    select b.user_id from public.credit_balances b
    left join (select user_id, sum(delta) s from public.credit_transactions group by user_id) t using (user_id)
    where b.subscription_credits + b.purchased_credits + b.earned_credits <> coalesce(t.s, 0)`)).rows;
  if (bad.length) throw new Error("mismatch " + bad.length);
});

console.log(`\n${pass} passed, ${fail} failed`);
await c.end();
await db.stop();
process.exit(fail ? 1 : 0);
