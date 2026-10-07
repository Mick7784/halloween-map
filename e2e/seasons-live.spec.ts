import { test, expect } from "@playwright/test";
import { Pool } from "pg";
const origin = process.env.APP_ORIGIN ?? "http://localhost:3000",
  password = "season-browser-password-1234";
// This suite requires an explicitly supplied disposable DB, never a production DB.
test.skip(
  !process.env.SEASON_E2E_DATABASE_URL,
  "Set SEASON_E2E_DATABASE_URL to a disposable database",
);
test("live APIs: REAL/TEST isolation, phone session, reusable accounts, purge and historical deletion", async ({
  page,
  browser,
}) => {
  const pool = new Pool({
    connectionString: process.env.SEASON_E2E_DATABASE_URL,
  });
  try {
    await pool.query(
      "TRUNCATE instances,bootstrap,setup_sessions,rate_limits RESTART IDENTITY CASCADE",
    );
    const now = Date.now(),
      opens = new Date(now + 86400000).toISOString(),
      closes = new Date(now + 2 * 86400000).toISOString();
    const post = async (path: string, body: unknown) =>
      page.request.post("/api/" + path, { headers: { origin }, data: body });
    const installed = await post("setup", {
      token: process.env.SETUP_TOKEN,
      instance: {
        public_name: "Halloween live",
        territory: "Commune",
        postal_code: "00000",
        country: "France",
        timezone: "Europe/Paris",
        latitude: 48.1,
        longitude: -1.67,
        zoom: 14,
      },
      admin: {
        display_name: "Super Admin",
        email: "admin-live@example.invalid",
        password,
      },
      season: {
        name: "REAL live",
        year: new Date().getFullYear(),
        is_test: false,
        registrations_open: true,
        registrations_open_at: new Date(now - 86400000).toISOString(),
        opens_at: opens,
        closes_at: closes,
        purge_at: new Date(now + 3 * 86400000).toISOString(),
      },
    });
    expect(installed.ok()).toBe(true);
    let seasons = await (await page.request.get("/api/admin/seasons")).json();
    const real = seasons[0];
    expect(real.active).toBe(false);
    expect(
      (await (await page.request.get("/api/public")).json()).mapAccessible,
    ).toBe(false);
    expect(
      (
        await post("admin", {
          action: "activateSeason",
          id: real.id,
          payload: "ACTIVER",
        })
      ).ok(),
    ).toBe(true);
    const roles = await (await page.request.get("/api/admin/roles")).json();
    const user = await (
      await post("admin/users", {
        action: "invite",
        without_invitation: true,
        display_name: "Mr Test 1",
        password,
        role_id: roles.find((r: { name: string }) => r.name === "USER").id,
      })
    ).json();
    const account = (
      await (await page.request.get("/api/admin/users")).json()
    ).find((u: { id: string }) => u.id === user.id);
    expect(account.email).toMatch(/^test-.+@example\.invalid$/);
    expect(
      (
        await post("admin", {
          action: "season",
          payload: { name: "TEST live", is_test: true },
        })
      ).ok(),
    ).toBe(true);
    seasons = await (await page.request.get("/api/admin/seasons")).json();
    const testSeason = seasons.find((s: { is_test: boolean }) => s.is_test);
    expect(
      (
        await post("admin", {
          action: "activateSeason",
          id: testSeason.id,
          payload: "ACTIVER",
        })
      ).ok(),
    ).toBe(true);
    seasons = await (await page.request.get("/api/admin/seasons")).json();
    expect(seasons.filter((s: { active: boolean }) => s.active)).toHaveLength(
      1,
    );
    const participation = {
      house: {
        name: "Maison live",
        address: "12 rue fictive",
        latitude: 48.1001,
        longitude: -1.67,
        position_confirmed: true,
        activities: ["CANDY", "DECORATION"],
        starts_at: opens,
        ends_at: closes,
        fear: 2,
        adaptable: false,
        rp: "Ambiance",
        practical: "Entrée",
      },
      acceptance: {
        mode: "GUIDELINES_ONLY",
        guidelines: true,
        guidelines_version: "2026.1",
      },
    };
    expect(
      (
        await post("admin", {
          action: "createHouse",
          seasonId: testSeason.id,
          payload: { userId: account.id, participation },
        })
      ).ok(),
    ).toBe(true);
    const h = (await (await page.request.get("/api/admin/houses")).json())[0];
    expect(h.season_id).toBe(testSeason.id);
    expect(h.review_status).toBe("VALIDATED");
    const phone = await browser.newContext({ baseURL: origin }),
      visitor = await browser.newContext({ baseURL: origin });
    try {
      expect(
        (
          await phone.request.post("/api/login", {
            headers: { origin },
            data: { email: "admin-live@example.invalid", password },
          })
        ).ok(),
      ).toBe(true);
      expect(
        (
          await visitor.request.post("/api/login", {
            headers: { origin },
            data: { email: account.email, password },
          })
        ).ok(),
      ).toBe(true);
      expect(
        (await (await phone.request.get("/api/public")).json()).houses,
      ).toHaveLength(1);
      const blocked = await (await visitor.request.get("/api/public")).json();
      expect(blocked.season).toBeNull();
      expect(blocked.houses).toEqual([]);
      expect(blocked.mapAccessible).toBe(false);
      expect(
        (
          await visitor.request.post("/api/participation", {
            headers: { origin },
            data: participation,
          })
        ).status(),
      ).toBe(403);
      await post("admin", {
        action: "houseActivity",
        seasonId: testSeason.id,
        id: h.id,
        payload: { action: "candy", available: false },
      });
      expect(
        (await (await phone.request.get("/api/public")).json()).houses[0]
          .activities,
      ).toEqual(["DECORATION"]);
      const input = {
        acceptance: participation.acceptance,
        start: new Date().toISOString(),
        end: new Date(Date.now() + 3600000).toISOString(),
        origin: { latitude: 48.1, longitude: -1.67 },
        activities: [],
      };
      const route = await post("route", input);
      expect(route.ok(), await route.text()).toBe(true);
      await page.goto("/admin");
      await page
        .getByRole("navigation")
        .getByRole("button", { name: "Saison", exact: true })
        .click();
      await expect(page.locator(".season-active")).toContainText("TEST live");
      expect(
        (
          await post("admin", {
            action: "deleteSeason",
            id: testSeason.id,
            payload: testSeason.name,
          })
        ).status(),
      ).toBe(409);
      await post("admin", {
        action: "activateSeason",
        id: real.id,
        payload: "ACTIVER",
      });
      await post("admin", {
        action: "createHouse",
        seasonId: real.id,
        payload: { userId: account.id, participation },
      });
      const realHouse = (
        await (await page.request.get("/api/admin/houses")).json()
      )[0];
      expect(realHouse.review_status).toBe("VALIDATED");
      expect(
        (
          await post("admin", {
            action: "deleteSeason",
            id: testSeason.id,
            payload: testSeason.name,
          })
        ).ok(),
      ).toBe(true);
      expect((await (await visitor.request.get("/api/me")).json()).id).toBe(
        account.id,
      );
      await pool.query(
        "UPDATE seasons SET opens_at=now()-interval '2 hours',closes_at=now()-interval '1 hour',registrations_open_at=now()-interval '3 hours',purge_at=now()+interval '1 hour' WHERE id=$1",
        [real.id],
      );
      await page.request.get("/api/public");
      await pool.query(
        "UPDATE seasons SET purge_at=now()-interval '1 second' WHERE id=$1",
        [real.id],
      );
      await page.request.get("/api/public");
      const historical = (
        await (await page.request.get("/api/admin/seasons")).json()
      ).find((s: { id: string }) => s.id === real.id);
      expect(historical.stats.houses).toBe(1);
      expect(historical.stats.approved).toBe(1);
      expect(historical.purged_at).toBeTruthy();
      expect(
        (
          await pool.query("SELECT * FROM participations WHERE season_id=$1", [
            real.id,
          ])
        ).rows,
      ).toEqual([]);
      expect(
        (
          await post("admin", {
            action: "activateSeason",
            id: real.id,
            payload: "ACTIVER",
          })
        ).status(),
      ).toBe(400);
      expect(
        (
          await post("admin", {
            action: "deleteSeason",
            id: real.id,
            payload: real.name,
          })
        ).ok(),
      ).toBe(true);
      expect((await (await visitor.request.get("/api/me")).json()).id).toBe(
        account.id,
      );
    } finally {
      await phone.close();
      await visitor.close();
    }
  } finally {
    await pool.end();
  }
});
