import { test, expect } from "@playwright/test";
import { Pool } from "pg";
const origin = process.env.APP_ORIGIN ?? "http://localhost:3000",
  password = "season-browser-password-1234";
// This suite requires an explicitly supplied disposable DB, never a production DB.
test.skip(
  !process.env.SEASON_E2E_DATABASE_URL,
  "Set SEASON_E2E_DATABASE_URL to a disposable database",
);
test("live APIs: active real season, phone session, reusable accounts, post-close preview, purge and historical deletion", async ({
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
      page.request.post("/api/" + path, {
        headers: { origin },
        data: {
          current_password: password,
          ...(body as Record<string, unknown>),
        },
      });
    const installed = await post("setup", {
      token: process.env.SETUP_TOKEN,
      instance: {
        public_name: "Halloween live",
        territory: "Rennes",
        postal_code: "35000",
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
        registrations_open_at: new Date(now + 3600000).toISOString(),
        opens_at: opens,
        closes_at: closes,
        purge_at: new Date(now + 3 * 86400000).toISOString(),
      },
    });
    expect(installed.ok()).toBe(true);
    let seasons = await (await page.request.get("/api/admin/seasons")).json();
    const real = seasons[0];
    expect(real.active).toBe(false);
    const preview = await (await page.request.get("/api/public")).json();
    expect(preview.mapAccessible).toBe(false);
    expect(preview.earlyAccess).toBe(false);
    expect(preview.publicMapOpen).toBe(false);
    expect(preview.state).toBe("PREPARATION");
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
    ).toBe(false);
    // Retain coverage for legacy TEST seasons without creating one through the API.
    await pool.query("INSERT INTO seasons(instance_id,year,name,is_test,registrations_open,registrations_open_at,opens_at,closes_at,purge_at) SELECT id,2026,'TEST live',true,true,'2000-01-01T00:00Z','2000-01-01T00:00Z','2201-01-01T00:00Z','2201-01-02T00:00Z' FROM instances");
    seasons = await (await page.request.get("/api/admin/seasons")).json();
    expect(seasons.some((s:{is_test:boolean})=>s.is_test)).toBe(false);
    const historical=(await pool.query('SELECT id FROM seasons WHERE is_test')).rows[0];
    expect((await post('admin',{action:'activateSeason',id:historical.id,payload:'ACTIVER'})).status()).toBe(400);
    const testSeason=real;
    seasons = await (await page.request.get("/api/admin/seasons")).json();
    expect(seasons.filter((s: { active: boolean }) => s.active)).toHaveLength(
      1,
    );
    const participation = {
      house: {
        name: "Maison live",
        address_parts: {
          number: "12",
          street: "Rue des Lanternes",
          postalCode: "35000",
          city: "Rennes",
          cityCode: "35238",
        },
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
          payload: {
            userId: account.id,
            participation: {
              ...participation,
              house: {
                ...participation.house,
                starts_at: opens,
                ends_at: closes,
              },
            },
          },
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
      expect(blocked.season.id).toBe(real.id);
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
        start: opens,
        end: closes,
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
      await expect(page.locator(".season-active")).toContainText("REAL live");
      expect(
        (
          await post("admin", {
            action: "deleteSeason",
            id: testSeason.id,
            payload: testSeason.name,
          })
        ).status(),
      ).toBe(409);
      expect((await (await visitor.request.get("/api/me")).json()).id).toBe(
        account.id,
      );
      await pool.query(
        "UPDATE seasons SET opens_at=now()-interval '2 hours',closes_at=now()-interval '1 hour',registrations_open_at=now()-interval '3 hours',purge_at=now()+interval '1 hour' WHERE id=$1",
        [real.id],
      );
      await pool.query("UPDATE participations p SET starts_at=s.opens_at,ends_at=s.closes_at FROM seasons s WHERE p.season_id=s.id AND s.id=$1", [real.id]);
      const after=await (await page.request.get('/api/public')).json();
      expect(after.mapAccessible).toBe(true);expect(after.earlyAccess).toBe(true);
      expect((await (await visitor.request.get('/api/public')).json()).mapAccessible).toBe(false);
      const closedSeason=(await pool.query('SELECT opens_at,closes_at FROM seasons WHERE id=$1',[real.id])).rows[0];
      const postCloseRoute = await post('route',{...input,start:new Date(closedSeason.opens_at).toISOString(),end:new Date(closedSeason.closes_at).toISOString()});
      expect(postCloseRoute.ok(), await postCloseRoute.text()).toBe(true);
      expect((await postCloseRoute.json()).stops).toHaveLength(1);
      const lateReview=await post('admin',{action:'reviewHouse',seasonId:real.id,id:h.id,payload:{status:'REFUSED',reason_code:'ADDRESS'}});
      expect(lateReview.ok(),await lateReview.text()).toBe(true);
      await pool.query(
        "UPDATE seasons SET purge_at=now()-interval '1 second' WHERE id=$1",
        [real.id],
      );
      const [lateVisibility] = await Promise.all([
        post("admin", {action:"visibility",seasonId:real.id,id:h.id,payload:"HIDDEN"}),
        page.request.get("/api/public"),
      ]);
      expect([200,403,404]).toContain(lateVisibility.status());
      expect((await pool.query("SELECT id FROM audit_logs WHERE season_id=$1 OR target_id=ANY($2::uuid[])", [real.id,[real.id,h.id]])).rows).toEqual([]);
      const historical = (
        await (await page.request.get("/api/admin/seasons")).json()
      ).find((s: { id: string }) => s.id === real.id);
      expect(historical.stats.houses).toBe(1);
      expect(historical.stats.refused).toBe(1);
      expect(historical.stats.routes).toBe(0);
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
