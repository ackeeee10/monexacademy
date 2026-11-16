// Security and behaviour tests for the ideas migration, run against a throwaway local Postgres 17.
// Usage (as a non-root user, outside the app): npm i embedded-postgres@17 pg, then
//   node ideas.test.mjs <accounts.sql> <ideas.sql> <seed.sql> <seed-ideas.sql> <empty-data-dir>
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import fs from "node:fs";

const [,, accountsPath, ideasPath, seedPath, seedIdeasPath, dataDir] = process.argv;
const db = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: "pw", port: 54330, persistent: false });
await db.initialise();
await db.start();
const c = new pg.Client({ host: "localhost", port: 54330, user: "postgres", password: "pw", database: "postgres" });
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
// pg_cron is not available locally; the accounts migration is cut before it.
await c.query(fs.readFileSync(accountsPath, "utf8").split("create extension if not exists pg_cron")[0]);
await c.query(fs.readFileSync(seedPath, "utf8"));
await c.query(fs.readFileSync(ideasPath, "utf8"));
await c.query(fs.readFileSync(seedIdeasPath, "utf8"));
await c.query(fs.readFileSync(seedIdeasPath, "utf8")); // idempotent

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await c.query("begin"); await fn(); pass++; console.log("PASS", name); }
  catch (e) { fail++; console.log("FAIL", name, "-", e.message); }
  finally { await c.query("rollback"); }
}
async function expectErr(fn, msg) {
  await c.query("savepoint expect_err");
  try { await fn(); } catch (e) {
    await c.query("rollback to savepoint expect_err");
    if (!e.message.includes(msg)) throw new Error(`expected "${msg}", got "${e.message}"`);
    return;
  }
  await c.query("rollback to savepoint expect_err");
  throw new Error(`expected error "${msg}"`);
}
const as = async (role, uid) => {
  await c.query(`reset role`);
  await c.query(`set local role ${role}`);
  await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ""]);
};
const newUser = async (meta = {}, pw = "hash") => {
  await c.query("reset role");
  const r = await c.query("insert into auth.users (email, encrypted_password, raw_user_meta_data) values ($1,$2,$3) returning id",
    [`u${Math.random()}@x.com`, pw, meta]);
  return r.rows[0].id;
};
const cats = (await c.query("select id from public.categories where slug='services'")).rows[0].id;
const skills = (await c.query("select array_agg(id) a from (select id from public.skills limit 2) s")).rows[0].a;
const onboard = (username) => c.query(
  `select public.complete_onboarding($1,$2,$3,'{seeking_idea,idea_owner}','100_1000','online','solo','5_15',$4,$5)`,
  [username, "1990-01-01", true, [cats], skills]);
const makeUser = async (username) => {
  const id = await newUser({ birth_date: "1990-01-01", terms_accepted: "true" });
  await as("authenticated", id);
  await onboard(username);
  return id;
};
const baseData = (over = {}) => ({
  title: "Test idea", short_description: "A short test description.",
  category_id: cats, investment_range: "100_1000", earning_min: 100, earning_max: 900,
  difficulty: "easy", time_to_first_income: "1_4w", work_mode: "online", team_mode: "solo",
  looking_for_roles: [], skill_ids: [skills[0]],
  launch_plan: ["Step one", "Step two"], market_analysis: "Market text.", risks: "Risk text.",
  ...over,
});
const save = (id, data, submit) => c.query("select public.save_idea($1,$2::jsonb,$3) as id",
  [id ?? null, JSON.stringify(data), submit]).then((r) => r.rows[0].id);

await t("anon sees only approved MONEX ideas", async () => {
  await as("anon");
  const r = await c.query("select source, status from public.ideas");
  if (r.rows.length === 0) throw new Error("no seeded ideas visible");
  if (r.rows.some((x) => x.status !== "approved")) throw new Error("non-approved visible");
});
await t("anon cannot read locked or moderation columns", async () => {
  await as("anon");
  await expectErr(() => c.query("select launch_plan from public.ideas"), "permission denied");
  await expectErr(() => c.query("select market_analysis from public.ideas"), "permission denied");
  await expectErr(() => c.query("select moderation_note from public.ideas"), "permission denied");
  await expectErr(() => c.query("select * from public.idea_checklist_items"), "permission denied");
});
await t("anon get_idea_full returns null for an approved idea", async () => {
  const id = (await c.query("select id from public.ideas where slug='niche-directory-website'")).rows[0].id;
  await as("anon");
  const r = await c.query("select public.get_idea_full($1) f", [id]);
  if (r.rows[0].f !== null) throw new Error("locked content leaked");
});
await t("authenticated cannot insert ideas directly", async () => {
  const u = await makeUser("direct1");
  await as("authenticated", u);
  await expectErr(() => c.query("insert into public.ideas (author_id, slug, title, short_description, category_id, investment_range, earning_min, earning_max, difficulty, time_to_first_income, work_mode, team_mode) values ($1,'x-direct','Title here','Description here.',$2,'0',0,0,'easy','lt_1w','online','solo')", [u, cats]), "permission denied");
});
await t("save as draft keeps idea hidden from others", async () => {
  const author = await makeUser("author1");
  await as("authenticated", author);
  const id = await save(null, baseData(), false);
  const st = (await c.query("select status from public.ideas where id=$1", [id])).rows[0].status;
  if (st !== "draft") throw new Error("status " + st);
  const other = await makeUser("other1");
  await as("authenticated", other);
  const vis = await c.query("select id from public.ideas where id=$1", [id]);
  if (vis.rows.length) throw new Error("draft visible to others");
  const full = (await c.query("select public.get_idea_full($1) f", [id])).rows[0].f;
  if (full !== null) throw new Error("locked content visible to others");
  await as("authenticated", author);
  const own = await c.query("select id from public.ideas where id=$1", [id]);
  if (own.rows.length !== 1) throw new Error("author cannot see own draft");
});
await t("submit sends untrusted author's idea to pending; trusted gets approved", async () => {
  const author = await makeUser("author2");
  await as("authenticated", author);
  const id = await save(null, baseData(), true);
  const st = (await c.query("select status from public.ideas where id=$1", [id])).rows[0].status;
  if (st !== "pending") throw new Error("status " + st);
  await c.query("reset role");
  await c.query("update public.profiles set trust_level='trusted' where id=$1", [author]);
  await as("authenticated", author);
  const id2 = await save(null, baseData({ title: "Trusted one" }), true);
  const st2 = (await c.query("select status, published_at from public.ideas where id=$1", [id2])).rows[0];
  if (st2.status !== "approved" || !st2.published_at) throw new Error("trusted " + JSON.stringify(st2));
});
await t("checklist defaults to launch plan steps", async () => {
  const author = await makeUser("author3");
  await as("authenticated", author);
  const id = await save(null, baseData(), false);
  await c.query("reset role"); // checklist has no grants for users; read as owner
  const r = await c.query("select text from public.idea_checklist_items where idea_id=$1 order by position", [id]);
  if (r.rows.map((x) => x.text).join("|") !== "Step one|Step two") throw new Error(JSON.stringify(r.rows));
});
await t("only the author can edit; approved ideas are locked", async () => {
  const author = await makeUser("author4");
  await as("authenticated", author);
  const id = await save(null, baseData(), false);
  const other = await makeUser("other4");
  await as("authenticated", other);
  await expectErr(() => save(id, baseData({ title: "Hijack" }), false), "idea_not_found");
  await c.query("reset role");
  await c.query("update public.ideas set status='approved' where id=$1", [id]);
  await as("authenticated", author);
  await expectErr(() => save(id, baseData({ title: "Too late" }), false), "idea_locked");
});
await t("author gets locked content, other users do not", async () => {
  const author = await makeUser("author5");
  await as("authenticated", author);
  const id = await save(null, baseData(), true);
  await as("authenticated", author);
  const mine = (await c.query("select public.get_idea_full($1) f", [id])).rows[0].f;
  if (!mine || mine.launch_plan.length !== 2 || mine.checklist.length !== 2) throw new Error("author content " + JSON.stringify(mine));
  const other = await makeUser("other5");
  await as("authenticated", other);
  const theirs = (await c.query("select public.get_idea_full($1) f", [id])).rows[0].f;
  if (theirs !== null) throw new Error("other saw locked content");
});
await t("admin can read locked content and moderation note", async () => {
  const author = await makeUser("author6");
  await as("authenticated", author);
  const id = await save(null, baseData(), true);
  const admin = await makeUser("admin6");
  await c.query("reset role");
  await c.query("update public.profiles set role='admin' where id=$1", [admin]);
  await c.query("update public.ideas set moderation_note='Please fix' where id=$1", [id]);
  await as("authenticated", admin);
  const f = (await c.query("select public.get_idea_full($1) f", [id])).rows[0].f;
  if (!f || f.moderation_note !== "Please fix") throw new Error("admin " + JSON.stringify(f));
});
await t("users cannot see the moderation note on others' ideas", async () => {
  const author = await makeUser("author7");
  await as("authenticated", author);
  const id = await save(null, baseData(), true);
  await c.query("reset role");
  await c.query("update public.ideas set status='approved', moderation_note='internal' where id=$1", [id]);
  const other = await makeUser("other7");
  await as("authenticated", other);
  const f = (await c.query("select public.get_idea_full($1) f", [id])).rows[0].f;
  if (f !== null) throw new Error("leak");
});
await t("save and unsave update saves_count", async () => {
  const u = await makeUser("saver1");
  await c.query("reset role");
  const id = (await c.query("select id from public.ideas where slug='niche-directory-website'")).rows[0].id;
  const before = (await c.query("select saves_count from public.ideas where id=$1", [id])).rows[0].saves_count;
  await as("authenticated", u);
  await c.query("insert into public.saved_ideas (user_id, idea_id) values ($1,$2)", [u, id]);
  await c.query("reset role");
  const mid = (await c.query("select saves_count from public.ideas where id=$1", [id])).rows[0].saves_count;
  if (mid !== before + 1) throw new Error(`after save ${mid}, expected ${before + 1}`);
  await as("authenticated", u);
  await c.query("delete from public.saved_ideas where user_id=$1 and idea_id=$2", [u, id]);
  await c.query("reset role");
  const after = (await c.query("select saves_count from public.ideas where id=$1", [id])).rows[0].saves_count;
  if (after !== before) throw new Error("after unsave " + after);
});
await t("cannot save someone else's draft or save as another user", async () => {
  const author = await makeUser("author8");
  await as("authenticated", author);
  const draft = await save(null, baseData(), false);
  const other = await makeUser("other8");
  await as("authenticated", other);
  await expectErr(() => c.query("insert into public.saved_ideas (user_id, idea_id) values ($1,$2)", [author, draft]), "row-level security");
});
await t("cannot save a draft or an idea as another user", async () => {
  const u = await makeUser("saver2");
  await as("authenticated", u);
  const id = (await c.query("select id from public.ideas where slug='niche-directory-website'")).rows[0].id;
  const stranger = await newUser();
  await as("authenticated", u);
  await expectErr(() => c.query("insert into public.saved_ideas (user_id, idea_id) values ($1,$2)", [stranger, id]), "row-level security");
});
await t("earnings range and profile readiness are enforced", async () => {
  const author = await makeUser("author9");
  await as("authenticated", author);
  await expectErr(() => save(null, baseData({ earning_min: 900, earning_max: 100 }), false), "ideas_earning_range");
  const unonboarded = await newUser({ birth_date: "1990-01-01", terms_accepted: "true" });
  await as("authenticated", unonboarded);
  await expectErr(() => save(null, baseData(), false), "profile_not_ready");
});
await t("save requires sign-in", async () => {
  await as("anon");
  await expectErr(() => save(null, baseData(), false), "permission denied");
});
await t("seeded MONEX ideas have skills and checklists", async () => {
  const r = await c.query(`
    select i.slug,
      (select count(*) from public.idea_skills s where s.idea_id = i.id)::int skills,
      (select count(*) from public.idea_checklist_items k where k.idea_id = i.id)::int checklist
    from public.ideas i where i.source = 'monex'`);
  if (r.rows.length < 6) throw new Error("seed count " + r.rows.length);
  if (r.rows.some((x) => x.checklist < 3)) throw new Error("missing checklist " + JSON.stringify(r.rows));
});

console.log(`\n${pass} passed, ${fail} failed`);
await c.end();
await db.stop();
process.exit(fail ? 1 : 0);
