// Tests for the billing migration (Phase 5B), run against a throwaway local Postgres 17.
// Usage (as a non-root user, outside the app): npm i embedded-postgres@17 pg, then
//   node billing.test.mjs <migrations-dir> <seed.sql> <seed-ideas.sql> <empty-data-dir>
// Applies the production chain: accounts, ideas, admin, admin_no_second_step, credits, billing.
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";

const [,, dir, seedPath, seedIdeasPath, dataDir] = process.argv;
const db = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: "pw", port: 54333, persistent: false });
await db.initialise();
await db.start();
const c = new pg.Client({ host: "localhost", port: 54333, user: "postgres", password: "pw", database: "postgres" });
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
await c.query(mig("20261123000001_billing.sql"));

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


const svc = async () => { await owner(); await c.query("set local role service_role"); };
const sub = (uid, over = {}) => ({ id: "sub_1", customer_id: "cus_1", product_id: "p_pro_m", plan: "pro", interval: "month",
  status: "active", trial_end: null, current_period_start: "2026-11-01T00:00:00Z", current_period_end: "2026-12-01T00:00:00Z",
  cancel_at_period_end: false, ended_at: null, modified_at: "2026-11-01T00:00:00Z", ...over });
const upsert = async (uid, s) => { await svc(); return (await c.query("select public.billing_upsert_subscription($1,$2::jsonb) r", [uid, JSON.stringify(s)])).rows[0].r; };
const order = async (uid, o) => { await svc(); return (await c.query("select public.billing_apply_order($1,$2::jsonb) r", [uid, JSON.stringify(o)])).rows[0].r; };
const refund = async (id, cents, status) => { await svc(); return (await c.query("select public.billing_apply_refund($1,$2,$3) r", [id, cents, status])).rows[0].r; };
const profile = async (uid) => { await owner(); return (await c.query("select plan, plan_status, trial_used from public.profiles where id=$1", [uid])).rows[0]; };
const bal = async (uid) => { await owner(); return (await c.query("select subscription_credits s, purchased_credits p, earned_credits e from public.credit_balances where user_id=$1", [uid])).rows[0]; };

await t("credit pack: granted once even if the webhook repeats", async () => {
  const u = await makeUser("pack1");
  const o = { id: "ord_1", kind: "credits", product_key: "credits_150", credits: 150, amount_cents: 1299, currency: "usd", billing_reason: "purchase", status: "paid" };
  if ((await order(u, o)) !== "ok") throw new Error("first");
  if ((await order(u, o)) !== "duplicate") throw new Error("second");
  if ((await total(u)) !== 160) throw new Error("total " + (await total(u)));
  const b = await bal(u);
  if (b.p !== 160) throw new Error("bucket " + JSON.stringify(b));
});
await t("webhook events: recorded once, retried until processed", async () => {
  await svc();
  const rec = async () => (await c.query("select public.billing_record_event('evt_1','order.paid','{}'::jsonb) r")).rows[0].r;
  if (!(await rec())) throw new Error("first");
  if (!(await rec())) throw new Error("retry before finish should process");
  await c.query("select public.billing_finish_event('evt_1', null)");
  if (await rec()) throw new Error("processed twice");
  await owner();
  if ((await c.query("select attempts from public.webhook_events where provider_event_id='evt_1'")).rows[0].attempts !== 3) throw new Error("attempts");
});
await t("only the server can call billing functions; users read only their own billing rows", async () => {
  const u = await makeUser("sec1");
  const v = await makeUser("sec2");
  await order(u, { id: "ord_s", kind: "credits", product_key: "credits_50", credits: 50, amount_cents: 499, status: "paid" });
  await as("authenticated", u);
  await expectErr(() => c.query("select public.billing_apply_order($1,'{}'::jsonb)", [u]), "permission denied");
  await expectErr(() => c.query("select public.billing_upsert_subscription($1,'{}'::jsonb)", [u]), "permission denied");
  await expectErr(() => c.query("select public.billing_record_event('x','y','{}'::jsonb)"), "permission denied");
  await expectErr(() => c.query("select * from public.webhook_events"), "permission denied");
  await expectErr(() => c.query("insert into public.orders (user_id,provider_order_id,kind,product_key,status) values ($1,'x','credits','c','paid')", [u]), "permission denied");
  if ((await c.query("select id from public.orders")).rows.length !== 1) throw new Error("own orders");
  await as("authenticated", v);
  if ((await c.query("select id from public.orders")).rows.length !== 0) throw new Error("saw other orders");
  await as("anon");
  await expectErr(() => c.query("select public.get_my_billing()"), "permission denied");
});
await t("trial: Pro plan, 15 credits once, trial_used set", async () => {
  const u = await makeUser("trial1");
  await upsert(u, sub(u, { status: "trialing", trial_end: "2026-11-08T00:00:00Z" }));
  let p = await profile(u);
  if (p.plan !== "pro" || p.plan_status !== "trialing" || !p.trial_used) throw new Error(JSON.stringify(p));
  if ((await bal(u)).s !== 15) throw new Error("trial credits " + (await bal(u)).s);
  await upsert(u, sub(u, { status: "trialing", modified_at: "2026-11-02T00:00:00Z" }));
  if ((await bal(u)).s !== 15) throw new Error("granted twice");
  // $0 trial order gives nothing
  await order(u, { id: "ord_t0", kind: "subscription", product_key: "pro_month", plan: "pro", interval: "month", subscription_id: "sub_1", amount_cents: 0, billing_reason: "subscription_create", status: "paid" });
  if ((await bal(u)).s !== 15) throw new Error("zero order granted");
  // Trial converts: the first paid cycle swaps the trial credits for 60.
  await order(u, { id: "ord_t1", kind: "subscription", product_key: "pro_month", plan: "pro", interval: "month", subscription_id: "sub_1", amount_cents: 999, billing_reason: "subscription_cycle", status: "paid" });
  const b = await bal(u);
  if (b.s !== 60 || b.p !== 10) throw new Error("after convert " + JSON.stringify(b));
});
await t("a second subscription never gives trial credits again", async () => {
  const u = await makeUser("trial2");
  await upsert(u, sub(u, { id: "sub_a", status: "trialing" }));
  await upsert(u, sub(u, { id: "sub_a", status: "canceled", ended_at: "2026-11-05T00:00:00Z", modified_at: "2026-11-05T00:00:00Z" }));
  if ((await bal(u)).s !== 0 || (await profile(u)).plan !== "free") throw new Error("not ended");
  await upsert(u, sub(u, { id: "sub_b", status: "trialing", modified_at: "2026-11-06T00:00:00Z" }));
  if ((await bal(u)).s !== 0) throw new Error("second trial credits");
});
await t("monthly cycle: credits expire and renew; stale events are ignored", async () => {
  const u = await makeUser("cyc1");
  await upsert(u, sub(u, { id: "sub_c", plan: "elite", product_id: "p_el_m", modified_at: "2026-11-10T00:00:00Z" }));
  await order(u, { id: "ord_c1", kind: "subscription", product_key: "elite_month", plan: "elite", interval: "month", subscription_id: "sub_c", amount_cents: 2499, billing_reason: "subscription_create", status: "paid" });
  if ((await bal(u)).s !== 200) throw new Error("first " + (await bal(u)).s);
  await setBalance(u, 50, 10, 0);
  await order(u, { id: "ord_c2", kind: "subscription", product_key: "elite_month", plan: "elite", interval: "month", subscription_id: "sub_c", amount_cents: 2499, billing_reason: "subscription_cycle", status: "paid" });
  const b = await bal(u);
  if (b.s !== 200 || b.p !== 10) throw new Error("renew " + JSON.stringify(b));
  await owner();
  const exp = (await c.query("select delta from public.credit_transactions where user_id=$1 and reason='expiry'", [u])).rows;
  if (exp.length !== 1 || exp[0].delta !== -50) throw new Error("expiry row " + JSON.stringify(exp));
  // An older event arriving late must not undo the newer state.
  if ((await upsert(u, sub(u, { id: "sub_c", plan: "elite", status: "trialing", modified_at: "2026-11-01T00:00:00Z" }))) !== "stale") throw new Error("stale");
  if ((await profile(u)).plan_status !== "active") throw new Error("overwritten");
  // Mid-period plan change orders give no credits.
  await order(u, { id: "ord_c3", kind: "subscription", product_key: "elite_month", plan: "elite", interval: "month", subscription_id: "sub_c", amount_cents: 500, billing_reason: "subscription_update", status: "paid" });
  if ((await bal(u)).s !== 200) throw new Error("update granted");
});
await t("cancel at period end keeps the plan; revoke ends it and removes plan credits", async () => {
  const u = await makeUser("cancel1");
  await upsert(u, sub(u, { id: "sub_x" }));
  await order(u, { id: "ord_x", kind: "subscription", product_key: "pro_month", plan: "pro", interval: "month", subscription_id: "sub_x", amount_cents: 999, billing_reason: "subscription_create", status: "paid" });
  await upsert(u, sub(u, { id: "sub_x", cancel_at_period_end: true, modified_at: "2026-11-03T00:00:00Z" }));
  if ((await profile(u)).plan !== "pro" || (await bal(u)).s !== 60) throw new Error("ended early");
  await upsert(u, sub(u, { id: "sub_x", status: "canceled", ended_at: "2026-12-01T00:00:00Z", modified_at: "2026-12-01T00:00:00Z" }));
  const p = await profile(u);
  if (p.plan !== "free" || p.plan_status !== null) throw new Error(JSON.stringify(p));
  const b = await bal(u);
  if (b.s !== 0 || b.p !== 10) throw new Error("credits " + JSON.stringify(b));
});
await t("order before subscription event: placeholder row, plan set, credits granted", async () => {
  const u = await makeUser("early1");
  await order(u, { id: "ord_e", kind: "subscription", product_key: "pro_year", product_id: "p_pro_y", plan: "pro", interval: "year", subscription_id: "sub_e", amount_cents: 9990, billing_reason: "subscription_create", status: "paid" });
  if ((await profile(u)).plan !== "pro" || (await bal(u)).s !== 60) throw new Error("placeholder");
  await upsert(u, sub(u, { id: "sub_e", product_id: "p_pro_y", interval: "year", current_period_end: "2027-11-01T00:00:00Z" }));
  await owner();
  const n = (await c.query("select count(*)::int n from public.subscriptions where user_id=$1", [u])).rows[0].n;
  if (n !== 1) throw new Error("rows " + n);
});
await t("yearly plan: monthly top-up after a month, on read or spend, not before", async () => {
  const u = await makeUser("year1");
  await upsert(u, sub(u, { id: "sub_y", interval: "year", current_period_end: "2099-01-01T00:00:00Z" }));
  await order(u, { id: "ord_y", kind: "subscription", product_key: "pro_year", plan: "pro", interval: "year", subscription_id: "sub_y", amount_cents: 9990, billing_reason: "subscription_create", status: "paid" });
  await as("authenticated", u);
  await c.query("select public.refresh_my_credits()");
  if ((await bal(u)).s !== 60) throw new Error("early top-up");
  await setBalance(u, 7, 10, 0);
  await owner();
  await c.query("update public.credit_transactions set created_at = now() - interval '32 days' where user_id=$1 and reason='subscription_grant'", [u]);
  await as("authenticated", u);
  await c.query("select public.refresh_my_credits()");
  let b = await bal(u);
  if (b.s !== 60 || b.p !== 10) throw new Error("top-up " + JSON.stringify(b));
  await c.query("select public.refresh_my_credits()");
  if ((await bal(u)).s !== 60) throw new Error("double top-up");
  // Spending also triggers the top-up.
  await owner();
  await c.query("update public.credit_transactions set created_at = now() - interval '32 days' where user_id=$1 and reason='subscription_grant'", [u]);
  await setBalance(u, 0, 0, 0);
  const r = await unlock(u, monexIdea);
  if (r.status !== "unlocked" || (await bal(u)).s !== 55) throw new Error("spend top-up " + JSON.stringify(r) + JSON.stringify(await bal(u)));
});
await t("refund: removes the refunded share of a pack, never below zero, once", async () => {
  const u = await makeUser("ref1");
  await order(u, { id: "ord_r", kind: "credits", product_key: "credits_50", credits: 50, amount_cents: 500, status: "paid" });
  if ((await total(u)) !== 60) throw new Error("start");
  await refund("ord_r", 250, "partially_refunded");
  if ((await bal(u)).p !== 35) throw new Error("half " + (await bal(u)).p);
  await refund("ord_r", 250, "partially_refunded");
  if ((await bal(u)).p !== 35) throw new Error("repeat " + (await bal(u)).p);
  await setBalance(u, 0, 5, 3);
  await refund("ord_r", 500, "refunded");
  const b = await bal(u);
  if (b.p !== 0 || b.e !== 3) throw new Error("full " + JSON.stringify(b));
  await owner();
  const o = (await c.query("select status, refunded_credits from public.orders where provider_order_id='ord_r'")).rows[0];
  if (o.status !== "refunded" || o.refunded_credits !== 50) throw new Error(JSON.stringify(o));
  if ((await refund("nope", 1, "refunded")) !== "unknown_order") throw new Error("unknown");
});
await t("get_my_billing shows the live subscription and trial status", async () => {
  const u = await makeUser("bill1");
  await as("authenticated", u);
  let r = (await c.query("select public.get_my_billing() r")).rows[0].r;
  if (r.subscription !== null || r.has_customer || r.trial_used) throw new Error(JSON.stringify(r));
  await upsert(u, sub(u, { id: "sub_g", status: "trialing" }));
  await as("authenticated", u);
  r = (await c.query("select public.get_my_billing() r")).rows[0].r;
  if (r.subscription?.status !== "trialing" || !r.has_customer || !r.trial_used || r.plan !== "pro") throw new Error(JSON.stringify(r));
});
await t("unknown user is rejected", async () => {
  await expectErr(() => order("00000000-0000-0000-0000-000000000001", { id: "o", kind: "credits", product_key: "c", credits: 5, status: "paid" }), "user_not_found");
});
await t("credit tests still hold: spending order and insufficient credits", async () => {
  const u = await makeUser("old1");
  await setBalance(u, 2, 2, 2);
  const r = await unlock(u, monexIdea);
  if (r.status !== "unlocked") throw new Error(JSON.stringify(r));
  const b = await bal(u);
  if (b.s !== 0 || b.p !== 0 || b.e !== 1) throw new Error(JSON.stringify(b));
  const v = await makeUser("old2");
  await setBalance(v, 0, 1, 0);
  await expectErr(() => unlock(v, monexIdea), "insufficient_credits");
});

console.log(`\n${pass} passed, ${fail} failed`);
await c.end();
await db.stop();
process.exit(fail ? 1 : 0);
