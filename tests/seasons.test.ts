import {
  addressParts,
  installFrenchAddressFixture,
} from "./french-address-fixture";
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
import {
  seasonLabel,
  defaultRoles,
  type Season,
  type User,
} from "../lib/domain";
import { fixtureRouter } from "./walking-fixture";
import { legacyTestSeason } from "./legacy-season-fixture";
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
  address_parts: addressParts,
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
  return (await legacyTestSeason(admin.instance_id, name)) as unknown as Season;
}
async function preparedSeason(name='Préparée') {
 await service.adminAction(admin,{action:'season',payload:{...realDefinition,name}});
 return (await db().query('SELECT * FROM seasons WHERE name=$1',[name])).rows[0] as unknown as Season;
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
  installFrenchAddressFixture();
  vi.setSystemTime(new Date("2026-10-07T12:00Z"));
  await db().query(
    "TRUNCATE instances,bootstrap,setup_sessions,rate_limits RESTART IDENTITY CASCADE",
  );
  const setup = await service.setup({
    token: "season-test-key",
    instance: {
      public_name: "Halloween",
      territory: "Rennes",
      postal_code: "35000",
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

it("ignores migrated reminder columns when updating a season without a current campaign", async () => {
  await db().query(
    "UPDATE seasons SET reminder_enabled=true,reminder_at='2026-11-04T12:00Z' WHERE id=$1",
    [real.id],
  );
  await service.adminAction(admin, {
    action: "season",
    id: real.id,
    payload: { ...realDefinition, name: "Saison corrigée", purge_at: "2026-11-03T12:00Z" },
  });
  const row = (await db().query("SELECT name,purge_at FROM seasons WHERE id=$1", [real.id])).rows[0];
  expect(row.name).toBe("Saison corrigée");
  expect(new Date(String(row.purge_at)).toISOString()).toBe("2026-11-03T12:00:00.000Z");
});

for (const mode of ["ABSOLUTE", "RELATIVE"] as const) {
  it(`preserves the ${mode} campaign purge guard and rolls back rejected calendar changes`, async () => {
    const campaign = (await db().query(
      "INSERT INTO email_campaigns(instance_id,season_id,name,subject,body,audience,active,schedule_mode,anchor,offset_days,scheduled_at,status) VALUES($1,$2,'Rappel actuel','Hello','Body','ALL',true,$3,'closes_at',2,'2026-11-02T23:00Z','SCHEDULED') RETURNING id",
      [admin.instance_id, real.id, mode],
    )).rows[0];
    await expect(service.adminAction(admin, {
      action: "season",
      id: real.id,
      payload: { ...realDefinition, closes_at: "2026-11-01T00:00Z", purge_at: "2026-11-01T12:00Z" },
    })).rejects.toThrow("La purge doit suivre toutes les communications programmées");
    const row = (await db().query("SELECT closes_at,purge_at FROM seasons WHERE id=$1", [real.id])).rows[0];
    expect(new Date(String(row.closes_at)).toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(new Date(String(row.purge_at)).toISOString()).toBe("2026-11-02T12:00:00.000Z");
    const savedCampaign = (await db().query("SELECT scheduled_at FROM email_campaigns WHERE id=$1", [campaign.id])).rows[0];
    expect(new Date(String(savedCampaign.scheduled_at)).toISOString()).toBe("2026-11-02T23:00:00.000Z");
  });
}

it("rejects TEST creation, conversion, activation and editing while retaining historical rows", async () => {
 const old=await testSeason();
 for (const input of [
  {action:'season',payload:{...realDefinition,is_test:true}},
  {action:'season',id:real.id,payload:{...realDefinition,is_test:true}},
  {action:'season',id:old.id,payload:{...realDefinition}},
  {action:'activateSeason',id:old.id,payload:'ACTIVER'},
 ]) await expect(service.adminAction(admin,input)).rejects.toThrow();
 expect((await db().query('SELECT id FROM seasons')).rows).toHaveLength(2);
 expect((await service.adminRead(admin,'seasons') as Season[]).map(s=>s.id)).toEqual([real.id]);
 await expect(db().query('UPDATE instances SET active_season_id=$1',[old.id])).rejects.toThrow();
});

it("serializes real activations, preserves global accounts and denies registration without activation", async () => {
 const a=await preparedSeason('A'),b=await preparedSeason('B');
 await Promise.all([activate(a),activate(b)]);
 expect([a.id,b.id]).toContain((await service.instance())?.active_season_id);
 expect((await service.adminRead(admin,'seasons') as Season[]).filter(s=>s.active)).toHaveLength(1);
 await expect(activate(real,{...admin,role_name:'ADMIN'})).rejects.toMatchObject({status:403});
 await activate(real);
 await service.adminAction(admin,{action:'deactivateSeason',id:real.id,payload:'DÉSACTIVER'});
 expect((await directAccount('Permanent')).account_status).toBe('ACTIVE');
 for(const u of [null,ordinary,admin,{...admin,role_name:'ADMIN'}]) {
  const state=await service.publicState(undefined,u);
  expect(state.season).toBeNull(); expect(state.mapAccessible).toBe(false);
  expect(state.houses).toEqual([]); expect(state.routeCandidates).toEqual([]);
 }
 await expect(service.createParticipation(ordinary,{house:houseDefinition,acceptance})).rejects.toMatchObject({status:403});
});

it("prepares houses before activation without exposing their data or allowing public registration", async () => {
 await service.adminAction(admin,{action:'deactivateSeason',id:real.id,payload:'DÉSACTIVER'});
 const h=await createHouse(ordinary,real);
 expect(h.season_id).toBe(real.id); expect(h.review_status).toBe('VALIDATED');
 for(const u of [null,ordinary,admin,{...admin,role_name:'ADMIN'}]) {
  const state=await service.publicState(undefined,u);
  expect(state.mapAccessible).toBe(false);expect(state.houses).toEqual([]);
  expect(JSON.stringify(state)).not.toContain(h.address);
 }
 const late=await directAccount('Sans activation');
 await expect(service.createParticipation(late,{house:houseDefinition,acceptance})).rejects.toMatchObject({status:403});
});

it("checks every public boundary for USER, ADMIN, SUPER_ADMIN and anonymous visitors", async () => {
 await createHouse(ordinary,real);
 for(const time of [
  '2026-09-30T23:59:59.999Z','2026-10-01T00:00Z',
  '2026-10-31T15:59:59.999Z','2026-10-31T16:00Z',
  '2026-10-31T22:59:59.999Z','2026-10-31T23:00Z','2026-11-01T12:00Z',
 ]) {
  vi.setSystemTime(new Date(time));
  const publicOpen=+new Date(time)>=+new Date(real.opens_at)&&+new Date(time)<+new Date(real.closes_at);
  for(const u of [null,ordinary,{...admin,role_name:'ADMIN'},admin]) {
   const state=await service.publicState(undefined,u);
   expect(state.mapAccessible).toBe(publicOpen||u===admin);
   expect(state.publicMapOpen).toBe(publicOpen);
   expect(state.season?.registrations_open).toBe(+new Date(time)>=+new Date(real.registrations_open_at)&&+new Date(time)<+new Date(real.closes_at));
   if(!publicOpen&&u!==admin) {expect(state.houses).toEqual([]);expect(state.routeCandidates).toEqual([]);}
  }
  expect((await service.instance())?.active_season_id).toBe(real.id);
 }
});

it("requires activation even after the opening time and withholds every house payload until then", async () => {
  const house = await createHouse(ordinary, real);
  await service.adminAction(admin, {
    action: "deactivateSeason",
    id: real.id,
    payload: "DÉSACTIVER",
  });
  vi.setSystemTime(new Date(houseDefinition.starts_at));
  for (const user of [null, ordinary]) {
    const state = await service.publicState(undefined, user);
    expect(state.state).toBe("PREPARATION");
    expect(state.publicMapOpen).toBe(false);
    expect(state.collectionAccessible).toBe(false);
    expect(state.houses).toEqual([]);
    expect(state.routeCandidates).toEqual([]);
    expect(state.closedHouseIds).toEqual([]);
    expect(JSON.stringify(state)).not.toContain(house.address);
    expect(JSON.stringify(state)).not.toContain(house.id);
  }
  await activate(real);
  const opened = await service.publicState(undefined, ordinary);
  expect(opened.publicMapOpen).toBe(true);
  expect(opened.houses?.map((h) => h.id)).toContain(house.id);
});

it("never exposes or activates historical TEST rows for any role", async () => {
 const legacy=await testSeason();
 await expect(activate(legacy)).rejects.toMatchObject({status:400});
 for(const u of [null,ordinary,admin,{...admin,role_name:'ADMIN'}]) {
  const state=await service.publicState(undefined,u);
  expect(state.season?.id).toBe(real.id);
  expect(JSON.stringify(state)).not.toContain(legacy.id);
 }
});

it("allows only SUPER_ADMIN routes before and after public hours without inflating event totals", async () => {
 const h=await createHouse(ordinary,real);
 const input={acceptance,start:'2026-10-31T17:00:00.000Z',end:'2026-10-31T19:00:00.000Z',origin:{latitude:48.1,longitude:-1.67},activities:[]};
 for(const time of ['2026-10-07T12:00Z','2026-11-01T12:00Z']) {
  vi.setSystemTime(new Date(time));const now=new Date();
  for(const u of [ordinary,{...admin,role_name:'ADMIN'}]) {
   await expect(service.route(input,{now},u)).rejects.toMatchObject({status:403});
   await expect(service.discoveryDistances(u,{origin:input.origin},{now})).rejects.toMatchObject({status:403});
  }
  const result=await service.route(input,{now},admin);expect(result.stops.map(s=>s.house.id)).toEqual([h.id]);
  expect((await service.routeAvailability(admin,{instanceId:admin.instance_id,seasonId:real.id,mode:'COLLECTION',end:input.end,activities:[],steps:[{id:h.id,arrival:input.start,departure:input.end,key:''}]},{now})).valid).toBe(true);
  await reportCollection(admin,{id:randomUUID(),seasonId:real.id,event:'finish',planned:1,visited:1},await createSession(admin.id));
 }
 const row=(await db().query('SELECT routes_count,stats FROM seasons WHERE id=$1',[real.id])).rows[0];
 expect(row.routes_count).toBe(0);expect((row.stats as Record<string,number>).collections_started).toBeUndefined();
 await service.adminAction(admin,{action:'deactivateSeason',id:real.id,payload:'DÉSACTIVER'});
 await expect(service.route(input,{now:new Date()},admin)).rejects.toMatchObject({status:403});
});

it("keeps accounts/passwords/session on edition deletion and reuses one account in different seasons", async () => {
  const s = await preparedSeason();
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
  // Staff may now prepare houses on inactive seasons without exposing them publicly.
  const another = await directAccount("Other");
  await service.adminAction(admin,{action:'deactivateSeason',id:real.id,payload:'DÉSACTIVER'});
  const inactiveHouse = await createHouse(another, s);
  expect(inactiveHouse.season_id).toBe(s.id);
  expect((await service.publicState(undefined, ordinary)).houses).toEqual([]);
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
  const s = await preparedSeason();
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
  expect((await service.instance())?.active_season_id).toBe(real.id);
  const frozen = (
    await db().query("SELECT * FROM seasons WHERE id=$1", [real.id])
  ).rows[0];
  expect(frozen.stats).toMatchObject({
    houses: 1,
    approved: 1,
    participants: 1,
    ...(live as object),
  });
  await service.adminAction(admin,{action:'reviewHouse',id:h.id,seasonId:real.id,payload:{status:'VALIDATED'}});
  await activate(real);
  vi.setSystemTime(new Date(real.purge_at));
  await service.tick();
  await service.tick();
  const purged = (
    await db().query("SELECT * FROM seasons WHERE id=$1", [real.id])
  ).rows[0];
  expect(purged.stats).toEqual(frozen.stats);
  expect(await service.adminRead(admin, "statistics", real.id)).toEqual({
    attendance: { activeNow: 0, peak: null, points: [] },
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
it("retains historical TEST rows inert and deduplicates public collection reports across session renewal", async () => {
 const old=await testSeason();
 await expect(reportCollection(admin,{id:randomUUID(),seasonId:old.id,event:'start',planned:2},await createSession(admin.id))).rejects.toMatchObject({status:409});
 vi.setSystemTime(new Date('2026-10-31T18:00Z'));
 const report={id:randomUUID(),seasonId:real.id,event:'start',planned:2};
 await reportCollection(ordinary,report,await createSession(ordinary.id));
 await reportCollection(ordinary,{...report,event:'finish'},await createSession(ordinary.id));
 await reportCollection(ordinary,{...report,event:'finish'},await createSession(ordinary.id));
 expect((await db().query('SELECT stats FROM seasons WHERE id=$1',[real.id])).rows[0].stats).toMatchObject({collections_started:1,collections_finished:1});
 await service.tick();expect((await db().query('SELECT purged_at FROM seasons WHERE id=$1',[old.id])).rows[0].purged_at).toBeNull();
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
  const s = await preparedSeason();
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
    attendance: { activeNow: 0, peak: null, points: [] },
    seasonId: s.id,
    snapshot: false,
    stats: expected,
  });
  await activate(real);
  expect(await service.adminRead(admin, "statistics", s.id)).toEqual({
    attendance: { activeNow: 0, peak: null, points: [] },
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
  await db().query("UPDATE users SET admin_permissions=$1 WHERE id=$2", [
    [...defaultRoles.ADMIN],
    owner.id,
  ]);
  manager.permissions = [...defaultRoles.ADMIN];
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
  const prepared = await createHouse(another, real);
  expect(prepared.season_id).toBe(real.id);
  expect((await service.publicState(undefined, ordinary)).mapAccessible).toBe(
    false,
  );
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
it("enforces real house date bounds for both public and BO creation/editing", async () => {
 const h=await createHouse(ordinary,real);
 await expect(service.updateHouse(admin,String(h.id),{...houseDefinition,starts_at:'2026-10-07T15:00Z',ends_at:'2026-10-07T16:00Z'},true)).rejects.toMatchObject({status:400});
 expect(new Date(String((await db().query('SELECT starts_at FROM participations WHERE id=$1',[h.id])).rows[0].starts_at)).toISOString()).toBe('2026-10-31T17:00:00.000Z');
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
  await expect(campaignAdmin(admin, s.id)).rejects.toMatchObject({status:404});
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

it("attaches BO creations to active season, then requires context among multiple waiting editions",async()=>{
 const next=await preparedSeason();await createHouse(ordinary,next);expect((await db().query('SELECT season_id FROM participations WHERE user_id=$1',[ordinary.id])).rows[0].season_id).toBe(real.id);
 await service.adminAction(admin,{action:'deactivateSeason',id:real.id,payload:'DÉSACTIVER'});
 const owner=await directAccount('Contexte');await createHouse(owner,next);
 expect((await db().query('SELECT season_id FROM participations WHERE user_id=$1',[owner.id])).rows[0].season_id).toBe(next.id);
 await expect(service.adminAction(admin,{action:'createHouse',payload:{userId:admin.id,participation:{house:houseDefinition,acceptance}}})).rejects.toMatchObject({status:409});
});
it("refreshes final anonymous statistics at purge after late BO changes and keeps accounts/history",async()=>{
 const h=await createHouse(ordinary,real);vi.setSystemTime(new Date(real.closes_at));await service.tick();
 await db().query("INSERT INTO audit_logs(instance_id,actor_id,action,target_id,season_id) VALUES($1,$2,'legacy.season',$3,NULL)",[admin.instance_id,ordinary.id,real.id]);
 await service.adminAction(admin,{action:'reviewHouse',seasonId:real.id,id:h.id,payload:{status:'REFUSED',reason_code:'ADDRESS'}});
 const late=await directAccount('Après clôture');await createHouse(late,real);
 await service.adminAction(admin,{action:'visibility',seasonId:real.id,id:h.id,payload:'HIDDEN'});
 expect((await service.adminRead(admin,'statistics',real.id) as {stats:Record<string,number>}).stats).toMatchObject({houses:2,approved:1,refused:1});
 vi.setSystemTime(new Date(real.purge_at));await service.tick();await service.tick();
 const row=(await db().query('SELECT * FROM seasons WHERE id=$1',[real.id])).rows[0];
 expect(row.stats).toMatchObject({houses:2,approved:1,refused:1,participants:2,candy:2,decoration:2});
 expect((await db().query('SELECT id FROM users WHERE id=$1',[ordinary.id])).rows).toHaveLength(1);
 expect((await db().query('SELECT year FROM participation_history WHERE user_id=$1',[ordinary.id])).rows).toEqual([{year:2026}]);
 expect((await db().query('SELECT id FROM audit_logs WHERE season_id=$1 OR target_id=$1',[real.id])).rows).toEqual([]);
 expect((await db().query("SELECT actor_id,target_id,season_id FROM audit_logs WHERE action='season.purge.automatic'")).rows).toEqual([{actor_id:null,target_id:null,season_id:null}]);
 await expect(service.adminAction(admin,{action:'visibility',seasonId:real.id,id:h.id,payload:'VISIBLE'})).rejects.toMatchObject({status:403});
});

it("enforces registration API boundaries and individual BO grants independently of public hours", async () => {
 for(const [time, allowed] of [
  ['2026-09-30T23:59:59.999Z',false],['2026-10-01T00:00:00.000Z',true],
  ['2026-10-31T22:59:59.999Z',true],['2026-10-31T23:00:00.000Z',false],
 ] as const) {
  vi.setSystemTime(new Date(time));
  const owner=await directAccount(time);
  const request=service.createParticipation(owner,{house:houseDefinition,acceptance});
  if(allowed) await expect(request).resolves.toEqual({ok:true});
  else await expect(request).rejects.toMatchObject({status:403});
 }
 const h=await createHouse(ordinary,real);
 const restricted={...admin,role_name:'ADMIN',permissions:['admin.access','participants.read','season.read']};
 for(const [action,payload] of [['reviewHouse',{status:'VALIDATED'}],['visibility','HIDDEN'],['deleteHouse','SUPPRIMER LA MAISON']] as const)
  await expect(service.adminAction(restricted,{action,id:h.id,seasonId:real.id,payload})).rejects.toMatchObject({status:403});
});

it("upgrades V098 legacy TEST activation without losing houses, accounts or real activation; V099 migration replay is harmless",async()=>{
 const pg=new PGlite();
 try {
  for(const file of files.filter(f=>f<'014')) await pg.exec(await readFile('migrations/'+file,'utf8'));
  await pg.exec(`INSERT INTO instances(public_name,territory,postal_code,country,latitude,longitude) VALUES('Compat','Rennes','35000','France',48.1,-1.67);
   INSERT INTO seasons(instance_id,year,name,is_test,opens_at,closes_at,registrations_open_at,purge_at) SELECT id,2026,'Legacy',true,'2000-01-01','2201-01-01','2000-01-01','2201-01-02' FROM instances;
   UPDATE instances SET active_season_id=(SELECT id FROM seasons);
   INSERT INTO users(instance_id,email,display_name,password_hash,kind) SELECT id,'legacy@example.invalid','Legacy','KEEP_HASH','PARTICIPANT' FROM instances;
   INSERT INTO participations(instance_id,season_id,user_id,name,address,latitude,longitude,activities,starts_at,ends_at,fear) SELECT i.id,s.id,u.id,'Keep house','Keep address',48.1,-1.67,ARRAY['CANDY'],'2026-10-31T17:00Z','2026-10-31T20:00Z',2 FROM instances i,seasons s,users u;`);
  const sql=await readFile('migrations/014_active_real_season_post_close.sql','utf8');
  await pg.exec(sql);await pg.exec(sql);
  expect((await pg.query('SELECT active_season_id FROM instances')).rows).toEqual([{active_season_id:null}]);
  expect((await pg.query('SELECT password_hash FROM users')).rows).toEqual([{password_hash:'KEEP_HASH'}]);
  expect((await pg.query('SELECT address FROM participations')).rows).toEqual([{address:'Keep address'}]);
  await expect(pg.exec('UPDATE instances SET active_season_id=(SELECT id FROM seasons)')).rejects.toThrow();
  await pg.exec(`INSERT INTO seasons(instance_id,year,name,is_test,opens_at,closes_at,registrations_open_at,purge_at) SELECT id,2027,'Real',false,'2027-10-31','2027-11-01','2027-10-01','2027-11-02' FROM instances;
   UPDATE instances SET active_season_id=(SELECT id FROM seasons WHERE NOT is_test);`);
  const before=(await pg.query('SELECT active_season_id FROM instances')).rows;
  await pg.exec(sql);expect((await pg.query('SELECT active_season_id FROM instances')).rows).toEqual(before);
 } finally {await pg.close();}
});
