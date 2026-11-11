// Security tests for the accounts migration, run against a throwaway local Postgres 17.
// Usage (as a non-root user, outside the app): npm i embedded-postgres@17 pg, then
//   node accounts.test.mjs <migration.sql> <seed.sql> <empty-data-dir>
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import fs from "node:fs";

const [,, migrationPath, seedPath, dataDir] = process.argv;
const db = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: "pw", port: 54329, persistent: false });
await db.initialise();
await db.start();
const c = new pg.Client({ host: "localhost", port: 54329, user: "postgres", password: "pw", database: "postgres" });
await c.connect();

const stubs = `
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, encrypted_password text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
`;
await c.query(stubs);
let sql = fs.readFileSync(migrationPath, "utf8");
sql = sql.split("create extension if not exists pg_cron")[0]; // pg_cron not available locally
await c.query(sql);
await c.query(fs.readFileSync(seedPath, "utf8"));
await c.query(fs.readFileSync(seedPath, "utf8")); // idempotent

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await c.query("begin"); await fn(); pass++; console.log("PASS", name); }
  catch (e) { fail++; console.log("FAIL", name, "-", e.message); }
  finally { await c.query("rollback"); }
}
async function expectErr(fn, msg) {
  try { await fn(); } catch (e) { if (!e.message.includes(msg)) throw new Error(`expected "${msg}", got "${e.message}"`); return; }
  throw new Error(`expected error "${msg}"`);
}
const as = async (role, uid) => {
  await c.query(`set local role ${role}`);
  await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ""]);
};
const newUser = async (meta = {}, pw = "hash") =>
  (await c.query("insert into auth.users (email, encrypted_password, raw_user_meta_data) values ($1,$2,$3) returning id",
    [`u${Math.random()}@x.com`, pw, meta])).rows[0].id;

const cats = (await c.query("select array_agg(id) a from public.categories")).rows[0].a;
const sk = (await c.query("select array_agg(id) a from (select id from public.skills limit 3) s")).rows[0].a;
const onboard = (uid, username, bd = null, terms = false) => c.query(
  `select public.complete_onboarding($1,$2,$3,'{seeking_idea,talent}','100_1000','online','solo','5_15',$4,$5)`,
  [username, bd, terms, cats.slice(0, 2), sk]);

await t("adult signup creates profile + private row", async () => {
  const id = await newUser({ birth_date: "2000-01-01", terms_accepted: "true" });
  const r = await c.query("select pp.birth_date, pp.terms_accepted_at from public.profiles p join public.profiles_private pp using (id) where id=$1", [id]);
  if (!r.rows[0]?.terms_accepted_at) throw new Error("no private row/terms");
});
await t("minor signup rejected", () => expectErr(() => newUser({ birth_date: "2015-05-05" }), "must_be_18"));
await t("bad birth_date metadata ignored", async () => { await newUser({ birth_date: "garbage" }); });
await t("onboarding completes for email user", async () => {
  const id = await newUser({ birth_date: "1999-03-03", terms_accepted: "true" });
  await as("authenticated", id);
  await onboard(id, "ana.dev");
  const a = (await c.query("select public.get_my_account() a")).rows[0].a;
  if (a.username !== "ana.dev" || !a.onboarding_completed || a.has_password !== true) throw new Error(JSON.stringify(a));
  const n = (await c.query("select count(*)::int n from public.profile_skills")).rows[0].n;
  if (n !== 3) throw new Error("skills " + n);
});
await t("google user must give DOB + terms", async () => {
  const id = await newUser({}, null);
  await as("authenticated", id);
  await c.query("savepoint s0");
  await expectErr(() => onboard(id, "gg_user"), "must_be_18");
  await c.query("rollback to s0");
  await c.query("savepoint s");
  await expectErr(() => onboard(id, "gg_user", "2001-01-01", false), "terms_required");
  await c.query("rollback to s");
  await onboard(id, "gg_user", "2001-01-01", true);
  const a = (await c.query("select public.get_my_account() a")).rows[0].a;
  if (a.has_password !== false) throw new Error("has_password");
});
await t("minor DOB in onboarding rejected", async () => {
  const id = await newUser({}, null);
  await as("authenticated", id);
  await expectErr(() => onboard(id, "kid", "2012-01-01", true), "must_be_18");
});
await t("duplicate username rejected", async () => {
  const a = await newUser({ birth_date: "1990-01-01", terms_accepted: "true" });
  const b = await newUser({ birth_date: "1990-01-01", terms_accepted: "true" });
  await as("authenticated", a); await onboard(a, "taken");
  await as("authenticated", b); await expectErr(() => onboard(b, "taken"), "username_taken");
});
await t("invalid username rejected", async () => {
  const a = await newUser({ birth_date: "1990-01-01", terms_accepted: "true" });
  await as("authenticated", a); await expectErr(() => onboard(a, "Bad Name"), "username_taken");
});
await t("anon sees only public columns of visible profiles", async () => {
  const a = await newUser({ birth_date: "1990-01-01", terms_accepted: "true" });
  await newUser({ birth_date: "1990-01-01", terms_accepted: "true" }); // not onboarded -> invisible
  await as("authenticated", a); await onboard(a, "visible1");
  await c.query("reset role");
  await as("anon");
  const r = await c.query("select id, username, bio, plan from public.profiles");
  if (r.rows.length !== 1) throw new Error("rows " + r.rows.length);
  await c.query("savepoint s");
  await expectErr(() => c.query("select role from public.profiles"), "permission denied");
  await c.query("rollback to s");
  await expectErr(() => c.query("select * from public.profiles_private"), "permission denied");
});
await t("user cannot change own role/plan", async () => {
  const a = await newUser({ birth_date: "1990-01-01", terms_accepted: "true" });
  await as("authenticated", a);
  await expectErr(() => c.query("update public.profiles set role='admin' where id=$1", [a]), "permission denied");
});
await t("user can update own bio, not others", async () => {
  const a = await newUser({ birth_date: "1990-01-01", terms_accepted: "true" });
  const b = await newUser({ birth_date: "1990-01-01", terms_accepted: "true" });
  await as("authenticated", a);
  const r1 = await c.query("update public.profiles set bio='hi', country='RS' where id=$1", [a]);
  const r2 = await c.query("update public.profiles set bio='x' where id=$1", [b]);
  if (r1.rowCount !== 1 || r2.rowCount !== 0) throw new Error(`${r1.rowCount}/${r2.rowCount}`);
});
await t("user cannot read others' private data", async () => {
  const a = await newUser({ birth_date: "1990-01-01", terms_accepted: "true" });
  await newUser({ birth_date: "1991-01-01", terms_accepted: "true" });
  await as("authenticated", a);
  const r = await c.query("select * from public.profiles_private");
  if (r.rows.length !== 1) throw new Error("rows " + r.rows.length);
});
await t("links and portfolio replace + limit", async () => {
  const a = await newUser({ birth_date: "1990-01-01", terms_accepted: "true" });
  await as("authenticated", a);
  await c.query(`select public.set_my_links('[{"label":"Site","url":"https://a.com"}]','[{"title":"Logo","url":""}]')`);
  const r = await c.query("select count(*)::int n from public.profile_links");
  if (r.rows[0].n !== 1) throw new Error("links");
  await c.query("savepoint s");
  await expectErr(() => c.query(`select public.set_my_links('[{"label":"x","url":"javascript:alert(1)"}]','[]')`), "check constraint");
});
await t("delete, restore, purge", async () => {
  const a = await newUser({ birth_date: "1990-01-01", terms_accepted: "true" });
  await as("authenticated", a); await onboard(a, "leaver");
  await c.query("select public.request_account_deletion()");
  await c.query("reset role"); await as("anon");
  const vis = await c.query("select id from public.profiles where username='leaver'");
  if (vis.rows.length) throw new Error("still visible");
  await c.query("reset role"); await as("authenticated", a);
  const restored = (await c.query("select public.restore_my_account() r")).rows[0].r;
  if (!restored) throw new Error("not restored");
  await c.query("select public.request_account_deletion()");
  await c.query("reset role");
  await c.query("update public.profiles set deleted_at = now() - interval '31 days' where id=$1", [a]);
  const n = (await c.query("select public.purge_deleted_accounts() n")).rows[0].n;
  const left = (await c.query("select count(*)::int n from public.profiles where id=$1", [a])).rows[0].n;
  if (n !== 1 || left !== 0) throw new Error(`purged ${n}, left ${left}`);
});
await t("restore fails after 30 days", async () => {
  const a = await newUser({ birth_date: "1990-01-01", terms_accepted: "true" });
  await c.query("update public.profiles set deleted_at = now() - interval '31 days' where id=$1", [a]);
  await as("authenticated", a);
  if ((await c.query("select public.restore_my_account() r")).rows[0].r) throw new Error("restored");
});
await t("export works", async () => {
  const a = await newUser({ birth_date: "1990-01-01", terms_accepted: "true" });
  await as("authenticated", a); await onboard(a, "exp_user");
  const e = (await c.query("select public.export_my_data() e")).rows[0].e;
  if (e.account.username !== "exp_user" || e.skills.length !== 3) throw new Error(JSON.stringify(e));
});
await t("anon cannot call private RPCs", async () => {
  await as("anon");
  await expectErr(() => c.query("select public.get_my_account()"), "permission denied");
});
await t("authenticated cannot call purge", async () => {
  const a = await newUser({ birth_date: "1990-01-01", terms_accepted: "true" });
  await as("authenticated", a);
  await expectErr(() => c.query("select public.purge_deleted_accounts()"), "permission denied");
});
await t("username availability", async () => {
  await as("anon");
  const r = (await c.query("select public.is_username_available('free.name') a, public.is_username_available('NO') b")).rows[0];
  if (!r.a || r.b) throw new Error(JSON.stringify(r));
});

console.log(`\n${pass} passed, ${fail} failed`);
await c.end(); await db.stop();
process.exit(fail ? 1 : 0);
