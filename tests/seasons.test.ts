import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { db, type Database } from "../lib/db";
import * as actualService from "../lib/service";
const service = {
  ...actualService,
  adminAction: (user: User | null, input: unknown) =>
    actualService.adminAction(user, {
      current_password: "test-password-1234",
      ...(input as Record<string, unknown>),
    }),
};
import { adminUserAction as actualAdminUserAction } from "../lib/accounts";
import { getUser, createSession } from "../lib/auth";
import { campaignAction, campaignAdmin, dispatchEmails } from "../lib/mail";
import { reportCollection } from "../lib/season-statistics";
import { seasonLabel, defaultRoles, type Season, type User } from "../lib/domain";
import { fixtureRouter } from "./walking-fixture";
vi.mock("../lib/walking-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/walking-router")>()),
  createWalkingRouter: () => fixtureRouter,
}));
const globals = globalThis as unknown as { testDb?: Database };
let engine: PGlite | Pool, admin: User, ordinary: User, real: Season;
const files = (await readdir("migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort();
const realDefinition = {
  name: "Halloween 2026",
  year: 2026,
  is_test: false,
  registrations_open: true,
  registrations_open_at: "2026-10-01T00:00Z",
  opens_at: "2026-10-31T16:00Z",
  closes_at: "2026-10-31T23:00Z",
  purge_at: "2026-11-02T12:00Z",
};
const houseDefinition = {
  name: "Maison test",
  address: "Adresse privée",
  position_confirmed: true,
  latitude: 48.1,
  longitude: -1.67,
  activities: ["CANDY", "DECORATION"],
  starts_at: "2026-10-31T17:00Z",
  ends_at: "2026-10-31T22:00Z",
  fear: 2,
  adaptable: false,
  rp: "Description privée",
  practical: "Infos privées",
};
const acceptance = {
  mode: "GUIDELINES_ONLY",
  guidelines: true,
  guidelines_version: "2026.1",
};
async function testSeason(name = "Essais") {
  await service.adminAction(admin, {
    action: "season",
    payload: { name, is_test: true },
  });
  return (await db().query("SELECT * FROM seasons WHERE name=$1", [name]))
    .rows[0] as unknown as Season;
}
async function activate(s: Season, u = admin) {
  return service.adminAction(u, {
    action: "activateSeason",
    id: s.id,
    payload: "ACTIVER",
  });
}
async function directAccount(name = "Mr Test 1") {
  const role = (await db().query("SELECT id FROM roles WHERE name='USER'"))
    .rows[0];
  const created = await adminUserAction(admin, {
    action: "invite",
    without_invitation: true,
    display_name: name,
    role_id: role.id,
    password: "test-password-1234",
  });
  return (await getUser(
    await createSession(String((created as { id?: string }).id)),
  ))!;
}
async function createHouse(owner: User, s: Season) {
  await service.adminAction(admin, {
    action: "createHouse",
    seasonId: s.id,
    payload: {
      userId: owner.id,
      participation: { house: houseDefinition, acceptance },
    },
  });
  return (
    await db().query(
      "SELECT * FROM participations WHERE season_id=$1 AND user_id=$2",
      [s.id, owner.id],
    )
  ).rows[0];
}
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-07T12:00Z"));
  process.env.SETUP_TOKEN = "season-test-key";
  if (process.env.TEST_DATABASE_URL) {
    engine = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await engine.query("DROP SCHEMA public CASCADE;CREATE SCHEMA public");
    globals.testDb = engine;
    for (const f of files)
      await engine.query(await readFile("migrations/" + f, "utf8"));
  } else {
    const pg = new PGlite();
    engine = pg;
    for (const f of files)
      await pg.exec(await readFile("migrations/" + f, "utf8"));
    globals.testDb = {
      async query(sql, values) {
        const r = await pg.query(
          sql.includes("pg_advisory_xact_lock") ? "SELECT 1" : sql,
          values,
        );
        return { rows: r.rows as never[], rowCount: r.affectedRows };
      },
    };
  }
});
beforeEach(async () => {
  vi.setSystemTime(new Date("2026-10-07T12:00Z"));
  await db().query(
    "TRUNCATE instances,bootstrap,setup_sessions,rate_limits RESTART IDENTITY CASCADE",
  );
  const setup = await service.setup({
    token: "season-test-key",
    instance: {
      public_name: "Halloween",
      territory: "Commune",
      postal_code: "00000",
      country: "France",
      timezone: "Europe/Paris",
      latitude: 48.1,
      longitude: -1.67,
      zoom: 14,
    },
    admin: {
      display_name: "Admin",
      email: "admin@example.invalid",
      password: "test-password-1234",
    },
    season: realDefinition,
  });
  admin = (await getUser(setup.token))!;
  expect((await service.instance())?.active_season_id).toBeNull();
  const configured = (await db().query("SELECT id FROM seasons")).rows[0];
  await service.adminAction(admin, {
    action: "activateSeason",
    id: configured.id,
    payload: "ACTIVER",
  });
  real = (await service.activeSeason((await service.instance())!))!;
  ordinary = await directAccount("Visiteur");
});
afterAll(async () => {
  vi.useRealTimers();
  delete globals.testDb;
  if (engine instanceof Pool) await engine.end();
  else await engine.close();
});

it("uses one pointer for REAL/TEST, serializes competing activations, and rejects ADMIN critical actions", async () => {
  const a = await testSeason("A"),
    b = await testSeason("B");
  expect((await service.instance())?.active_season_id).toBe(real.id);
  expect(seasonLabel(a)).toBe("DÉSACTIVÉE");
  await Promise.all([activate(a), activate(b)]);
  expect([a.id, b.id]).toContain((await service.instance())?.active_season_id);
  const rows = (await service.adminRead(admin, "seasons")) as Season[];
  expect(rows.filter((s) => s.active)).toHaveLength(1);
  await activate(real);
  expect((await service.instance())?.active_season_id).toBe(real.id);
  await expect(
    activate(a, { ...admin, role_name: "ADMIN" }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    service.adminAction(
      { ...admin, role_name: "ADMIN" },
      { action: "season", payload: { name: "Forbidden", is_test: true } },
    ),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    service.deleteSeason(admin, real.id, real.name),
  ).rejects.toMatchObject({ status: 409 });
  await service.adminAction(admin, {
    action: "deactivateSeason",
    id: real.id,
    payload: "DÉSACTIVER",
  });
  expect((await service.instance())?.active_season_id).toBeNull();
  const globalUser = await directAccount("Sans saison active");
  expect(globalUser.account_status).toBe("ACTIVE");
  expect(globalUser.email).toMatch(/^test-[a-f0-9]{32}@example[.]invalid$/);
  const empty = await service.publicState(undefined, ordinary);
  expect(empty.season).toBeNull();
  expect(empty.mapAccessible).toBe(false);
  await expect(
    service.createParticipation(ordinary, {
      house: houseDefinition,
      acceptance,
    }),
  ).rejects.toMatchObject({ status: 403 });
  expect(
    ((await service.adminRead(admin, "dashboard")) as { season: unknown })
      .season,
  ).toBeNull();
});
it("does not leak TEST to USER, while ADMIN/Super Admin use the same houses, route and availability APIs", async () => {
  const s = await testSeason();
  await activate(s);
  const owner = await directAccount();
  const h = await createHouse(owner, s);
  expect(h.review_status).toBe("VALIDATED");
  for (const u of [null, ordinary, owner]) {
    const publicState = await service.publicState(undefined, u);
    expect(publicState.season).toBeNull();
    expect(publicState.houses).toEqual([]);
    expect(publicState.routeCandidates).toEqual([]);
    expect(publicState.mapAccessible).toBe(false);
    expect(JSON.stringify(publicState)).not.toContain(h.address);
  }
  expect(await service.ownHouse(owner)).toBeNull();
  await expect(
    service.createParticipation(owner, { house: houseDefinition, acceptance }),
  ).rejects.toMatchObject({ status: 403 });
  vi.setSystemTime(new Date(houseDefinition.starts_at));
  const now = new Date(),
    input = {
      acceptance,
      start: now.toISOString(),
      end: new Date(+now + 3600000).toISOString(),
      origin: { latitude: 48.1, longitude: -1.67 },
      activities: [],
    };
  await expect(service.route(input, { now }, ordinary)).rejects.toMatchObject({
    status: 403,
  });
  for (const u of [admin, { ...admin, role_name: "ADMIN" }]) {
    const state = await service.publicState(undefined, u);
    expect(state.mapAccessible).toBe(true);
    expect(state.houses?.map((h) => h.id)).toEqual([h.id]);
    const route = await service.route(input, { now }, u);
    expect(route.stops).toHaveLength(1);
    expect(
      (
        await service.routeAvailability(
          u,
          {
            instanceId: admin.instance_id,
            seasonId: s.id,
            mode: "COLLECTION",
            end: input.end,
            activities: [],
            steps: [
              { id: h.id, arrival: input.start, departure: input.end, key: "" },
            ],
          },
          { now },
        )
      ).valid,
    ).toBe(true);
  }
  await service.adminAction(admin, {
    action: "houseActivity",
    id: h.id,
    seasonId: s.id,
    payload: { action: "end" },
  });
  expect((await service.publicState(undefined, admin)).houses).toEqual([]);
  await service.adminAction(admin, {
    action: "houseActivity",
    id: h.id,
    seasonId: s.id,
    payload: { action: "resume" },
  });
  await service.adminAction(admin, {
    action: "houseActivity",
    id: h.id,
    seasonId: s.id,
    payload: { action: "candy", available: false },
  });
  expect(
    (await service.publicState(undefined, admin)).houses?.[0].activities,
  ).toEqual(["DECORATION"]);
  await service.adminAction(admin, {
    action: "visibility",
    id: h.id,
    seasonId: s.id,
    payload: "HIDDEN",
  });
  expect((await service.publicState(undefined, admin)).houses).toEqual([]);
});
it("keeps accounts/passwords/session on TEST deletion and reuses one account in different seasons", async () => {
  const s = await testSeason();
  await activate(s);
  const owner = await directAccount();
  expect(owner.email).toMatch(/^test-[a-f0-9]{32}@example\.invalid$/);
  expect(owner.email_status).toBe("VERIFIED");
  const before = (
    await db().query("SELECT password_hash FROM users WHERE id=$1", [owner.id])
  ).rows[0];
  expect(
    (
      await db().query("SELECT * FROM email_outbox WHERE user_id=$1", [
        owner.id,
      ])
    ).rows,
  ).toEqual([]);
  await createHouse(owner, s);
  await activate(real);
  await createHouse(owner, real);
  expect(
    (
      await db().query(
        "SELECT season_id FROM participations WHERE user_id=$1",
        [owner.id],
      )
    ).rows,
  ).toHaveLength(2);
  // The browser cannot attach a new house to an arbitrary inactive season.
  const another = await directAccount("Other");
  await expect(createHouse(another, s)).rejects.toMatchObject({ status: 409 });
  await service.deleteSeason(admin, s.id, s.name);
  expect(
    (
      await db().query("SELECT password_hash FROM users WHERE id=$1", [
        owner.id,
      ])
    ).rows[0],
  ).toEqual(before);
  expect(
    (await db().query("SELECT * FROM sessions WHERE user_id=$1", [owner.id]))
      .rows,
  ).toHaveLength(1);
  expect(
    (
      await db().query("SELECT * FROM participations WHERE season_id=$1", [
        s.id,
      ])
    ).rows,
  ).toEqual([]);
  expect(
    (
      await db().query("SELECT * FROM participations WHERE season_id=$1", [
        real.id,
      ])
    ).rows,
  ).toHaveLength(1);
});
it("keeps several planned REAL seasons inactive and dashboard tied to active rather than BO selection", async () => {
  for (const year of [2027, 2028])
    await service.adminAction(admin, {
      action: "season",
      payload: {
        ...realDefinition,
        name: "Halloween " + year,
        year,
        opens_at: `${year}-10-31T16:00Z`,
        closes_at: `${year}-10-31T23:00Z`,
        registrations_open_at: `${year}-10-01T00:00Z`,
        purge_at: `${year}-11-02T12:00Z`,
      },
    });
  const rows = (await service.adminRead(admin, "seasons")) as Season[];
  expect(rows.filter((s) => seasonLabel(s) === "PLANIFIÉE")).toHaveLength(2);
  const s = await testSeason();
  await activate(s);
  await createHouse(ordinary, s);
  const d = (await service.adminRead(
    admin,
    "dashboard",
    real.id,
  )) as unknown as { pending: number; season: Season };
  expect(d.pending).toBe(0);
  expect(d.season.id).toBe(s.id);
  expect(await service.adminRead(admin, "houses", real.id)).toEqual([]);
  const users = (await service.adminRead(admin, "users", real.id)) as User[];
  expect(users.map((u) => u.id)).toContain(ordinary.id);
});
it("enforces REAL opening/closing, takes anonymous snapshot, purges details, freezes history and deletes it", async () => {
  await createHouse(ordinary, real);
  const h = (
    await db().query("SELECT id FROM participations WHERE season_id=$1", [
      real.id,
    ])
  ).rows[0];
  await service.adminAction(admin, {
    action: "reviewHouse",
    id: h.id,
    payload: { status: "VALIDATED" },
  });
  expect((await service.publicState(undefined, ordinary)).mapAccessible).toBe(
    false,
  );
  vi.setSystemTime(new Date("2026-10-31T18:00Z"));
  expect((await service.publicState(undefined, ordinary)).mapAccessible).toBe(
    true,
  );
  const id = randomUUID(),
    session = await createSession(ordinary.id),
    report = { id, seasonId: real.id, planned: 2, event: "start" };
  await Promise.all([
    reportCollection(ordinary, report, session),
    reportCollection(ordinary, report, session),
  ]);
  await Promise.all([
    reportCollection(
      ordinary,
      {
        ...report,
        event: "finish",
        visited: 1,
        distanceMeters: 1000,
        durationSeconds: 600,
      },
      session,
    ),
    reportCollection(
      ordinary,
      {
        ...report,
        event: "finish",
        visited: 1,
        distanceMeters: 1000,
        durationSeconds: 600,
      },
      session,
    ),
  ]);
  const live = (
    await db().query("SELECT stats FROM seasons WHERE id=$1", [real.id])
  ).rows[0].stats;
  expect(live).toMatchObject({
    collections_started: 1,
    collections_finished: 1,
    visited: 1,
    distance_meters: 1000,
    duration_seconds: 600,
    completion_sum: 0.5,
  });
  vi.setSystemTime(new Date(real.closes_at));
  expect((await service.publicState(undefined, ordinary)).mapAccessible).toBe(
    false,
  );
  expect((await service.instance())?.active_season_id).toBeNull();
  const frozen = (
    await db().query("SELECT * FROM seasons WHERE id=$1", [real.id])
  ).rows[0];
  expect(frozen.stats).toMatchObject({
    houses: 1,
    approved: 1,
    participants: 1,
    ...(live as object),
  });
  for (const action of ["reviewHouse", "visibility", "deleteHouse"])
    await expect(
      service.adminAction(admin, {
        action,
        id: h.id,
        seasonId: real.id,
        payload: action === "visibility" ? "HIDDEN" : { status: "REFUSED" },
      }),
    ).rejects.toMatchObject({ status: 403 });
  await expect(activate(real)).rejects.toMatchObject({ status: 400 });
  await expect(
    service.adminAction(admin, {
      action: "season",
      id: real.id,
      payload: realDefinition,
    }),
  ).rejects.toMatchObject({ status: 400 });
  vi.setSystemTime(new Date(real.purge_at));
  await service.tick();
  await service.tick();
  const purged = (
    await db().query("SELECT * FROM seasons WHERE id=$1", [real.id])
  ).rows[0];
  expect(purged.stats).toEqual(frozen.stats);
  expect(await service.adminRead(admin, "statistics", real.id)).toEqual({
    attendance:{activeNow:0,peak:null,points:[]},
    seasonId: real.id,
    snapshot: true,
    stats: frozen.stats,
  });
  for (const table of [
    "participations",
    "email_campaigns",
    "email_outbox",
    "reminder_deliveries",
    "collection_reports",
  ]) {
    expect(
      (await db().query(`SELECT * FROM ${table} WHERE season_id=$1`, [real.id]))
        .rows,
    ).toEqual([]);
  }
  expect(
    (await db().query("SELECT * FROM users WHERE id=$1", [ordinary.id])).rows,
  ).toHaveLength(1);
  expect(JSON.stringify(purged.stats)).not.toMatch(
    /Adresse|latitude|email|user_id|visitedIds|geometry/,
  );
  await expect(
    service.deleteSeason(admin, real.id, "wrong"),
  ).rejects.toMatchObject({ status: 400 });
  await service.deleteSeason(admin, real.id, real.name);
  expect(
    (await db().query("SELECT * FROM seasons WHERE id=$1", [real.id])).rows,
  ).toEqual([]);
});
it("does not auto-purge TEST, blocks USER reports and deduplicates across session renewal", async () => {
  const s = await testSeason();
  await activate(s);
  const id = randomUUID(),
    session = await createSession(admin.id),
    report = { id, seasonId: s.id, event: "start", planned: 2 };
  await reportCollection(admin, report, session);
  await expect(
    reportCollection(ordinary, report, await createSession(ordinary.id)),
  ).rejects.toMatchObject({ status: 409 });
  await reportCollection(
    admin,
    { ...report, event: "finish" },
    await createSession(admin.id),
  );
  expect(
    (await db().query("SELECT stats FROM seasons WHERE id=$1", [s.id])).rows[0]
      .stats,
  ).toMatchObject({ collections_started: 1, collections_finished: 1 });
  await db().query(
    "UPDATE seasons SET purge_at='2026-10-06T00:00Z',closes_at='2026-10-05T00:00Z' WHERE id=$1",
    [s.id],
  );
  await service.tick();
  expect((await service.publicState(undefined, admin)).mapAccessible).toBe(
    true,
  );
  expect((await service.instance())?.active_season_id).toBe(s.id);
  await service.adminAction(admin, {
    action: "deactivateSeason",
    id: s.id,
    payload: "DÉSACTIVER",
  });
  await service.deleteSeason(admin, s.id, s.name);
  expect((await db().query("SELECT * FROM collection_reports")).rows).toEqual(
    [],
  );
});
it("accepts a pending anonymous completion after REAL closing, but never after privacy purge", async () => {
  vi.setSystemTime(new Date("2026-10-31T18:00Z"));
  const session = await createSession(ordinary.id),
    report = {
      id: randomUUID(),
      seasonId: real.id,
      event: "start",
      planned: 2,
    };
  await reportCollection(ordinary, report, session);
  vi.setSystemTime(new Date(real.closes_at));
  await service.tick();
  await reportCollection(
    ordinary,
    {
      ...report,
      event: "finish",
      visited: 1,
      distanceMeters: 100,
      durationSeconds: 600,
    },
    session,
  );
  expect(
    (await db().query("SELECT stats FROM seasons WHERE id=$1", [real.id]))
      .rows[0].stats,
  ).toMatchObject({
    collections_started: 1,
    collections_finished: 1,
    visited: 1,
  });
  await expect(
    reportCollection(
      ordinary,
      { ...report, id: randomUUID(), event: "finish" },
      session,
    ),
  ).rejects.toMatchObject({ status: 409 });
  vi.setSystemTime(new Date(real.purge_at));
  await service.tick();
  await expect(
    reportCollection(ordinary, { ...report, event: "finish" }, session),
  ).rejects.toMatchObject({ status: 409 });
});
it("upgrades V0.6.4 without losing identities/houses or changing REAL active; migration replay is harmless", async () => {
  const pg = new PGlite();
  try {
    for (const f of files.filter((f) => f < "008"))
      await pg.exec(await readFile("migrations/" + f, "utf8"));
    await pg.exec(`INSERT INTO instances(public_name,territory,postal_code,country,latitude,longitude) VALUES('Local','Commune','00000','France',0,0);
      INSERT INTO roles(instance_id,name,permissions) SELECT id,'USER','{}' FROM instances;
      INSERT INTO seasons(instance_id,year,name,is_test,opens_at,closes_at,registrations_open_at,purge_at) SELECT id,2026,'REAL',false,'2026-10-31T00:00Z','2026-11-01T00:00Z','2026-10-01T00:00Z','2026-11-02T00:00Z' FROM instances;
      INSERT INTO seasons(instance_id,year,name,is_test,opens_at,closes_at,registrations_open_at,purge_at) SELECT id,2026,'TEST',true,'2026-10-31T00:00Z','2026-11-01T00:00Z','2026-10-01T00:00Z','2026-11-02T00:00Z' FROM instances;
      UPDATE instances SET active_season_id=(SELECT id FROM seasons WHERE NOT is_test),test_season_id=(SELECT id FROM seasons WHERE is_test);
      INSERT INTO users(instance_id,email,display_name,password_hash,kind,role_id,created_for_season_id) SELECT i.id,'old@example.invalid','Old','UNCHANGED_HASH','PARTICIPANT',r.id,s.id FROM instances i,roles r,seasons s WHERE s.is_test;
      INSERT INTO participations(instance_id,season_id,user_id,name,address,latitude,longitude,activities,starts_at,ends_at,fear) SELECT i.id,s.id,u.id,'Existing house','Existing address',0,0,ARRAY['CANDY'],'2026-10-31T18:00Z','2026-10-31T20:00Z',2 FROM instances i,seasons s,users u WHERE s.is_test;`);
    const before = (await pg.query("SELECT active_season_id FROM instances"))
      .rows;
    const sql = await readFile(
      "migrations/008_single_active_season.sql",
      "utf8",
    );
    await pg.exec(sql);
    await pg.exec("UPDATE participations SET starts_at='2026-10-07T00:00Z'");
    await pg.exec(sql);
    expect(
      (await pg.query("SELECT active_season_id FROM instances")).rows,
    ).toEqual(before);
    expect((await pg.query("SELECT password_hash FROM users")).rows).toEqual([
      { password_hash: "UNCHANGED_HASH" },
    ]);
    expect(
      (await pg.query("SELECT address,starts_at FROM participations")).rows[0],
    ).toMatchObject({
      address: "Existing address",
      starts_at: new Date("2026-10-07T00:00Z"),
    });
    expect((await pg.query("SELECT * FROM seasons")).rows).toHaveLength(2);
    const columns = (
      await pg.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name IN('users','instances','seasons','sessions')",
      )
    ).rows.map((v) => (v as { column_name: string }).column_name);
    for (const name of [
      "test_season_id",
      "created_for_season_id",
      "early_access",
      "activated",
    ])
      expect(columns).not.toContain(name);
    await expect(
      pg.exec(
        "UPDATE instances SET active_season_id='ffffffff-ffff-4fff-8fff-ffffffffffff'",
      ),
    ).rejects.toThrow();
  } finally {
    await pg.close();
  }
});

it("statistics follows the consulted season, including inactive data and empty REAL, without fabricated collection totals", async () => {
  const s = await testSeason();
  await activate(s);
  await createHouse(ordinary, s);
  const expected = {
    houses: 1,
    approved: 1,
    refused: 0,
    pending: 0,
    participants: 1,
    candy: 1,
    decoration: 1,
    acting: 0,
    routes: 0,
  };
  expect(await service.adminRead(admin, "statistics", s.id)).toEqual({
    attendance:{activeNow:0,peak:null,points:[]},
    seasonId: s.id,
    snapshot: false,
    stats: expected,
  });
  await activate(real);
  expect(await service.adminRead(admin, "statistics", s.id)).toEqual({
    attendance:{activeNow:0,peak:null,points:[]},
    seasonId: s.id,
    snapshot: false,
    stats: expected,
  });
  const empty = (await service.adminRead(admin, "statistics", real.id)) as {
    stats: Record<string, number>;
  };
  expect(empty.stats.houses).toBe(0);
  expect(empty.stats.collections_started).toBeUndefined();
  await expect(
    service.adminRead(ordinary, "statistics", s.id),
  ).rejects.toMatchObject({ status: 403 });
});
it("manual creation validates ADMIN and Super Admin houses while public creation ignores supplied review and season fields", async () => {
  await service.createParticipation(ordinary, {
    house: {
      ...houseDefinition,
      review_status: "VALIDATED",
      season_id: randomUUID(),
    },
    acceptance,
    seasonId: randomUUID(),
  });
  const publicHouse = (
    await db().query("SELECT * FROM participations WHERE user_id=$1", [
      ordinary.id,
    ])
  ).rows[0];
  expect(publicHouse.review_status).toBe("PENDING");
  expect(publicHouse.season_id).toBe(real.id);
  const owner = await directAccount("Admin owner"),
    superOwner = await directAccount("Super owner");
  const role = (await db().query("SELECT id FROM roles WHERE name='ADMIN'"))
    .rows[0];
  await db().query("UPDATE users SET role_id=$1 WHERE id=$2", [
    role.id,
    owner.id,
  ]);
  const manager = (await getUser(await createSession(owner.id)))!;
  await db().query("UPDATE users SET admin_permissions=$1 WHERE id=$2",[[...defaultRoles.ADMIN],owner.id]);
  manager.permissions=[...defaultRoles.ADMIN];
  for (const [actor, account] of [
    [manager, owner],
    [admin, superOwner],
  ]) {
    await service.adminAction(actor, {
      action: "createHouse",
      seasonId: real.id,
      payload: {
        userId: account.id,
        participation: {
          house: {
            ...houseDefinition,
            review_status: "PENDING",
            season_id: randomUUID(),
          },
          acceptance,
        },
      },
    });
    expect(
      (
        await db().query(
          "SELECT review_status,season_id FROM participations WHERE user_id=$1",
          [account.id],
        )
      ).rows[0],
    ).toEqual({ review_status: "VALIDATED", season_id: real.id });
  }
  await expect(
    service.adminAction(ordinary, {
      action: "createHouse",
      seasonId: real.id,
      payload: {
        userId: ordinary.id,
        participation: { house: houseDefinition, acceptance },
      },
    }),
  ).rejects.toMatchObject({ status: 403 });
  await service.adminAction(admin, {
    action: "deactivateSeason",
    id: real.id,
    payload: "DÉSACTIVER",
  });
  const another = await directAccount("Inactive owner");
  await expect(createHouse(another, real)).rejects.toMatchObject({
    status: 403,
  });
});

// Reconstructed Lots 1 + 2: regressions against the V0.7.1 season model.
it("resubmits an owner-edited refusal while admin edits preserve moderation", async () => {
  const house = await createHouse(ordinary, real);
  await db().query(
    "UPDATE participations SET review_status='REFUSED',refusal_reason='Adresse' WHERE id=$1",
    [house.id],
  );
  await service.updateHouse(
    admin,
    String(house.id),
    { ...houseDefinition, name: "Correction admin" },
    true,
  );
  expect(
    (
      await db().query("SELECT review_status FROM participations WHERE id=$1", [
        house.id,
      ])
    ).rows[0].review_status,
  ).toBe("REFUSED");
  await service.updateHouse(ordinary, String(house.id), {
    ...houseDefinition,
    name: "Correction propriétaire",
  });
  expect(
    (
      await db().query(
        "SELECT review_status,refusal_reason FROM participations WHERE id=$1",
        [house.id],
      )
    ).rows[0],
  ).toEqual({ review_status: "PENDING", refusal_reason: "" });
  await service.adminAction(admin, {
    action: "reviewHouse",
    id: house.id,
    seasonId: real.id,
    payload: { status: "VALIDATED" },
  });
  expect(
    (
      await db().query("SELECT review_status FROM participations WHERE id=$1", [
        house.id,
      ])
    ).rows[0].review_status,
  ).toBe("VALIDATED");
});
it("preserves entered TEST hours on creation and editing without changing REAL bounds", async () => {
  const s = await testSeason();
  await activate(s);
  const house = await createHouse(ordinary, s);
  expect(new Date(String(house.starts_at)).toISOString()).toBe(
    "2026-10-31T17:00:00.000Z",
  );
  expect(new Date(String(house.ends_at)).toISOString()).toBe(
    "2026-10-31T22:00:00.000Z",
  );
  await service.updateHouse(
    admin,
    String(house.id),
    {
      ...houseDefinition,
      starts_at: "2026-10-07T15:00Z",
      ends_at: "2026-10-07T16:00Z",
    },
    true,
  );
  expect(
    new Date(
      String(
        (
          await db().query("SELECT ends_at FROM participations WHERE id=$1", [
            house.id,
          ])
        ).rows[0].ends_at,
      ),
    ).toISOString(),
  ).toBe("2026-10-07T16:00:00.000Z");
  await activate(real);
  await expect(
    service.createParticipation(ordinary, {
      house: {
        ...houseDefinition,
        starts_at: "2026-10-07T15:00Z",
        ends_at: "2026-10-07T16:00Z",
      },
      acceptance,
    }),
  ).rejects.toMatchObject({ status: 400 });
});
it("provides explicit season/global/all audit scopes without crossing instances", async () => {
  const s = await testSeason();
  await service.audit(db(), admin.instance_id, admin, "global.fixture");
  await service.audit(
    db(),
    admin.instance_id,
    admin,
    "season.fixture",
    real.id,
  );
  await service.audit(db(), admin.instance_id, admin, "other.fixture", s.id);
  const actions = async (scope: string) =>
    (
      (await service.adminRead(admin, "audit", real.id, scope)) as {
        action: string;
      }[]
    ).map((r) => r.action);
  expect(await actions("season")).toContain("season.fixture");
  expect(await actions("season")).not.toContain("global.fixture");
  expect(await actions("global")).toContain("global.fixture");
  expect(await actions("global")).not.toContain("season.fixture");
  expect(await actions("all")).toEqual(
    expect.arrayContaining([
      "season.fixture",
      "global.fixture",
      "other.fixture",
    ]),
  );
  await expect(
    service.adminRead(ordinary, "audit", real.id, "all"),
  ).rejects.toMatchObject({ status: 403 });
  await expect(actions("bad")).rejects.toThrow();
});
it("requires an ended inactive REAL season and PURGER, retaining its anonymous snapshot", async () => {
  await createHouse(ordinary, real);
  await expect(
    service.adminAction(admin, {
      action: "purge",
      id: real.id,
      payload: "PURGER",
    }),
  ).rejects.toMatchObject({ status: 409 });
  vi.setSystemTime(new Date(real.closes_at));
  await expect(
    service.adminAction(admin, {
      action: "purge",
      id: real.id,
      payload: "PURGER",
    }),
  ).rejects.toMatchObject({ status: 409 });
  await service.adminAction(admin, {
    action: "deactivateSeason",
    id: real.id,
    payload: "DÉSACTIVER",
  });
  await expect(
    service.adminAction(admin, {
      action: "purge",
      id: real.id,
      payload: "wrong",
    }),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    service.adminAction(
      { ...admin, role_name: "ADMIN" },
      { action: "purge", id: real.id, payload: "PURGER" },
    ),
  ).rejects.toMatchObject({ status: 403 });
  await service.adminAction(admin, {
    action: "purge",
    id: real.id,
    payload: "PURGER",
  });
  const row = (await db().query("SELECT * FROM seasons WHERE id=$1", [real.id]))
    .rows[0];
  expect(row.purged_at).toBeTruthy();
  expect(row.stats_snapshot_at).toBeTruthy();
  expect(row.stats).toMatchObject({ houses: 1 });
  expect(
    (
      await db().query("SELECT * FROM participations WHERE season_id=$1", [
        real.id,
      ])
    ).rows,
  ).toHaveLength(0);
  expect(JSON.stringify(row.stats)).not.toContain("Adresse privée");
});
it("blocks TEST campaign creation, test and retry; cancels legacy queued TEST messages", async () => {
  const s = await testSeason();
  const definition = {
    season_id: s.id,
    name: "Interdite",
    subject: "Hello",
    body: "Body",
    audience: "ALL",
    active: true,
    schedule_mode: "ABSOLUTE",
    anchor: "opens_at",
    offset_days: 0,
    scheduled_at: "2026-10-07T12:00Z",
  };
  await expect(
    campaignAction(admin, {
      action: "save",
      seasonId: s.id,
      campaign: definition,
    }),
  ).rejects.toMatchObject({ status: 403 });
  const campaign = (
    await db().query(
      "INSERT INTO email_campaigns(instance_id,season_id,name,subject,body,audience,active,scheduled_at,status) VALUES($1,$2,'Legacy','Hello','Body','ALL',true,'2026-10-07T12:00Z','SCHEDULED') RETURNING id",
      [admin.instance_id, s.id],
    )
  ).rows[0];
  for (const action of ["test", "retry"])
    await expect(
      campaignAction(admin, { action, id: campaign.id, seasonId: s.id }),
    ).rejects.toMatchObject({ status: 403 });
  // Includes a legacy row with no season_id and another without a campaign.
  await db().query(
    "INSERT INTO email_outbox(user_id,campaign_id,kind,idempotency_key) VALUES($1,$2,'TEST','legacy-null')",
    [admin.id, campaign.id],
  );
  await db().query(
    "INSERT INTO email_outbox(user_id,season_id,kind,idempotency_key) VALUES($1,$2,'VERIFY','legacy-season')",
    [admin.id, s.id],
  );
  await db().query("UPDATE email_outbox SET scheduled_at='2026-10-07T12:00Z'");
  const send = vi.fn(async () => {});
  await dispatchEmails(new Date(), send);
  expect(send).not.toHaveBeenCalled();
  expect((await db().query("SELECT status FROM email_outbox")).rows).toEqual([
    { status: "CANCELLED" },
    { status: "CANCELLED" },
  ]);
  expect((await campaignAdmin(admin, s.id)).campaigns).toHaveLength(1);
  expect((await campaignAdmin(admin, real.id)).campaigns).toHaveLength(0);
  await expect(campaignAdmin(ordinary, s.id)).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    campaignAction(
      { ...admin, permissions: ["admin.access", "communications.read"] },
      { action: "test", id: campaign.id },
    ),
  ).rejects.toMatchObject({ status: 403 });
});

it("finishes an emptied free selection with finite anonymous statistics", async () => {
  vi.setSystemTime(new Date("2026-10-31T18:00Z"));
  const session = await createSession(ordinary.id);
  await reportCollection(
    ordinary,
    {
      id: randomUUID(),
      seasonId: real.id,
      event: "finish",
      planned: 0,
      visited: 0,
    },
    session,
  );
  const stats = (
    await db().query("SELECT stats FROM seasons WHERE id=$1", [real.id])
  ).rows[0].stats;
  expect(stats).toMatchObject({
    collections_started: 1,
    collections_finished: 1,
    completion_sum: 0,
  });
});

const adminUserAction = (user: User | null, input: unknown) =>
  actualAdminUserAction(user, {
    current_password: "test-password-1234",
    ...(input as Record<string, unknown>),
  });
