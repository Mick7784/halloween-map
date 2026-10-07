import { expect } from "@playwright/test";
import {
  mapAccessible,
  visible,
  type House,
  type Season,
} from "../../lib/domain";

// Existing UI suites simulate API responses. Keep those DTOs consistent with
// the REAL context enforced by the backend; this is not an access bypass.
export function realSeasonFixture({
  id = "30000000-0000-4000-8000-000000000001",
  instanceId = "20000000-0000-4000-8000-000000000001",
  now = Date.now(),
  opensIn = -2 * 3600000,
  closesIn = 5 * 3600000,
} = {}): Season & { opens_at: string; closes_at: string; purge_at: string } {
  return {
    id,
    instance_id: instanceId,
    name: "REAL E2E",
    year: new Date(now + opensIn).getUTCFullYear(),
    is_test: false,
    active: true,
    registrations_open: true,
    registrations_open_at: new Date(now - 30 * 86400000).toISOString(),
    opens_at: new Date(now + opensIn).toISOString(),
    closes_at: new Date(now + closesIn).toISOString(),
    purge_at: new Date(now + closesIn + 36 * 3600000).toISOString(),
    archived: false,
    purged_at: null,
    routes_count: 0,
    stats: {},
  };
}
export function assertOpenRealFixture(
  season: Season,
  houses: Array<Omit<House, "fear"> & { fear: number | null }>,
  user: { instance_id: string; account_status: string; email_status: string },
  activeSeasonId: string,
) {
  expect(season.is_test).toBe(false);
  expect(season.id).toBe(activeSeasonId);
  expect(user.instance_id).toBe(season.instance_id);
  expect(user.account_status).toBe("ACTIVE");
  expect(user.email_status).toBe("VERIFIED");
  expect(mapAccessible(season)).toBe(true);
  for (const h of houses) {
    expect(h.season_id).toBe(activeSeasonId);
    expect(h.instance_id).toBe(season.instance_id);
    expect(h.user_id).toBeTruthy();
    expect(h.review_status).toBe("VALIDATED");
    expect(visible({ ...h, fear: h.fear ?? 0 }, season)).toBe(true);
  }
}
