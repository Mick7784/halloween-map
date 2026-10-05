import manifest from "../app/manifest";
import { runInNewContext } from "node:vm";
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { db, transaction, type Database } from "../lib/db";
import * as service from "../lib/service";
import {
  getUser,
  hashPassword,
  verifyPassword,
  requirePermission,
  rateLimit,
} from "../lib/auth";
import {
  seasonState,
  visible,
  effectiveActivities,
  localISO,
  type House,
  type User,
  type Season,
} from "../lib/domain";
import { planRoute } from "../lib/routing";
import { nextVersion } from "../scripts/version.mjs";
import { seed } from "../scripts/seed";
import {
  ensureBootstrap,
  exchangeBootstrap,
  setupAuthorized,
} from "../lib/bootstrap";
import { effectiveTime } from "../lib/time";
import { requestPasswordReset, resetPassword } from "../lib/accounts";
import { demoSeason, demoTime } from "../lib/demo";
import { mailLayout } from "../lib/mail-layout";
import { dispatchEmails, campaignAction, campaignAdmin } from "../lib/mail";
import {
  consumeIdentity,
  adminUserAction,
  accountAction,
  resendIdentity,
  activateAccount,
} from "../lib/accounts";
import {
  contentAction,
  contentState,
  legalState,
  sanitizeContent,
} from "../lib/content";
import { hashToken } from "../lib/auth";
vi.mock("../lib/walking-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/walking-router")>()),
  createWalkingRouter: () => fixtureRouter,
}));
import { fixtureRouter } from "./walking-fixture";
const globalDb = globalThis as unknown as { testDb?: Database };
let engine: PGlite | Pool;
const setupData = () => ({
  token: "test-setup-secret",
  instance: {
    public_name: "Une fête locale",
    territory: "Territoire fictif",
    postal_code: "00000",
    country: "France",
    timezone: "Europe/Paris",
    latitude: 48.1,
    longitude: -1.67,
    zoom: 14,
  },
  admin: {
    display_name: "Équipe",
    email: "admin@example.invalid",
    password: "valid-password-1234",
  },
  season: {
    year: 2026,
    opens_at: "2026-10-31T12:00",
    closes_at: "2026-11-01T00:00",
    registrations_open: true,
    activated: false,
  },
});
const houseData = () => ({
  position_confirmed: true,
  name: "La demeure des murmures",
  address: "1 allée fictive",
  latitude: 48.1001,
  longitude: -1.67,
  activities: ["DECORATION", "CANDY"],
  starts_at: "2026-10-31T18:00",
  ends_at: "2026-10-31T21:30",
  fear: 3,
  adaptable: false,
  rp: "Un jardin de brume",
  practical: "Portail fictif",
});
let admin: User, participant: User, house: House, season: Season;
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-04T12:00:00Z"));
  process.env.SETUP_TOKEN = "test-setup-secret";
  if (process.env.TEST_DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    engine = pool;
    globalDb.testDb = pool;
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
    await pool.query(await readFile("migrations/001_initial.sql", "utf8"));
    await pool.query(
      await readFile("migrations/002_season_bootstrap.sql", "utf8"),
    );
    await pool.query(
      await readFile("migrations/003_durable_accounts.sql", "utf8"),
    );
    await pool.query(
      await readFile("migrations/004_beta_simplification.sql", "utf8"),
    );
  } else {
    const pg = new PGlite();
    engine = pg;
    await pg.exec(await readFile("migrations/001_initial.sql", "utf8"));
    await pg.exec(
      await readFile("migrations/002_season_bootstrap.sql", "utf8"),
    );
    await pg.exec(
      await readFile("migrations/003_durable_accounts.sql", "utf8"),
    );
    await pg.exec(
      await readFile("migrations/004_beta_simplification.sql", "utf8"),
    );
    globalDb.testDb = {
      async query(sql, values) {
        const q = sql.includes("pg_advisory_xact_lock") ? "SELECT 1" : sql;
        const r = await pg.query(q, values);
        return { rows: r.rows as never[], rowCount: r.affectedRows };
      },
    };
  }
});
const acceptance = () => ({
  terms: true,
  guidelines: true,
  terms_version: "2026.1",
  guidelines_version: "2026.1",
});
async function verifyQueued(
  email: string,
  kind: "VERIFY" | "INVITE" = "VERIFY",
) {
  await db().query(
    "UPDATE email_outbox SET scheduled_at='2026-10-04T12:00Z' WHERE status='PENDING'",
  );
  let token = "";
  await dispatchEmails(new Date("2026-10-04T12:00Z"), async (mail) => {
    if (mail.to === email)
      token = new URL(mail.text.match(/https?:[^\s]+/)![0]).searchParams.get(
        "token",
      )!;
  });
  expect(token).toHaveLength(64);
  return { linkToken: token, ...(await consumeIdentity(token, kind)) };
}
beforeEach(async () => {
  await db().query(
    "TRUNCATE bootstrap,setup_sessions,instances,roles,users,seasons,participations,sessions,audit_logs,rate_limits RESTART IDENTITY CASCADE",
  );
  const first = await service.setup(setupData());
  admin = (await getUser(first.token))!;
  const registration = await service.register({
    display_name: "Visiteur",
    email: "visitor@example.invalid",
    password: "valid-password-1234",
  });
  participant = (await getUser(registration.token))!;
  await verifyQueued(participant.email);
  participant = (await getUser(registration.token))!;
  await service.createParticipation(participant, {
    house: houseData(),
    acceptance: acceptance(),
  });
  house = (await service.ownHouse(participant)) as unknown as House;
  season = (await service.activeSeason((await service.instance())!))!;
});
afterAll(async () => {
  vi.useRealTimers();
  delete globalDb.testDb;
  if (engine instanceof Pool) await engine.end();
  else await engine.close();
});
describe("V0.4 privacy, roles, demo and recovery", () => {
  it("derives access solely from USER / ADMIN / SUPER_ADMIN and protects critical operations", async () => {
    expect(participant.role_name).toBe("USER");
    expect(() =>
      requirePermission(
        { ...participant, permissions: ["admin.access"] },
        "admin.access",
      ),
    ).toThrow();
    const local = { ...admin, role_name: "ADMIN" };
    expect(() => requirePermission(local, "participants.edit")).not.toThrow();
    await expect(
      service.adminAction(local, { action: "settings", payload: {} }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.adminAction(local, {
        action: "purge",
        id: season.id,
        payload: "PURGER",
      }),
    ).rejects.toMatchObject({ status: 403 });
    const role = (await db().query("SELECT id FROM roles WHERE name='ADMIN'"))
      .rows[0];
    await expect(
      adminUserAction(local, {
        action: "edit",
        id: participant.id,
        role_id: role.id,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      adminUserAction(local, {
        action: "edit",
        id: local.id,
        role_id: role.id,
      }),
    ).rejects.toThrow();
    await db().query("UPDATE users SET role_id=$1 WHERE id=$2", [
      role.id,
      participant.id,
    ]);
    const result = await service.login({
      email: participant.email,
      password: "valid-password-1234",
    });
    expect((await getUser(result.token))?.permissions).toContain(
      "admin.access",
    );
  });
  it("creates a visible house automatically and limits preopening APIs to the owner", async () => {
    expect(house.status).toBe("VISIBLE");
    const before = new Date("2026-10-30T10:00Z");
    expect(
      (await service.publicState(before, participant)).houses?.map((h) => h.id),
    ).toEqual([house.id]);
    const stranger = (
      await service.register({
        display_name: "Autre",
        email: "other@example.invalid",
        password: "valid-password-1234",
      })
    ).token;
    const u = (await getUser(stranger))!;
    for (const user of [null, u]) {
      const state = await service.publicState(before, user);
      expect(state.houses).toEqual([]);
      expect(JSON.stringify(state)).not.toContain(house.address);
      expect(JSON.stringify(state)).not.toContain(String(house.latitude));
    }
    const input = {
      start: "2026-10-31T18:00Z",
      end: "2026-10-31T20:00Z",
      origin: { latitude: 48.1, longitude: -1.67 },
      activities: [],
    };
    await expect(
      service.route(input, { now: before, preview: false }, null),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      service.route(input, { now: before, preview: false }, participant),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("hides and restores houses server-side; owner resume cannot override admin hiding", async () => {
    await db().query("UPDATE seasons SET activated=true WHERE id=$1", [
      season.id,
    ]);
    await service.adminAction(admin, {
      action: "visibility",
      id: house.id,
      payload: "HIDDEN",
    });
    await service.participantAction(participant, { action: "resume" });
    const context = { now: new Date("2026-10-31T18:00Z"), preview: false };
    const state = await service.publicState(context, participant);
    expect(state.houses).toEqual([]);
    expect(JSON.stringify(state)).not.toContain(house.address);
    const result = await service.route(
      {
        start: context.now.toISOString(),
        end: "2026-10-31T20:00Z",
        origin: { latitude: 48.1, longitude: -1.67 },
        activities: [],
      },
      context,
      participant,
    );
    expect(result.stops).toEqual([]);
    expect(await service.adminRead(admin, "houses")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: house.id, status: "HIDDEN" }),
      ]),
    );
    await service.adminAction(admin, {
      action: "visibility",
      id: house.id,
      payload: "VISIBLE",
    });
    expect(
      (await service.publicState(context, participant)).houses,
    ).toHaveLength(1);
    expect((await service.publicState(context, null)).houses).toEqual([]);
  });
  it("deletes only the selected house with strong confirmation and retains its account", async () => {
    await expect(
      service.adminAction(admin, {
        action: "deleteHouse",
        id: house.id,
        payload: "SUPPRIMER",
      }),
    ).rejects.toMatchObject({ status: 400 });
    await service.adminAction(admin, {
      action: "deleteHouse",
      id: house.id,
      payload: "SUPPRIMER LA MAISON",
    });
    expect(await service.ownHouse(participant)).toBeNull();
    expect(
      (await db().query("SELECT id FROM users WHERE id=$1", [participant.id]))
        .rows,
    ).toHaveLength(1);
    expect(
      JSON.stringify((await db().query("SELECT * FROM audit_logs")).rows),
    ).not.toContain(house.address);
  });
  it("uses five ephemeral demo houses below two real houses and real data otherwise, without statistics or purge", async () => {
    const i = (await service.instance())!;
    const demo = demoSeason(season);
    expect(await service.demoHouses(i, demo)).toHaveLength(5);
    expect(
      (
        await service.publicState(
          { now: demoTime(i, demo, []), preview: true },
          admin,
        )
      ).houses,
    ).toHaveLength(5);
    expect(
      (await db().query("SELECT * FROM participations")).rows,
    ).toHaveLength(1);
    const second = await service.register({
      display_name: "Deux",
      email: "two@example.invalid",
      password: "valid-password-1234",
    });
    await verifyQueued("two@example.invalid");
    const u = (await getUser(second.token))!;
    await service.createParticipation(u, {
      house: { ...houseData(), name: "Deuxième maison" },
      acceptance: acceptance(),
    });
    expect((await service.demoHouses(i, demo)).map((h) => h.demo)).toEqual([
      false,
      false,
    ]);
    const context = {
      now: demoTime(i, demo, await service.demoHouses(i, demo)),
      preview: true,
    };
    const before = await service.activeSeason(i);
    expect((await service.publicState(context, admin)).houses).toHaveLength(2);
    const r = await service.route(
      {
        start: context.now.toISOString(),
        end: new Date(demo.closes_at).toISOString(),
        origin: { latitude: 48.1, longitude: -1.67 },
        activities: [],
      },
      context,
      admin,
    );
    expect(r.stops).toHaveLength(2);
    expect(await service.activeSeason(i)).toEqual(before);
    await expect(
      service.publicState(context, participant),
    ).rejects.toMatchObject({ status: 403 });
    await service.purgeSeason(season.id, i.id, admin, true);
    expect(await service.demoHouses(i, demo)).toHaveLength(5);
  });
  it("disallows demo during official opening even for a previously enabled session", async () => {
    const session = (
      await service.login({
        email: admin.email,
        password: "valid-password-1234",
      })
    ).token;
    await db().query("UPDATE sessions SET preview_at=$1 WHERE token_hash=$2", [
      "2026-10-31T18:00Z",
      hashToken(session),
    ]);
    vi.setSystemTime(new Date("2026-10-31T18:00Z"));
    await db().query("UPDATE seasons SET activated=true WHERE id=$1", [
      season.id,
    ]);
    await expect(effectiveTime(true, admin, session)).rejects.toMatchObject({
      status: 403,
    });
    expect(
      (
        await service.publicState(
          { now: new Date("2026-10-31T18:00Z"), preview: false },
          admin,
        )
      ).demoAvailable,
    ).toBe(false);
    vi.setSystemTime(new Date("2026-10-04T12:00Z"));
  });
  it("sends a neutral reset response, hashed expiring single-use tokens and invalidates sessions", async () => {
    const unknown = await requestPasswordReset({
      email: "unknown@example.invalid",
    });
    expect(await requestPasswordReset({ email: participant.email })).toEqual(
      unknown,
    );
    await db().query(
      "UPDATE email_outbox SET scheduled_at='2026-10-04T12:00Z' WHERE kind='RESET'",
    );
    let token = "";
    await dispatchEmails(new Date("2026-10-04T12:00Z"), async (mail) => {
      if (mail.to === participant.email) {
        expect(mail.html).toContain("Choisir un nouveau mot de passe");
        token = new URL(mail.text.match(/https?:[^\s]+/)![0]).searchParams.get(
          "token",
        )!;
      }
    });
    expect(token).toHaveLength(64);
    expect(
      JSON.stringify((await db().query("SELECT * FROM email_tokens")).rows),
    ).not.toContain(token);
    // Database wall time is independent of the JS fake clock.
    await db().query(
      "UPDATE email_tokens SET expires_at=now()+interval '1 hour' WHERE kind='RESET'",
    );
    await resetPassword({ token, password: "new-password-1234" });
    await expect(
      resetPassword({ token, password: "new-password-1234" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      (
        await db().query("SELECT * FROM sessions WHERE user_id=$1", [
          participant.id,
        ])
      ).rows,
    ).toHaveLength(0);
    expect(
      await service.login({
        email: participant.email,
        password: "new-password-1234",
      }),
    ).toHaveProperty("token");
    const expired = "ab".repeat(32);
    await db().query(
      "INSERT INTO email_tokens(token_hash,user_id,kind,email_hash,expires_at) VALUES($1,$2,'RESET',$3,now()-interval '1 second')",
      [hashToken(expired), participant.id, hashToken(participant.email)],
    );
    await expect(
      resetPassword({ token: expired, password: "new-password-1234" }),
    ).rejects.toMatchObject({ status: 400 });
    await requestPasswordReset({ email: participant.email });
    await requestPasswordReset({ email: participant.email });
    await expect(
      requestPasswordReset({ email: participant.email }),
    ).rejects.toMatchObject({ status: 429 });
  });
  it("renders escaped responsive HTML with a CTA and rejects unsafe links", () => {
    const html = mailLayout(
      "Vérifiez votre adresse email",
      "Bonjour <script>\nCe lien est valable pendant 48 heures.",
      {
        label: "Vérifier mon adresse",
        url: "https://example.invalid/verify?token=abc",
      },
    );
    expect(html).toContain("viewport");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('href="https://example.invalid/verify?token=abc"');
    expect(() =>
      mailLayout("Title", "Body", {
        label: "Click",
        url: "javascript:alert(1)",
      }),
    ).toThrow();
  });
  it("replays V0.4 migration safely without losing accounts or household data", async () => {
    const sql = await readFile(
      "migrations/004_beta_simplification.sql",
      "utf8",
    );
    if (engine instanceof Pool) await engine.query(sql);
    else await engine.exec(sql);
    expect((await service.ownHouse(participant))?.address).toBe(house.address);
    expect(
      (await db().query("SELECT name,permissions FROM roles ORDER BY name"))
        .rows,
    ).toEqual([
      { name: "ADMIN", permissions: [] },
      { name: "SUPER_ADMIN", permissions: [] },
      { name: "USER", permissions: [] },
    ]);
  });
});
describe("Setup, authentication and RBAC", () => {
  it("creates an instance, admin, three roles and inactive first season", async () => {
    expect(admin.role_name).toBe("SUPER_ADMIN");
    expect(season.activated).toBe(false);
    expect((await db().query("SELECT * FROM roles")).rows).toHaveLength(3);
    expect((await service.instance())?.territory).toBe("Territoire fictif");
  });
  it("locks setup after creation and rejects an invalid key", async () => {
    await expect(service.setup(setupData())).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      service.setup({ ...setupData(), token: "wrong" }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("hashes passwords and stores only hashed session tokens", async () => {
    const h = await hashPassword("hello-password-1234");
    expect(h).not.toContain("hello-password");
    expect(await verifyPassword("hello-password-1234", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
    const result = await service.login({
      email: "admin@example.invalid",
      password: "valid-password-1234",
    });
    expect(
      (
        await db().query(
          "SELECT token_hash FROM sessions WHERE token_hash=$1",
          [result.token],
        )
      ).rows,
    ).toHaveLength(0);
    expect(await getUser("invalid")).toBe(null);
  });
  it("rejects unauthorized admin access and participant moderation", async () => {
    expect(() => requirePermission(null, "users.manage")).toThrow(
      "Connexion requise",
    );
    await expect(service.adminRead(participant, "users")).rejects.toMatchObject(
      { status: 403 },
    );
    await expect(
      service.adminAction(participant, {
        action: "visibility",
        id: house.id,
        payload: "VISIBLE",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("rate-limits persisted attempts", async () => {
    await rateLimit("example", 1);
    await expect(rateLimit("example", 1)).rejects.toMatchObject({
      status: 429,
    });
  });
});
describe("Seasons, privacy and participant activity", () => {
  it("hides addresses before opening and counts validated houses only", async () => {
    await service.adminAction(admin, {
      action: "visibility",
      id: house.id,
      payload: "VISIBLE",
    });
    const state = await service.publicState(new Date("2026-10-30T10:00Z"));
    expect(state.houses).toEqual([]);
    expect(state.count).toBe(1);
    expect(JSON.stringify(state)).not.toContain(house.address);
  });
  it("opens only activated seasons at the configured boundary", () => {
    expect(seasonState(season, new Date("2026-10-31T18:00Z"))).toBe(
      "PREPARATION",
    );
    const s = { ...season, activated: true };
    expect(seasonState(s, new Date("2026-10-31T10:59:59Z"))).toBe("COUNTDOWN");
    expect(seasonState(s, new Date("2026-10-31T11:00:00Z"))).toBe("MAP_OPEN");
    expect(seasonState(s, new Date("2026-10-31T23:00:00Z"))).toBe("CLOSED");
  });
  it("publishes approved active houses only during their exact hours", async () => {
    const now = new Date("2026-10-31T18:00Z");
    expect(
      visible(
        { ...house, status: "HIDDEN" },
        { ...season, activated: true },
        now,
      ),
    ).toBe(false);
    expect(
      visible(
        { ...house, status: "VISIBLE" },
        { ...season, activated: true },
        now,
      ),
    ).toBe(true);
    expect(
      visible(
        { ...house, status: "VISIBLE" },
        { ...season, activated: true },
        new Date(house.ends_at),
      ),
    ).toBe(false);
    await db().query("UPDATE seasons SET activated=true WHERE id=$1", [
      season.id,
    ]);
    await service.adminAction(admin, {
      action: "visibility",
      id: house.id,
      payload: "VISIBLE",
    });
    const result = await service.publicState(now, participant);
    expect(result.houses).toHaveLength(1);
    expect(result.houses?.[0]).not.toHaveProperty("user_id");
    expect(result.houses?.[0]).not.toHaveProperty("email");
  });
  it("pauses, resumes and ends without deleting the registration", async () => {
    await service.participantAction(participant, { action: "pause" });
    expect((await service.ownHouse(participant))?.activity).toBe("PAUSED");
    await service.participantAction(participant, { action: "resume" });
    expect((await service.ownHouse(participant))?.activity).toBe("ACTIVE");
    await service.participantAction(participant, { action: "end" });
    await expect(
      service.participantAction(participant, { action: "resume" }),
    ).rejects.toThrow("terminée");
  });
  it("removes candy alone, and hides candy-only houses after depletion", async () => {
    await service.participantAction(participant, {
      action: "candy",
      available: false,
    });
    const h = (await service.ownHouse(participant)) as unknown as House;
    expect(effectiveActivities(h)).toEqual(["DECORATION"]);
    expect(
      visible(
        { ...h, status: "VISIBLE", activities: ["CANDY"] },
        { ...season, activated: true },
        new Date("2026-10-31T18:00Z"),
      ),
    ).toBe(false);
  });
  it("automatically retains visibility for address and text edits and forbids invalid hours", async () => {
    await service.adminAction(admin, {
      action: "visibility",
      id: house.id,
      payload: "VISIBLE",
    });
    expect(
      await service.updateHouse(participant, house.id, {
        ...houseData(),
        rp: "Nouvelle ambiance",
      }),
    ).toEqual({ status: "VISIBLE" });
    await expect(
      service.updateHouse(participant, house.id, {
        ...houseData(),
        ends_at: "2026-11-02T00:00",
      }),
    ).rejects.toThrow("horaires");
    const foreign = { ...participant, id: admin.id };
    await expect(
      service.updateHouse(foreign, house.id, houseData()),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("requires confirmation and deletes participation and retains durable account and sessions", async () => {
    await expect(
      service.participantAction(participant, { action: "delete" }),
    ).rejects.toThrow("Confirmation");
    await service.participantAction(participant, {
      action: "delete",
      confirm: "SUPPRIMER",
    });
    expect(
      (await db().query("SELECT * FROM users WHERE id=$1", [participant.id]))
        .rows,
    ).toHaveLength(1);
    expect((await db().query("SELECT * FROM participations")).rows).toEqual([]);
    expect(
      (
        await db().query("SELECT * FROM sessions WHERE user_id=$1", [
          participant.id,
        ])
      ).rows,
    ).toHaveLength(2);
    expect(
      (await db().query("SELECT * FROM users WHERE id=$1", [admin.id])).rows,
    ).toHaveLength(1);
  });
  it("closes publicly, retains admin data, then purges idempotently at the separate deadline", async () => {
    await service.adminAction(admin, {
      action: "visibility",
      id: house.id,
      payload: "VISIBLE",
    });
    await db().query(
      "UPDATE seasons SET activated=true,routes_count=3 WHERE id=$1",
      [season.id],
    );
    const result = await service.publicState(new Date("2026-10-31T23:00:00Z"));
    expect(result.state).toBe("CLOSED");
    expect(result.houses).toEqual([]);
    expect(result.season?.registrations_open).toBe(false);
    expect(
      (await service.adminRead(admin, "houses")) as unknown[],
    ).toHaveLength(1);
    expect(
      (await db().query("SELECT id FROM users WHERE kind='PARTICIPANT'")).rows,
    ).toHaveLength(1);
    expect(
      await service.purgeSeason(
        season.id,
        admin.instance_id,
        null,
        false,
        new Date(season.closes_at),
      ),
    ).toEqual({ purged: false });
    await service.tick(new Date(season.purge_at));
    await service.tick(new Date(+new Date(season.purge_at) + 60000));
    expect(
      (await db().query("SELECT * FROM users WHERE kind='PARTICIPANT'")).rows,
    ).toHaveLength(1);
    expect((await db().query("SELECT * FROM participations")).rows).toEqual([]);
    const s = await service.activeSeason((await service.instance())!);
    expect(s?.stats).toMatchObject({ houses: 1, approved: 1, routes: 3 });
    expect(JSON.stringify(s?.stats)).not.toContain(house.address);
    expect(await service.purgeSeason(season.id, admin.instance_id)).toEqual({
      purged: false,
    });
    expect(
      (
        await db().query(
          "SELECT * FROM audit_logs WHERE action='season.purge.automatic'",
        )
      ).rows,
    ).toHaveLength(1);
    expect((await db().query("SELECT * FROM roles")).rows).toHaveLength(3);
  });
  it("restricts manual purge to Super Admin, refuses revival and starts new seasons inactive", async () => {
    await expect(
      service.adminAction(
        { ...admin, role_name: "ADMIN" },
        { action: "purge", id: season.id, payload: "PURGER" },
      ),
    ).rejects.toMatchObject({ status: 403 });
    await service.adminAction(admin, {
      action: "purge",
      id: season.id,
      payload: "PURGER",
    });
    await expect(
      service.adminAction(admin, {
        action: "season",
        id: season.id,
        payload: setupData().season,
      }),
    ).rejects.toThrow("réouverte");
    await service.adminAction(admin, {
      action: "season",
      payload: {
        ...setupData().season,
        year: 2027,
        opens_at: "2027-10-31T12:00",
        closes_at: "2027-11-01T00:00",
        activated: true,
      },
    });
    expect(
      (await service.activeSeason((await service.instance())!))?.activated,
    ).toBe(false);
  });
  it("converts timezone correctly across daylight saving boundaries", () => {
    expect(localISO("2026-10-31T12:00", "Europe/Paris")).toBe(
      "2026-10-31T11:00:00.000Z",
    );
    expect(localISO("2026-07-31T12:00", "Europe/Paris")).toBe(
      "2026-07-31T10:00:00.000Z",
    );
  });
});
describe("Routing, demo and canonical versions", () => {
  it("requires an explicit position confirmation for a new participation", async () => {
    await expect(
      service.createParticipation(participant, {
        house: { ...houseData(), position_confirmed: false },
        acceptance: acceptance(),
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("releases database locks before routing and rejects a house changed during the network call", async () => {
    const context = { now: new Date("2026-10-31T18:00Z"), preview: false };
    await db().query("UPDATE seasons SET activated=true WHERE id=$1", [
      season.id,
    ]);
    const original = fixtureRouter.matrix.bind(fixtureRouter);
    const spy = vi
      .spyOn(fixtureRouter, "matrix")
      .mockImplementationOnce(async (points) => {
        await transaction(async (c) => {
          await c.query("SELECT id FROM seasons WHERE id=$1 FOR UPDATE", [
            season.id,
          ]);
          await c.query(
            "UPDATE participations SET status='HIDDEN' WHERE id=$1",
            [house.id],
          );
        });
        return original(points);
      });
    await expect(
      service.route(
        {
          start: context.now.toISOString(),
          end: "2026-10-31T20:00Z",
          origin: { latitude: 48.1, longitude: -1.67 },
          activities: [],
        },
        context,
        participant,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (
        await db().query("SELECT routes_count FROM seasons WHERE id=$1", [
          season.id,
        ])
      ).rows[0].routes_count,
    ).toBe(0);
    spy.mockRestore();
  });
  it("respects filters, walking time, availability and closing hours", async () => {
    const s = { ...season, activated: true };
    const h = { ...house, status: "VISIBLE" };
    const input = {
      start: "2026-10-31T17:05:00Z",
      end: "2026-10-31T20:00:00Z",
      origin: { latitude: 48.1, longitude: -1.67 },
      activities: ["CANDY"] as const,
    };
    const r = await planRoute(
      [h],
      s,
      { ...input, activities: [...input.activities] },
      new Date(input.start),
    );
    expect(r.stops).toHaveLength(1);
    expect(r.durationMinutes).toBeGreaterThanOrEqual(5);
    expect(
      (
        await planRoute(
          [{ ...h, candy_available: false }],
          s,
          { ...input, activities: [...input.activities] },
          new Date(input.start),
        )
      ).stops,
    ).toHaveLength(0);
    expect(
      (
        await planRoute(
          [{ ...h, activity: "PAUSED" }],
          s,
          { ...input, activities: [...input.activities] },
          new Date(input.start),
        )
      ).stops,
    ).toHaveLength(0);
    expect(
      (
        await planRoute(
          [{ ...h, fear: 5, adaptable: true }],
          s,
          { ...input, activities: [], maxFear: 1 },
          new Date(input.start),
        )
      ).stops,
    ).toHaveLength(1);
    expect(
      (
        await planRoute(
          [{ ...h, ends_at: "2026-10-31T17:07:00Z" }],
          s,
          { ...input, activities: [] },
          new Date(input.start),
        )
      ).stops,
    ).toHaveLength(0);
    await expect(
      planRoute(
        [h],
        season,
        { ...input, activities: [] },
        new Date(input.start),
      ),
    ).rejects.toThrow("fermée");
  });
  it("waits for future opening and orders feasible houses", async () => {
    const a = { ...house, status: "VISIBLE", starts_at: "2026-10-31T18:00Z" };
    const b = {
      ...a,
      id: "other",
      latitude: 48.101,
      starts_at: "2026-10-31T17:00Z",
      ends_at: "2026-10-31T17:40Z",
    };
    const input = {
      start: "2026-10-31T17:01Z",
      end: "2026-10-31T19:00Z",
      origin: { latitude: 48.1, longitude: -1.67 },
      activities: [],
    };
    const r = await planRoute(
      [a, b],
      { ...season, activated: true },
      input,
      new Date(input.start),
    );
    expect(r.stops.map((s) => s.house.id)).toEqual(["other", house.id]);
    expect(+new Date(r.stops[1].arrival)).toBeGreaterThanOrEqual(
      +new Date(a.starts_at),
    );
  });
  it("route API includes future opening only during the open season and requested window", async () => {
    const current = (await db().query("SELECT now() current")).rows[0].current;
    const now = new Date(String(current));
    vi.setSystemTime(now);
    await db().query(
      "UPDATE seasons SET activated=true,opens_at=now()-interval '1 day',closes_at=now()+interval '1 day' WHERE id=$1",
      [season.id],
    );
    await db().query(
      "UPDATE participations SET status='VISIBLE',starts_at=now()+interval '1 hour',ends_at=now()+interval '3 hours' WHERE id=$1",
      [house.id],
    );
    const result = await service.route(
      {
        start: new Date(+now + 7200000).toISOString(),
        end: new Date(+now + 10800000).toISOString(),
        origin: { latitude: 48.1, longitude: -1.67 },
        activities: [],
      },
      { now, preview: false },
      participant,
    );
    expect(result.stops).toHaveLength(1);
    expect(result.stops[0].house.id).toBe(house.id);
    vi.setSystemTime(new Date("2026-10-04T12:00:00Z"));
  });
  it("seeds 12 synthetic houses idempotently and removes only demo participants", async () => {
    process.env.DEMO_PASSWORD = "demo-password-1234";
    await seed();
    await seed();
    expect(
      (await db().query("SELECT * FROM participations WHERE demo=true")).rows,
    ).toHaveLength(12);
    await seed("off");
    expect(
      (await db().query("SELECT * FROM participations WHERE demo=true")).rows,
    ).toEqual([]);
    expect(await service.ownHouse(participant)).not.toBeNull();
  });
  it("increments patches once and permits explicit milestone overrides", () => {
    expect(nextVersion("V0.1")).toBe("V0.101");
    expect(nextVersion("V0.101")).toBe("V0.102");
    expect(nextVersion("V0.106", "V0.2")).toBe("V0.2");
    expect(nextVersion("V0.2")).toBe("V0.201");
    expect(nextVersion("V1.1")).toBe("V1.101");
    expect(nextVersion("V0.199")).toBe("V0.1100");
    expect(() => nextVersion("latest")).toThrow();
    expect(() => nextVersion("V0.1", "V0.1")).toThrow();
  });
  it("release is gated by verification and Docker; version is read from VERSION", async () => {
    const version = (await readFile("VERSION", "utf8")).trim();
    expect(await readFile("CHANGELOG.md", "utf8")).toContain("## " + version);
    const workflow = await readFile(".github/workflows/ci.yml", "utf8");
    expect(workflow).toContain("needs: [verify, docker]");
    expect(workflow).toContain("steps.version.outputs.value");
    expect(workflow).toContain('git rev-parse "$version"');
    expect(workflow).toContain("< VERSION");
  });
});
describe("V0.2 bootstrap, dates, preview and reminders", () => {
  it("generates a persistent hash-only bootstrap, exchanges it once and completes setup without a token field", async () => {
    await db().query("TRUNCATE instances,bootstrap,setup_sessions CASCADE");
    const override = process.env.SETUP_TOKEN;
    delete process.env.SETUP_TOKEN;
    try {
      const link = await ensureBootstrap();
      expect(link).toMatch(/\/setup\?bootstrap=/);
      const secret = new URL(link!).searchParams.get("bootstrap")!;
      expect(secret.length).toBeGreaterThan(40);
      const stored = (await db().query("SELECT * FROM bootstrap")).rows[0];
      expect(JSON.stringify(stored)).not.toContain(secret);
      expect(await ensureBootstrap()).toBeNull();
      const outcomes = await Promise.allSettled([
        exchangeBootstrap(secret),
        exchangeBootstrap(secret),
      ]);
      expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const session = (
        outcomes.find(
          (r) => r.status === "fulfilled",
        ) as PromiseFulfilledResult<string>
      ).value;
      expect(await setupAuthorized(session)).toBe(true);
      await expect(exchangeBootstrap(secret)).rejects.toMatchObject({
        status: 403,
      });
      const data = setupData();
      const withoutToken = {
        instance: data.instance,
        admin: data.admin,
        season: data.season,
      };
      await expect(service.setup(withoutToken)).rejects.toMatchObject({
        status: 403,
      });
      const setups = await Promise.allSettled([
        service.setup(withoutToken, session),
        service.setup(withoutToken, session),
      ]);
      expect(setups.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect((await db().query("SELECT id FROM instances")).rows).toHaveLength(
        1,
      );
      expect(await setupAuthorized(session)).toBe(false);
      expect(await ensureBootstrap(true)).toBeNull();
      await expect(exchangeBootstrap(secret)).rejects.toMatchObject({
        status: 409,
      });
    } finally {
      process.env.SETUP_TOKEN = override;
    }
  });
  it("expires setup sessions and rotates a lost link only before installation", async () => {
    await db().query("TRUNCATE instances,bootstrap,setup_sessions CASCADE");
    const first = await ensureBootstrap();
    const token = await exchangeBootstrap(
      new URL(first!).searchParams.get("bootstrap")!,
    );
    await db().query(
      "UPDATE setup_sessions SET expires_at=now()-interval '1 second'",
    );
    expect(await setupAuthorized(token)).toBe(false);
    const next = await ensureBootstrap(true);
    expect(next).toBeTruthy();
    expect(
      (await db().query("SELECT * FROM setup_sessions")).rows,
    ).toHaveLength(0);
  });
  it("validates four ordered dates and scheduled registration opening", async () => {
    await service.adminAction(admin, {
      action: "season",
      id: season.id,
      payload: {
        ...setupData().season,
        registrations_open_at: "2026-10-20T09:00",
        purge_at: "2026-11-02T12:00",
      },
    });
    expect((await service.publicState()).season?.registrations_open).toBe(
      false,
    );
    await expect(
      service.createParticipation(participant, {
        house: houseData(),
        acceptance: acceptance(),
      }),
    ).rejects.toMatchObject({ status: 403 });
    for (const dates of [
      { registrations_open_at: "2026-11-02T12:00" },
      { purge_at: "2026-10-31T12:00" },
    ])
      await expect(
        service.adminAction(admin, {
          action: "season",
          id: season.id,
          payload: { ...setupData().season, ...dates },
        }),
      ).rejects.toMatchObject({ status: 400 });
  });
  it("rejects nonexistent and ambiguous local DST hours, accepts an explicit UTC offset", () => {
    expect(() => localISO("2026-03-29T02:30", "Europe/Paris")).toThrow();
    expect(() => localISO("2026-10-25T02:30", "Europe/Paris")).toThrow();
    expect(localISO("2026-10-25T02:30+02:00", "Europe/Paris")).toBe(
      "2026-10-25T00:30:00.000Z",
    );
  });
  it("migrates an existing V0.1 database without data loss and records migrations idempotently", async () => {
    const legacy = new PGlite();
    try {
      const first = await readFile("migrations/001_initial.sql", "utf8");
      const second = await readFile(
        "migrations/002_season_bootstrap.sql",
        "utf8",
      );
      await legacy.exec(first);
      await legacy.query(
        "INSERT INTO schema_migrations(name) VALUES('001_initial.sql')",
      );
      const i = (
        await legacy.query<{ id: string }>(
          "INSERT INTO instances(public_name,territory,postal_code,country,latitude,longitude) VALUES('Legacy','Legacy','00000','France',48,-1) RETURNING id",
        )
      ).rows[0];
      const s = (
        await legacy.query<{ id: string }>(
          "INSERT INTO seasons(instance_id,year,opens_at,closes_at,routes_count) VALUES($1,2026,'2026-10-31T11:00Z','2026-10-31T23:00Z',42) RETURNING id",
          [i.id],
        )
      ).rows[0];
      const u = (
        await legacy.query<{ id: string }>(
          "INSERT INTO users(instance_id,email,display_name,password_hash,kind) VALUES($1,'legacy@example.invalid','Participant','preserved-hash','PARTICIPANT') RETURNING id",
          [i.id],
        )
      ).rows[0];
      await legacy.query(
        "INSERT INTO houses(instance_id,season_id,user_id,name,address,latitude,longitude,activities,starts_at,ends_at,fear) VALUES($1,$2,$3,'Legacy house','Legacy address',48,-1,ARRAY['CANDY'],'2026-10-31T17:00Z','2026-10-31T20:00Z',2)",
        [i.id, s.id, u.id],
      );
      for (let run = 0; run < 2; run++) {
        await legacy.exec("BEGIN");
        if (
          !(
            await legacy.query(
              "SELECT name FROM schema_migrations WHERE name='002_season_bootstrap.sql'",
            )
          ).rows.length
        ) {
          await legacy.exec(second);
          await legacy.query(
            "INSERT INTO schema_migrations(name) VALUES('002_season_bootstrap.sql')",
          );
        }
        await legacy.exec("COMMIT");
      }
      expect(
        (await legacy.query("SELECT address FROM houses")).rows[0],
      ).toEqual({ address: "Legacy address" });
      expect(
        (await legacy.query("SELECT password_hash FROM users")).rows[0],
      ).toEqual({ password_hash: "preserved-hash" });
      const migrated = (
        await legacy.query<{ routes_count: number; purge_at: Date }>(
          "SELECT routes_count,purge_at FROM seasons",
        )
      ).rows[0];
      expect(migrated.routes_count).toBe(42);
      expect(new Date(migrated.purge_at).toISOString()).toBe(
        "2026-11-02T11:00:00.000Z",
      );
      expect(
        (await legacy.query("SELECT name FROM schema_migrations")).rows,
      ).toHaveLength(2);
    } finally {
      await legacy.close();
    }
  });
});
describe("Synthetic bootstrap", () => {
  it("creates a fresh synthetic instance without a SETUP_TOKEN override", async () => {
    await db().query("TRUNCATE instances,bootstrap,setup_sessions CASCADE");
    const override = process.env.SETUP_TOKEN;
    delete process.env.SETUP_TOKEN;
    process.env.DEMO_PASSWORD = "synthetic-password-1234";
    try {
      await seed();
      expect((await db().query("SELECT id FROM instances")).rows).toHaveLength(
        1,
      );
      expect(
        (await db().query("SELECT id FROM participations WHERE demo=true"))
          .rows,
      ).toHaveLength(12);
      expect(
        (await db().query("SELECT * FROM setup_sessions")).rows,
      ).toHaveLength(0);
    } finally {
      process.env.SETUP_TOKEN = override;
    }
  });
});
const campaignData = () => ({
  season_id: season.id,
  name: "J−14",
  subject: "Bonjour {{name}}",
  body: "{{event_name}} à {{territory}} : {{house_name}}",
  audience: "ALL",
  active: true,
  schedule_mode: "ABSOLUTE",
  anchor: "opens_at",
  offset_days: -14,
  scheduled_at: "2026-10-04T12:00",
});
async function newCampaign(overrides: Record<string, unknown> = {}) {
  await campaignAction(admin, {
    action: "save",
    campaign: { ...campaignData(), ...overrides },
  });
  return (
    await db().query("SELECT * FROM email_campaigns WHERE name=$1", [
      overrides.name ?? campaignData().name,
    ])
  ).rows[0];
}
describe("V0.3 durable accounts, identity and permissions", () => {
  it("creates a durable account without participation and requires email verification before participation", async () => {
    const result = await service.register({
      display_name: "Nouveau",
      email: "new@example.invalid",
      password: "safe-password-1234",
    });
    let u = (await getUser(result.token))!;
    expect(u.email_status).toBe("UNVERIFIED");
    expect(await service.ownHouse(u)).toBeNull();
    await expect(
      service.createParticipation(u, {
        house: houseData(),
        acceptance: acceptance(),
      }),
    ).rejects.toMatchObject({ status: 403 });
    const link = await verifyQueued(u.email);
    u = (await getUser(result.token))!;
    expect(u.email_status).toBe("VERIFIED");
    expect(u.email_verified_at).toBeTruthy();
    await expect(
      consumeIdentity(link.linkToken, "VERIFY"),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.createParticipation(u, {
        house: houseData(),
        acceptance: { ...acceptance(), terms: false },
      }),
    ).rejects.toThrow();
    await service.createParticipation(u, {
      house: houseData(),
      acceptance: acceptance(),
    });
    expect(await service.ownHouse(u)).toMatchObject({
      terms_version: "2026.1",
      guidelines_version: "2026.1",
      legacy_imported: false,
    });
  });
  it("expires and invalidates verification tokens, rate limits resend and never stores raw tokens", async () => {
    const result = await service.register({
      display_name: "Nouveau",
      email: "token@example.invalid",
      password: "safe-password-1234",
    });
    const u = (await getUser(result.token))!;
    await db().query(
      "UPDATE email_outbox SET scheduled_at='2026-10-04T12:00Z' WHERE user_id=$1",
      [u.id],
    );
    let token = "";
    await dispatchEmails(new Date("2026-10-04T12:00Z"), async (m) => {
      token = new URL(m.text.match(/https?:[^\s]+/)![0]).searchParams.get(
        "token",
      )!;
    });
    expect(
      JSON.stringify((await db().query("SELECT * FROM email_tokens")).rows),
    ).not.toContain(token);
    await resendIdentity(u);
    await expect(consumeIdentity(token, "VERIFY")).rejects.toMatchObject({
      status: 400,
    });
    await expect(resendIdentity(u)).rejects.toMatchObject({ status: 429 });
    await db().query(
      "INSERT INTO email_tokens(token_hash,user_id,kind,email_hash,expires_at) VALUES($1,$2,'VERIFY',$3,now()-interval '1 second')",
      [hashToken(token), u.id, hashToken(u.email)],
    );
    await expect(consumeIdentity(token, "VERIFY")).rejects.toMatchObject({
      status: 400,
    });
  });
  it("invites without a plaintext password and activates once with chosen password", async () => {
    const role = (await db().query("SELECT id FROM roles WHERE name='ADMIN'"))
      .rows[0];
    await adminUserAction(admin, {
      action: "invite",
      display_name: "Lecture",
      email: "invite@example.invalid",
      role_id: role.id,
    });
    const old = (
      await db().query(
        "SELECT * FROM users WHERE email='invite@example.invalid'",
      )
    ).rows[0];
    expect(old.password_hash).toBeNull();
    expect(old.account_status).toBe("PENDING_ACTIVATION");
    const invitation = await verifyQueued("invite@example.invalid", "INVITE");
    await expect(
      consumeIdentity(invitation.linkToken, "INVITE"),
    ).rejects.toThrow();
    const result = await activateAccount(invitation.token, {
      password: "chosen-password-1234",
    });
    const u = (await getUser(result.token))!;
    expect(u.email_status).toBe("VERIFIED");
    expect(u.permissions).toContain("admin.access");
    await expect(
      activateAccount(invitation.token, { password: "chosen-password-1234" }),
    ).rejects.toThrow();
  });
  it("requires the current password for email change, reverifies and revokes sessions", async () => {
    await expect(
      accountAction(participant, {
        action: "email",
        email: "changed@example.invalid",
        current_password: "bad",
      }),
    ).rejects.toMatchObject({ status: 403 });
    const r = await accountAction(participant, {
      action: "email",
      email: "changed@example.invalid",
      current_password: "valid-password-1234",
    });
    const u = (await getUser("token" in r ? r.token : undefined))!;
    expect(u.email_status).toBe("UNVERIFIED");
    expect(u.email_verified_at).toBeNull();
  });
  it("withdraws participation but retains account; voluntary account deletion cascades everything", async () => {
    await service.participantAction(participant, {
      action: "delete",
      confirm: "SUPPRIMER",
    });
    expect(await service.ownHouse(participant)).toBeNull();
    expect(
      (await db().query("SELECT id FROM users WHERE id=$1", [participant.id]))
        .rows,
    ).toHaveLength(1);
    await service.createParticipation(participant, {
      house: houseData(),
      acceptance: acceptance(),
    });
    await accountAction(participant, {
      action: "delete",
      current_password: "valid-password-1234",
      confirm: "SUPPRIMER MON COMPTE",
    });
    expect(
      (await db().query("SELECT * FROM participations")).rows,
    ).toHaveLength(0);
    expect(
      (await db().query("SELECT * FROM users WHERE id=$1", [participant.id]))
        .rows,
    ).toHaveLength(0);
    expect(
      (
        await db().query("SELECT * FROM email_outbox WHERE user_id=$1", [
          participant.id,
        ])
      ).rows,
    ).toHaveLength(0);
  });
});
describe("V0.3 campaigns and outbox", () => {
  it("supports absolute/relative schedules, recomputes dates and protects communications permissions", async () => {
    const c = await newCampaign({ schedule_mode: "RELATIVE" });
    expect(new Date(String(c.scheduled_at)).toISOString()).toBe(
      "2026-10-17T10:00:00.000Z",
    );
    await service.adminAction(admin, {
      action: "season",
      id: season.id,
      payload: { ...setupData().season, opens_at: "2026-10-31T13:00" },
    });
    expect(
      new Date(
        String(
          (
            await db().query(
              "SELECT scheduled_at FROM email_campaigns WHERE id=$1",
              [c.id],
            )
          ).rows[0].scheduled_at,
        ),
      ).toISOString(),
    ).toBe("2026-10-17T11:00:00.000Z");
    await expect(campaignAdmin(participant)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      campaignAction(participant, { action: "save", campaign: campaignData() }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("claims atomically across concurrent workers, renders allowed variables and sends SENT only once", async () => {
    const c = await newCampaign();
    const sender = vi.fn(async () => {});
    await Promise.all([
      dispatchEmails(new Date("2026-10-04T12:00Z"), sender),
      dispatchEmails(new Date("2026-10-04T12:00Z"), sender),
    ]);
    await dispatchEmails(new Date("2026-10-04T12:10Z"), sender);
    expect(sender).toHaveBeenCalledTimes(1);
    expect(
      (
        await db().query(
          "SELECT sent,status FROM email_campaigns WHERE id=$1",
          [c.id],
        )
      ).rows[0],
    ).toEqual({ sent: 1, status: "SENT" });
    expect(
      JSON.stringify((await db().query("SELECT * FROM audit_logs")).rows),
    ).not.toContain(participant.email);
  });
  it("never retries uncertain SMTP or abandoned claims; safely retries known connection failure", async () => {
    const c = await newCampaign();
    const sender = vi.fn(async () => {
      throw new Error("private SMTP content");
    });
    await dispatchEmails(new Date("2026-10-04T12:00Z"), sender);
    await dispatchEmails(new Date("2026-10-04T12:20Z"), sender);
    expect(sender).toHaveBeenCalledTimes(1);
    expect(
      (
        await db().query(
          "SELECT last_error,retry_safe FROM email_outbox WHERE campaign_id=$1",
          [c.id],
        )
      ).rows[0],
    ).toEqual({ last_error: "SMTP_UNCERTAIN", retry_safe: false });
    const safe = await newCampaign({ name: "Known failure" });
    const refused = vi.fn(async () => {
      throw Object.assign(new Error("connect"), { code: "ECONNREFUSED" });
    });
    await dispatchEmails(new Date("2026-10-04T12:00Z"), refused);
    await dispatchEmails(new Date("2026-10-04T12:06Z"), async () => {});
    expect(
      (
        await db().query(
          "SELECT status,attempts FROM email_outbox WHERE campaign_id=$1",
          [safe.id],
        )
      ).rows[0],
    ).toEqual({ status: "SENT", attempts: 2 });
    const third = await newCampaign({ name: "Abandoned" });
    await db().query(
      "UPDATE email_campaigns SET status='SENDING',recipients=1 WHERE id=$1",
      [third.id],
    );
    await db().query(
      "INSERT INTO email_outbox(user_id,campaign_id,season_id,kind,status,claimed_at,idempotency_key) VALUES($1,$2,$3,'CAMPAIGN','CLAIMED','2026-10-04T11:00Z','abandoned')",
      [participant.id, third.id, season.id],
    );
    await dispatchEmails(new Date("2026-10-04T12:00Z"), async () => {
      throw new Error("must not send");
    });
    expect(
      (
        await db().query(
          "SELECT status FROM email_outbox WHERE idempotency_key='abandoned'",
        )
      ).rows[0].status,
    ).toBe("FAILED");
  });
  it.each(["UNVERIFIED", "BOUNCED", "INVALID", "DEMO", "DISABLED"])(
    "excludes %s recipients",
    async (status) => {
      await newCampaign();
      if (status === "DEMO")
        await db().query("UPDATE users SET demo=true WHERE id=$1", [
          participant.id,
        ]);
      else if (status === "DISABLED")
        await db().query(
          "UPDATE users SET account_status='DISABLED' WHERE id=$1",
          [participant.id],
        );
      else
        await db().query("UPDATE users SET email_status=$1 WHERE id=$2", [
          status,
          participant.id,
        ]);
      const sender = vi.fn(async () => {});
      await dispatchEmails(new Date("2026-10-04T12:00Z"), sender);
      expect(sender).not.toHaveBeenCalled();
    },
  );
  it("purges seasonal delivery identifiers and content while keeping durable users and anonymous totals", async () => {
    await newCampaign();
    await dispatchEmails(new Date("2026-10-04T12:00Z"), async () => {});
    await service.purgeSeason(season.id, admin.instance_id, admin, true);
    expect((await db().query("SELECT * FROM participations")).rows).toEqual([]);
    expect(
      (
        await db().query("SELECT * FROM email_outbox WHERE season_id=$1", [
          season.id,
        ])
      ).rows,
    ).toEqual([]);
    expect(
      (await db().query("SELECT * FROM users WHERE id=$1", [participant.id]))
        .rows,
    ).toHaveLength(1);
    expect(
      (await db().query("SELECT subject,body,sent FROM email_campaigns"))
        .rows[0],
    ).toEqual({ subject: "", body: "", sent: 1 });
  });
});
describe("V0.3 content, legal versions and installation", () => {
  it("edits, defaults, resets and rejects unsafe HTML, URLs and variables", async () => {
    const id = admin.instance_id;
    const initial = await contentState(id);
    await contentAction(admin, {
      action: "save",
      key: "home.title",
      value: "Bienvenue à {{territory}}",
    });
    expect((await contentState(id))["home.title"]).toBe(
      "Bienvenue à {{territory}}",
    );
    await contentAction(admin, { action: "reset", key: "home.title" });
    expect((await contentState(id))["home.title"]).toBe(initial["home.title"]);
    expect(
      (await db().query("SELECT * FROM content_overrides")).rows,
    ).toHaveLength(0);
    for (const value of [
      "<script>alert(1)</script>",
      "[x](javascript:alert(1))",
      "{{password_hash}}",
    ])
      await expect(
        contentAction(admin, { action: "save", key: "home.title", value }),
      ).rejects.toMatchObject({ status: 400 });
    expect(sanitizeContent("**Titre**\n\n- [Lien](/privacy)")).toContain(
      "**Titre**",
    );
  });
  it("publishes immutable documents and requires current acceptance for significant changes", async () => {
    await contentAction(admin, {
      action: "draft",
      document: {
        kind: "TERMS",
        version: "2026.2",
        title: "Nouvelles conditions",
        body: "Respectez les horaires.",
        requires_reaccept: true,
      },
    });
    const d = (
      await db().query("SELECT id FROM legal_documents WHERE version='2026.2'")
    ).rows[0];
    await contentAction(admin, { action: "publish", id: d.id });
    expect((await legalState(admin.instance_id)).TERMS.version).toBe("2026.2");
    await expect(
      db().query("UPDATE legal_documents SET body=$1 WHERE id=$2", [
        "overwritten",
        d.id,
      ]),
    ).rejects.toThrow();
    await expect(
      service.updateHouse(participant, house.id, houseData()),
    ).rejects.toThrow();
    await service.updateHouse(participant, house.id, {
      ...houseData(),
      acceptance: { ...acceptance(), terms_version: "2026.2" },
    });
    expect((await service.ownHouse(participant))?.terms_version).toBe("2026.2");
    expect(
      (
        await db().query(
          "SELECT body FROM legal_documents WHERE version='2026.1' AND kind='TERMS'",
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("uses installable manifest/icons and never caches private API or navigation", async () => {
    const m = manifest();
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    expect(m.icons?.some((i) => i.purpose === "maskable")).toBe(true);
    for (const size of [192, 512]) {
      const png = await readFile("public/pwa/icon-" + size + ".png");
      expect(png.readUInt32BE(16)).toBe(size);
      expect(png.readUInt32BE(20)).toBe(size);
    }
    const handlers: Record<string, (event: unknown) => void> = {};
    const put = vi.fn(async () => {});
    const offline = { offline: true };
    let connected = true;
    const fetcher = vi.fn(async () => {
      if (!connected) throw Error("offline");
      return { ok: true, clone: () => ({ static: true }) };
    });
    runInNewContext(await readFile("public/sw.js", "utf8"), {
      URL,
      self: {
        location: { origin: "https://example.invalid" },
        addEventListener: (name: string, fn: (event: unknown) => void) =>
          (handlers[name] = fn),
      },
      caches: {
        match: async (path: unknown) =>
          path === "/offline.html" ? offline : undefined,
        open: async () => ({ put }),
      },
      fetch: fetcher,
    });
    const respondWith = vi.fn();
    handlers.fetch({
      request: {
        method: "GET",
        url: "https://example.invalid/api/me",
        mode: "cors",
      },
      respondWith,
    });
    expect(respondWith).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    handlers.fetch({
      request: {
        method: "GET",
        url: "https://example.invalid/account",
        mode: "navigate",
      },
      respondWith,
    });
    await respondWith.mock.calls.at(-1)![0];
    expect(put).not.toHaveBeenCalled();
    connected = false;
    handlers.fetch({
      request: {
        method: "GET",
        url: "https://example.invalid/participant",
        mode: "navigate",
      },
      respondWith,
    });
    expect(await respondWith.mock.calls.at(-1)![0]).toEqual(offline);
    expect(put).not.toHaveBeenCalled();
  });
  it("preserves realistic V0.2 hashes, privileges, state, data, dates and reminder delivery across replay", async () => {
    const legacy = new PGlite();
    try {
      await legacy.exec(await readFile("migrations/001_initial.sql", "utf8"));
      await legacy.exec(
        await readFile("migrations/002_season_bootstrap.sql", "utf8"),
      );
      const i = (
        await legacy.query<{ id: string }>(
          "INSERT INTO instances(public_name,territory,postal_code,country,latitude,longitude) VALUES('Legacy','Legacy','00000','France',48,-1) RETURNING id",
        )
      ).rows[0];
      const role = (
        await legacy.query<{ id: string }>(
          "INSERT INTO roles(instance_id,name,permissions) VALUES($1,'SUPER_ADMIN',ARRAY['users.manage','roles.manage','season.preview']) RETURNING id",
          [i.id],
        )
      ).rows[0];
      const adminId = (
        await legacy.query<{ id: string }>(
          "INSERT INTO users(instance_id,email,display_name,password_hash,role_id,kind) VALUES($1,'admin@legacy.invalid','Admin','preserved-admin-hash',$2,'STAFF') RETURNING id",
          [i.id, role.id],
        )
      ).rows[0];
      const u = (
        await legacy.query<{ id: string }>(
          "INSERT INTO users(instance_id,email,display_name,password_hash,kind) VALUES($1,'visitor@legacy.invalid','Visitor','preserved-user-hash','PARTICIPANT') RETURNING id",
          [i.id],
        )
      ).rows[0];
      const s = (
        await legacy.query<{ id: string }>(
          "INSERT INTO seasons(instance_id,year,opens_at,closes_at,registrations_open_at,purge_at,reminder_enabled,reminder_at,reminder_subject,reminder_body,reminder_status,reminder_recipients) VALUES($1,2026,'2026-10-31T11:00Z','2026-10-31T23:00Z','2026-10-01T00:00Z','2026-11-02T12:00Z',true,'2026-10-30T12:00Z','Reminder','Body','SENDING',1) RETURNING id",
          [i.id],
        )
      ).rows[0];
      await legacy.query(
        "UPDATE instances SET active_season_id=$1 WHERE id=$2",
        [s.id, i.id],
      );
      await legacy.query(
        "INSERT INTO houses(instance_id,season_id,user_id,name,address,latitude,longitude,activities,starts_at,ends_at,fear,status,activity) VALUES($1,$2,$3,'House','Legacy address',48,-1,ARRAY['CANDY'],'2026-10-31T17:00Z','2026-10-31T20:00Z',2,'APPROVED','PAUSED')",
        [i.id, s.id, u.id],
      );
      await legacy.query(
        "INSERT INTO reminder_deliveries(season_id,user_id,status,claimed_at) VALUES($1,$2,'CLAIMED','2026-10-30T12:00Z')",
        [s.id, u.id],
      );
      const migration = await readFile(
        "migrations/003_durable_accounts.sql",
        "utf8",
      );
      for (let pass = 0; pass < 2; pass++) {
        await legacy.exec("BEGIN");
        await legacy.exec(migration);
        await legacy.exec("COMMIT");
      }
      expect(
        (
          await legacy.query(
            "SELECT address,status,activity,legacy_imported FROM participations",
          )
        ).rows[0],
      ).toEqual({
        address: "Legacy address",
        status: "APPROVED",
        activity: "PAUSED",
        legacy_imported: true,
      });
      expect(
        (
          await legacy.query("SELECT password_hash FROM users WHERE id=$1", [
            adminId.id,
          ])
        ).rows[0],
      ).toEqual({ password_hash: "preserved-admin-hash" });
      expect(
        (
          await legacy.query("SELECT password_hash FROM users WHERE id=$1", [
            u.id,
          ])
        ).rows[0],
      ).toEqual({ password_hash: "preserved-user-hash" });
      expect(
        (
          await legacy.query("SELECT permissions FROM roles WHERE id=$1", [
            role.id,
          ])
        ).rows[0],
      ).toMatchObject({
        permissions: expect.arrayContaining([
          "users.manage",
          "roles.manage",
          "admin.access",
        ]),
      });
      expect(
        (await legacy.query("SELECT * FROM email_campaigns")).rows,
      ).toHaveLength(1);
      expect(
        (await legacy.query("SELECT status FROM email_outbox")).rows,
      ).toEqual([{ status: "CLAIMED" }]);
      expect(
        (
          await legacy.query("SELECT email_status FROM users WHERE id=$1", [
            u.id,
          ])
        ).rows[0],
      ).toEqual({ email_status: "UNVERIFIED" });
      const v04 = await readFile(
        "migrations/004_beta_simplification.sql",
        "utf8",
      );
      for (let pass = 0; pass < 2; pass++) {
        await legacy.exec("BEGIN");
        await legacy.exec(v04);
        await legacy.exec("COMMIT");
      }
      expect(
        (
          await legacy.query(
            "SELECT address,status,activity FROM participations",
          )
        ).rows[0],
      ).toEqual({
        address: "Legacy address",
        status: "VISIBLE",
        activity: "PAUSED",
      });
      expect(
        (
          await legacy.query(
            "SELECT u.password_hash,r.name FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1",
            [adminId.id],
          )
        ).rows[0],
      ).toEqual({ password_hash: "preserved-admin-hash", name: "SUPER_ADMIN" });
      expect(
        (
          await legacy.query<{ permissions: string[] }>(
            "SELECT permissions FROM roles",
          )
        ).rows.every((row) => (row.permissions as string[]).length === 0),
      ).toBe(true);
    } finally {
      await legacy.close();
    }
  });
});
