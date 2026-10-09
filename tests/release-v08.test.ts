import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { db, type Database } from "../lib/db";
import {
  setup,
  adminAction,
  createParticipation,
  updateHouse,
  publicState,
  adminRead,
  ownHouse,
  audit,
  purgeSeason,
} from "../lib/service";
import {
  createSession,
  getUser,
  hashToken,
  confirmAdminPassword,
  SESSION_SECONDS,
} from "../lib/auth";
import {
  createAccount,
  adminUserAction,
  adminUsers,
  accountAction,
} from "../lib/accounts";
import { presence, measureAttendance, attendance } from "../lib/attendance";
import { templateAction } from "../lib/mail-templates";
import { dispatchEmails } from "../lib/mail";
import {
  renderMessage,
  messageDefaults,
  templateExamples,
} from "../lib/message-templates";
import { legalState } from "../lib/content";
import { publicProjectLinks } from "../lib/project-links";
import type { User, Season } from "../lib/domain";
const globals = globalThis as unknown as { testDb?: Database };
let pg: PGlite, admin: User, owner: User, season: Season, ownerToken: string;
const password = "release-test-password-1234";
const house = {
  name: "Maison des lanternes",
  address: "12 Rue fictive",
  position_confirmed: true,
  latitude: 48.1,
  longitude: 2.8,
  activities: ["CANDY"],
  starts_at: "2026-10-31T18:00Z",
  ends_at: "2026-10-31T21:00Z",
  fear: 2,
  adaptable: false,
  rp: "",
  practical: "",
};
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-09T12:00Z"));
  pg = await PGlite.create();
  globals.testDb = {
    query: async (sql, values) => {
      const r = await pg.query(sql, values);
      return { rows: r.rows as never[], rowCount: r.affectedRows };
    },
  };
  for (const file of (await readdir("migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await pg.exec(await readFile("migrations/" + file, "utf8"));
  process.env.SETUP_TOKEN = "release-fixture-only";
});
beforeEach(async () => {
  vi.setSystemTime(new Date("2026-10-09T12:00Z"));
  await db().query(
    "TRUNCATE instances,bootstrap,setup_sessions,rate_limits RESTART IDENTITY CASCADE",
  );
  const result = await setup({
    token: "release-fixture-only",
    instance: {
      public_name: "Halloween",
      territory: "Commune fictive",
      postal_code: "00000",
      country: "France",
      timezone: "Europe/Paris",
      latitude: 48.1,
      longitude: 2.8,
      zoom: 14,
    },
    admin: { display_name: "Équipe", email: "admin@example.invalid", password },
    season: {
      year: 2026,
      name: "Halloween 2026",
      registrations_open: true,
      registrations_open_at: "2026-10-01T00:00Z",
      opens_at: "2026-10-31T17:00Z",
      closes_at: "2026-10-31T22:00Z",
      purge_at: "2026-11-02T00:00Z",
    },
  });
  admin = (await getUser(result.token))!;
  await db().query(
    "UPDATE users SET email_status='VERIFIED',email_verified_at=now() WHERE id=$1",
    [admin.id],
  );
  admin = (await getUser(result.token))!;
  season = (await db().query("SELECT * FROM seasons"))
    .rows[0] as unknown as Season;
  await adminAction(admin, {
    action: "activateSeason",
    id: season.id,
    payload: "ACTIVER",
    current_password: password,
  });
  ownerToken = (
    await createAccount({
      display_name: "Camille",
      email: "owner@example.invalid",
      password,
    })
  ).token;
  owner = (await getUser(ownerToken))!;
  await db().query(
    "UPDATE users SET email_status='VERIFIED',email_verified_at=now() WHERE id=$1",
    [owner.id],
  );
  owner = (await getUser(ownerToken))!;
  await db().query("DELETE FROM email_outbox");
});
afterAll(async () => {
  vi.useRealTimers();
  delete globals.testDb;
  await pg.close();
});
async function submit() {
  await createParticipation(owner, {
    house,
    acceptance: {
      mode: "GUIDELINES_ONLY",
      guidelines: true,
      guidelines_version: "2026.1",
    },
  });
  return (await ownHouse(owner))!;
}
async function review(
  id: string,
  status: string,
  extra: Record<string, unknown> = {},
) {
  return adminAction(admin, {
    action: "reviewHouse",
    id,
    seasonId: season.id,
    payload: { status, ...extra },
  });
}
it("caps cookie and persisted sessions at twelve absolute hours, including pre-existing seven-day sessions", async () => {
  expect(SESSION_SECONDS).toBe(43200);
  const row = (
    await db().query("SELECT * FROM sessions WHERE token_hash=$1", [
      hashToken(ownerToken),
    ])
  ).rows[0];
  expect(
    +new Date(String(row.expires_at)) - +new Date(String(row.created_at)),
  ).toBe(43200000);
  await db().query(
    "UPDATE sessions SET created_at=now()-interval '13 hours',expires_at=now()+interval '7 days' WHERE token_hash=$1",
    [hashToken(ownerToken)],
  );
  expect(await getUser(ownerToken)).toBeNull();
  await pg.exec(
    await readFile("migrations/009_release_foundations.sql", "utf8"),
  );
  const capped = (
    await db().query("SELECT * FROM sessions WHERE token_hash=$1", [
      hashToken(ownerToken),
    ])
  ).rows[0];
  expect(
    +new Date(String(capped.expires_at)) - +new Date(String(capped.created_at)),
  ).toBe(43200000);
  expect(
    (await db().query("SELECT * FROM users WHERE id=$1", [owner.id])).rows,
  ).toHaveLength(1);
});
it("expires admin rights after sixty minutes without extending the general session or affecting USER", async () => {
  const token = await createSession(admin.id);
  await db().query(
    "UPDATE sessions SET admin_last_activity_at=now()-interval '61 minutes' WHERE token_hash=$1",
    [hashToken(token)],
  );
  const stale = (await getUser(token, true))!;
  expect(stale.id).toBe(admin.id);
  expect(stale.permissions).toEqual([]);
  await expect(adminRead(stale, "users")).rejects.toMatchObject({
    status: 403,
  });
  expect((await getUser(ownerToken))?.id).toBe(owner.id);
  const fresh = await createSession(admin.id);
  await getUser(fresh, true);
  expect(
    (
      await db().query(
        "SELECT expires_at,created_at FROM sessions WHERE token_hash=$1",
        [hashToken(fresh)],
      )
    ).rows[0].expires_at,
  ).toEqual(new Date(+new Date("2026-10-09T12:00Z") + 43200000));
});
it("uses persisted ADMIN grants immediately and prevents self-promotion or editing another administrator", async () => {
  const role = (await db().query("SELECT id FROM roles WHERE name='ADMIN'"))
    .rows[0];
  await db().query(
    "UPDATE users SET role_id=$1,admin_permissions=ARRAY['users.read','users.manage'] WHERE id=$2",
    [role.id, owner.id],
  );
  let restricted = (await getUser(ownerToken))!;
  expect(restricted.permissions).toEqual(
    expect.arrayContaining(["admin.access", "users.read"]),
  );
  expect(restricted.permissions).not.toContain("participants.edit");
  await expect(adminRead(restricted, "houses")).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    adminUserAction(restricted, {
      action: "edit",
      id: admin.id,
      display_name: "Attaque",
    }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    adminUserAction(restricted, {
      action: "edit",
      id: restricted.id,
      permissions: ["settings.manage"],
      current_password: password,
    }),
  ).rejects.toMatchObject({ status: 403 });
  await db().query("UPDATE users SET admin_permissions='{}' WHERE id=$1", [
    owner.id,
  ]);
  restricted = (await getUser(ownerToken))!;
  expect(restricted.permissions).toEqual(["admin.access"]);
  await expect(adminRead(restricted, "users")).rejects.toMatchObject({
    status: 403,
  });
});
it("requires server password confirmation and limits failures per administrator", async () => {
  await expect(
    adminAction(admin, {
      action: "deactivateSeason",
      id: season.id,
      payload: "DÉSACTIVER",
    }),
  ).rejects.toMatchObject({ status: 403 });
  for (let i = 0; i < 4; i++)
    await expect(
      confirmAdminPassword(admin, "incorrect-password"),
    ).rejects.toMatchObject({ status: 403 });
  await expect(confirmAdminPassword(admin, password)).rejects.toMatchObject({
    status: 429,
  });
  await db().query("DELETE FROM rate_limits");
  await adminAction(admin, {
    action: "deactivateSeason",
    id: season.id,
    payload: "DÉSACTIVER",
    current_password: password,
  });
  expect((await adminUsers(admin)).some((u) => u.id === owner.id)).toBe(true);
});
it("keeps only validated participation years through purge and removes them when the account is deleted", async () => {
  const h = await submit();
  expect(
    (await db().query("SELECT * FROM participation_history")).rows,
  ).toHaveLength(0);
  await review(String(h.id), "REFUSED", { reason: "À compléter" });
  expect(
    (await db().query("SELECT * FROM participation_history")).rows,
  ).toHaveLength(0);
  await review(String(h.id), "VALIDATED");
  await review(String(h.id), "VALIDATED");
  expect(
    (
      await db().query("SELECT * FROM participation_history WHERE user_id=$1", [
        owner.id,
      ])
    ).rows,
  ).toHaveLength(1);
  await adminAction(admin, {
    action: "deactivateSeason",
    id: season.id,
    payload: "DÉSACTIVER",
    current_password: password,
  });
  await purgeSeason(
    season.id,
    admin.instance_id,
    admin,
    true,
    new Date("2026-11-03T00:00Z"),
  );
  expect((await db().query("SELECT * FROM participations")).rows).toHaveLength(
    0,
  );
  const history = (await db().query("SELECT * FROM participation_history"))
    .rows;
  expect(Object.keys(history[0]).sort()).toEqual([
    "recorded_at",
    "season_id",
    "user_id",
    "year",
  ]);
  expect((await adminUsers(admin)).some((u) => u.id === owner.id)).toBe(true);
  await accountAction(owner, {
    action: "delete",
    confirm: "SUPPRIMER MON COMPTE",
    current_password: password,
  });
  expect(
    (await db().query("SELECT * FROM participation_history")).rows,
  ).toHaveLength(0);
});
it("returns substantive owner edits to moderation while operational candy changes remain separate", async () => {
  const h = await submit();
  await review(String(h.id), "VALIDATED");
  await updateHouse(owner, String(h.id), {
    ...house,
    address: "13 Rue fictive",
  });
  expect((await ownHouse(owner))?.review_status).toBe("PENDING");
  expect(
    (
      await db().query(
        "SELECT actor_id FROM audit_logs WHERE action='house.updated'",
      )
    ).rows[0].actor_id,
  ).toBe(owner.id);
});
it("queues one notification per actual transition, cancels stale decisions and never sends TEST notifications", async () => {
  const h = await submit();
  const received: string[] = [];
  await dispatchEmails(undefined, async (mail) => {
    received.push(mail.subject);
  });
  expect(received).toHaveLength(1);
  expect(received[0]).toContain("reçue");
  await review(String(h.id), "VALIDATED");
  await review(String(h.id), "VALIDATED");
  expect(
    (await db().query("SELECT * FROM email_outbox WHERE kind='HOUSE_APPROVED'"))
      .rows,
  ).toHaveLength(1);
  await review(String(h.id), "REFUSED", {
    reason_code: "ADDRESS",
    reason: "Numéro absent",
  });
  await dispatchEmails(undefined, async (mail) => {
    received.push(mail.subject);
    expect(mail.text).toContain("Numéro absent");
  });
  expect(received).toHaveLength(2);
  expect(
    (
      await db().query(
        "SELECT status FROM email_outbox WHERE kind='HOUSE_APPROVED'",
      )
    ).rows[0].status,
  ).toBe("CANCELLED");
});
it("never queues or sends real house notifications for TEST seasons", async () => {
  await adminAction(admin, {
    action: "season",
    payload: { name: "Exemples", is_test: true },
  });
  await adminAction(admin, {
    action: "deactivateSeason",
    id: season.id,
    payload: "DÉSACTIVER",
    current_password: password,
  });
  season = (await db().query("SELECT * FROM seasons WHERE is_test"))
    .rows[0] as unknown as Season;
  await adminAction(admin, {
    action: "activateSeason",
    id: season.id,
    payload: "ACTIVER",
    current_password: password,
  });
  await expect(submit()).rejects.toMatchObject({ status: 403 });
  await createParticipation(
    owner,
    {
      house,
      acceptance: {
        mode: "GUIDELINES_ONLY",
        guidelines: true,
        guidelines_version: "2026.1",
      },
    },
    { actor: admin, seasonId: season.id },
  );
  const h = (
    await db().query("SELECT * FROM participations WHERE user_id=$1", [
      owner.id,
    ])
  ).rows[0];
  await review(String(h.id), "REFUSED", { reason: "Exemple uniquement" });
  expect((await db().query("SELECT * FROM email_outbox")).rows).toHaveLength(0);
  const mails: string[] = [];
  await dispatchEmails(undefined, async (mail) => {
    mails.push(mail.subject);
  });
  expect(mails).toEqual([]);
});
it("tests templates only to the verified Super Admin address with inert links and no identity tokens", async () => {
  const sent: Record<string, unknown>[] = [];
  await templateAction(
    admin,
    {
      action: "test",
      kind: "RESET",
      to: "attacker@example.invalid",
      template: { subject: "Mon modèle", body: "Bonjour **{{name}}**" },
    },
    async (mail) => {
      sent.push(mail);
    },
  );
  expect(sent[0].to).toBe(admin.email);
  expect(sent[0].subject).toBe("[TEST] Mon modèle");
  expect(sent[0].html).toContain("<strong>Camille</strong>");
  expect(sent[0].text).toContain("https://example.invalid/preview");
  expect((await db().query("SELECT * FROM email_tokens")).rows).toHaveLength(0);
  await expect(
    templateAction(owner, { action: "test", kind: "VERIFY" }, async () => {}),
  ).rejects.toMatchObject({ status: 403 });
  await db().query("UPDATE users SET email_status='UNVERIFIED' WHERE id=$1", [
    admin.id,
  ]);
  await expect(
    templateAction(admin, { action: "test", kind: "VERIFY" }, async () => {}),
  ).rejects.toMatchObject({ status: 403 });
  const safe = renderMessage(messageDefaults.HOUSE_REFUSED, {
    ...templateExamples,
    refusal_reason: '<img src=x onerror="alert(1)">',
  });
  expect(safe.html).not.toContain("<img src=x");
  const injected = renderMessage(
    { subject: "Exemple", body: "Bonjour {{name}}" },
    { name: "[Cliquez](https://attacker.invalid) **faux**" },
  );
  expect(injected.html).not.toContain('href="https://attacker.invalid"');
  expect(injected.html).not.toContain("<strong>faux</strong>");
  expect(injected.text).toContain(
    "[Cliquez](https://attacker.invalid) **faux**",
  );
  expect(safe.html).toContain("&lt;img");
});
it("counts distinct authenticated active accounts, records real quarters and averages instead of summing", async () => {
  await expect(presence(null)).rejects.toMatchObject({ status: 401 });
  await presence(owner);
  await presence(owner);
  await measureAttendance();
  expect((await attendance(season.id)).activeNow).toBe(1);
  vi.setSystemTime(new Date("2026-10-09T12:15Z"));
  await presence(owner);
  await presence(admin);
  await measureAttendance();
  await measureAttendance();
  const data = await attendance(season.id);
  expect(data.points).toHaveLength(1);
  expect(data.points[0]).toMatchObject({ average: 1.5, samples: 2 });
  expect(data.peak?.active_count).toBe(2);
  vi.setSystemTime(new Date("2026-10-09T12:45:45Z"));
  await measureAttendance();
  expect(
    (await db().query("SELECT * FROM attendance_samples")).rows,
  ).toHaveLength(2);
  expect((await attendance(season.id)).activeNow).toBe(0);
  expect((await db().query("SELECT * FROM active_presence")).rows).toHaveLength(
    0,
  );
});
it("paginates and filters business activity on the server with real actors and protects access", async () => {
  await audit(db(), admin.instance_id, owner, "house.updated");
  for (let i = 0; i < 52; i++)
    await audit(db(), admin.instance_id, admin, "user.edit");
  const first = (await adminRead(admin, "audit", undefined, "all", {
    category: "users",
    page: "0",
  })) as unknown[];
  expect(first).toHaveLength(50);
  expect(
    await adminRead(admin, "audit", undefined, "all", {
      category: "users",
      page: "1",
    }),
  ).toHaveLength(2);
  expect(
    await adminRead(admin, "audit", undefined, "all", { q: "Camille" }),
  ).toMatchObject([{ actor: "Camille" }]);
  await expect(
    adminRead(owner, "audit", undefined, "all"),
  ).rejects.toMatchObject({ status: 403 });
});
it("respects calendar/authentication states, canonical policy disclosures and inactive project links", async () => {
  expect((await publicState(undefined, owner)).mapAccessible).toBe(false);
  expect((await publicState(undefined, null)).houses).toHaveLength(0);
  expect((await publicState(undefined, admin)).earlyAccess).toBe(true);
  vi.setSystemTime(new Date("2026-10-31T18:00Z"));
  expect((await publicState(undefined, owner)).mapAccessible).toBe(true);
  vi.setSystemTime(new Date("2026-11-01T00:00Z"));
  expect((await publicState(undefined, owner)).mapAccessible).toBe(false);
  expect((await legalState(admin.instance_id)).PRIVACY.body).toContain(
    "cinq ans",
  );
  expect(
    publicProjectLinks({
      supportEnabled: false,
      bugEnabled: false,
      contactUrl: "javascript:alert(1)",
    }),
  ).toMatchObject({ supportEnabled: false, bugEnabled: false });
  expect(
    publicProjectLinks({ contactUrl: "javascript:alert(1)" }).contactUrl,
  ).toBeUndefined();
});
