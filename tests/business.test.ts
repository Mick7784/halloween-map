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
import { db, type Database } from "../lib/db";
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
  } else {
    const pg = new PGlite();
    engine = pg;
    await pg.exec(await readFile("migrations/001_initial.sql", "utf8"));
    globalDb.testDb = {
      async query(sql, values) {
        const q = sql.includes("pg_advisory_xact_lock") ? "SELECT 1" : sql;
        const r = await pg.query(q, values);
        return { rows: r.rows as never[], rowCount: r.affectedRows };
      },
    };
  }
});
beforeEach(async () => {
  await db().query(
    "TRUNCATE instances,roles,users,seasons,houses,sessions,audit_logs,rate_limits RESTART IDENTITY CASCADE",
  );
  const first = await service.setup(setupData());
  admin = (await getUser(first.token))!;
  const registration = await service.register({
    account: {
      email: "visitor@example.invalid",
      password: "valid-password-1234",
    },
    house: houseData(),
  });
  participant = (await getUser(registration.token))!;
  house = (await service.ownHouse(participant)) as unknown as House;
  season = (await service.activeSeason((await service.instance())!))!;
});
afterAll(async () => {
  vi.useRealTimers();
  delete globalDb.testDb;
  if (engine instanceof Pool) await engine.end();
  else await engine.close();
});
describe("Setup, authentication and RBAC", () => {
  it("creates an instance, admin, four roles and inactive first season", async () => {
    expect(admin.role_name).toBe("SUPER_ADMIN");
    expect(season.activated).toBe(false);
    expect((await db().query("SELECT * FROM roles")).rows).toHaveLength(4);
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
        action: "moderate",
        id: house.id,
        payload: "APPROVED",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("supports custom permissions and prevents local admin escalation", async () => {
    await service.adminAction(admin, {
      action: "role",
      payload: { name: "CUSTOM_READER", permissions: ["participants.read"] },
    });
    const custom = (
      await db().query("SELECT * FROM roles WHERE name='CUSTOM_READER'")
    ).rows[0];
    expect(custom.permissions).toEqual(["participants.read"]);
    const local = {
      ...admin,
      role_name: "LOCAL_ADMIN",
      permissions: admin.permissions.filter((p) => p !== "roles.manage"),
    };
    await expect(
      service.adminAction(local, {
        action: "role",
        payload: { name: "BAD", permissions: ["users.manage"] },
      }),
    ).rejects.toMatchObject({ status: 403 });
    const superRole = (
      await db().query("SELECT id FROM roles WHERE name='SUPER_ADMIN'")
    ).rows[0];
    await expect(
      service.adminAction(local, {
        action: "createStaff",
        payload: {
          email: "staff@example.invalid",
          password: "valid-password-1234",
          display_name: "Staff",
          role_id: superRole.id,
        },
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
      action: "moderate",
      id: house.id,
      payload: "APPROVED",
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
    expect(visible(house, { ...season, activated: true }, now)).toBe(false);
    expect(
      visible(
        { ...house, status: "APPROVED" },
        { ...season, activated: true },
        now,
      ),
    ).toBe(true);
    expect(
      visible(
        { ...house, status: "APPROVED" },
        { ...season, activated: true },
        new Date(house.ends_at),
      ),
    ).toBe(false);
    await db().query("UPDATE seasons SET activated=true WHERE id=$1", [
      season.id,
    ]);
    await service.adminAction(admin, {
      action: "moderate",
      id: house.id,
      payload: "APPROVED",
    });
    const result = await service.publicState(now);
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
        { ...h, status: "APPROVED", activities: ["CANDY"] },
        { ...season, activated: true },
        new Date("2026-10-31T18:00Z"),
      ),
    ).toBe(false);
  });
  it("revalidates address and text edits and forbids invalid hours", async () => {
    await service.adminAction(admin, {
      action: "moderate",
      id: house.id,
      payload: "APPROVED",
    });
    expect(
      await service.updateHouse(participant, house.id, {
        ...houseData(),
        rp: "Nouvelle ambiance",
      }),
    ).toEqual({ status: "PENDING" });
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
  it("requires confirmation and deletes the participant and all linked data", async () => {
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
    ).toEqual([]);
    expect((await db().query("SELECT * FROM houses")).rows).toEqual([]);
    expect(
      (
        await db().query("SELECT * FROM sessions WHERE user_id=$1", [
          participant.id,
        ])
      ).rows,
    ).toEqual([]);
    expect(
      (await db().query("SELECT * FROM users WHERE id=$1", [admin.id])).rows,
    ).toHaveLength(1);
  });
  it("automatically closes and purges idempotently, retaining only anonymous totals", async () => {
    await service.adminAction(admin, {
      action: "moderate",
      id: house.id,
      payload: "APPROVED",
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
      (await db().query("SELECT * FROM users WHERE kind='PARTICIPANT'")).rows,
    ).toEqual([]);
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
    expect((await db().query("SELECT * FROM roles")).rows).toHaveLength(4);
  });
  it("restricts manual purge to Super Admin, refuses revival and starts new seasons inactive", async () => {
    await expect(
      service.adminAction(
        { ...admin, role_name: "LOCAL_ADMIN" },
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
  it("respects filters, walking time, availability and closing hours", () => {
    const s = { ...season, activated: true };
    const h = { ...house, status: "APPROVED" };
    const input = {
      start: "2026-10-31T17:05:00Z",
      end: "2026-10-31T20:00:00Z",
      origin: { latitude: 48.1, longitude: -1.67 },
      activities: ["CANDY"] as const,
    };
    const r = planRoute(
      [h],
      s,
      { ...input, activities: [...input.activities] },
      new Date(input.start),
    );
    expect(r.stops).toHaveLength(1);
    expect(r.durationMinutes).toBeGreaterThanOrEqual(5);
    expect(
      planRoute(
        [{ ...h, candy_available: false }],
        s,
        { ...input, activities: [...input.activities] },
        new Date(input.start),
      ).stops,
    ).toHaveLength(0);
    expect(
      planRoute(
        [{ ...h, activity: "PAUSED" }],
        s,
        { ...input, activities: [...input.activities] },
        new Date(input.start),
      ).stops,
    ).toHaveLength(0);
    expect(
      planRoute(
        [{ ...h, fear: 5, adaptable: true }],
        s,
        { ...input, activities: [], maxFear: 1 },
        new Date(input.start),
      ).stops,
    ).toHaveLength(1);
    expect(
      planRoute(
        [{ ...h, ends_at: "2026-10-31T17:07:00Z" }],
        s,
        { ...input, activities: [] },
        new Date(input.start),
      ).stops,
    ).toHaveLength(0);
    expect(() =>
      planRoute(
        [h],
        season,
        { ...input, activities: [] },
        new Date(input.start),
      ),
    ).toThrow("fermée");
  });
  it("waits for future opening and orders feasible houses", () => {
    const a = { ...house, status: "APPROVED", starts_at: "2026-10-31T18:00Z" };
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
    const r = planRoute(
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
  it("public route API never reveals a house that has not opened yet", async () => {
    const current = (await db().query("SELECT now() current")).rows[0].current;
    const now = new Date(String(current));
    vi.setSystemTime(now);
    await db().query(
      "UPDATE seasons SET activated=true,opens_at=now()-interval '1 day',closes_at=now()+interval '1 day' WHERE id=$1",
      [season.id],
    );
    await db().query(
      "UPDATE houses SET status='APPROVED',starts_at=now()+interval '1 hour',ends_at=now()+interval '3 hours' WHERE id=$1",
      [house.id],
    );
    const result = await service.route({
      start: new Date(+now + 7200000).toISOString(),
      end: new Date(+now + 10800000).toISOString(),
      origin: { latitude: 48.1, longitude: -1.67 },
      activities: [],
    });
    expect(result.stops).toHaveLength(0);
    expect(JSON.stringify(result)).not.toContain(house.address);
    vi.setSystemTime(new Date("2026-10-04T12:00:00Z"));
  });
  it("seeds 12 synthetic houses idempotently and removes only demo participants", async () => {
    process.env.DEMO_PASSWORD = "demo-password-1234";
    await seed();
    await seed();
    expect(
      (await db().query("SELECT * FROM houses WHERE demo=true")).rows,
    ).toHaveLength(12);
    await seed("off");
    expect(
      (await db().query("SELECT * FROM houses WHERE demo=true")).rows,
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
