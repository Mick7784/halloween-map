import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { it, expect, vi } from "vitest";
import {
  formatCount,
  formatDistance,
  formatDuration,
  formatPercent,
  average,
  unavailableMetric,
} from "../lib/admin-metrics";
import AdminDashboard from "../components/AdminDashboard";
import AdminStatistics from "../components/AdminStatistics";
import type { Season } from "../lib/domain";
vi.stubGlobal("React", React);
it("distinguishes zero from absent, null and invalid metrics", () => {
  expect(formatCount(0)).toBe("0");
  for (const missing of [undefined, null, NaN, Infinity]) {
    for (const formatter of [
      formatCount,
      formatDistance,
      formatDuration,
      formatPercent,
    ])
      expect(formatter(missing)).toBe(unavailableMetric);
  }
  expect(formatDistance(0)).toBe("0 km");
  expect(formatDuration(0)).toBe("0 min");
  expect(formatPercent(0)).toBe("0 %");
  expect(formatDistance(1234)).toBe("1,2 km");
  expect(formatDuration(90)).toBe("1,5 min");
  expect(formatPercent(0.125)).toBe("12,5 %");
  expect(average(0, 2)).toBe(0);
  expect(average(10, 0)).toBeUndefined();
  expect(average(undefined, 2)).toBeUndefined();
});
it("renders dashboard missing aggregates as unavailable and measured zeros as zero", () => {
  const html = renderToStaticMarkup(
    React.createElement(AdminDashboard, {
      metrics: {
        approved: 0,
        pending: 0,
        users: 0,
        routes: 0,
        collectionStats: { collections_started: 0, distance_meters: 0 },
      },
      pending: [],
      audit: [],
      loading: false,
      zone: "Europe/Paris",
      onHouse: () => {},
    }),
  );
  expect(html).toContain("Participants uniques");
  expect(html).toContain("<strong>0</strong>");
  expect(html).toContain("<strong>0 km</strong>");
  expect(html.match(/Donnée non disponible/g)).toHaveLength(2);
});
it("uses the same count, distance and absent-value rules in statistics", () => {
  const html = renderToStaticMarkup(
    React.createElement(AdminStatistics, {
      data: {
        seasonId: "s",
        snapshot: true,
        stats: {
          houses: 0,
          participants: 0,
          distance_meters: 1234,
          collections_started: 2,
          collections_finished: 0,
        },
      },
      season: { id: "s" } as Season,
      loading: false,
    }),
  );
  expect(html).toContain("<strong>0</strong>");
  expect(html).toContain("1,2 km");
  expect(html).toContain("0 %");
  expect(html).toContain(unavailableMetric);
});
