import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StudioMetricBars } from "../components/StudioMetricBars";

const build = (items: readonly (readonly [string, number | null | undefined])[], chart = true) =>
  renderToStaticMarkup(
    React.createElement(StudioMetricBars, {
      title: "Métriques fictives",
      items,
      chart,
      unit: "maisons",
      unavailable: "Donnée non disponible",
      formatValue: (value: number | null | undefined) =>
        typeof value === "number" && Number.isFinite(value)
          ? String(value)
          : "Donnée non disponible",
    }),
  );

describe("StudioMetricBars reusable comparisons", () => {
  it("retains measured zeros and ignores absent or invalid data when calculating scale", () => {
    const html = build([["Zéro mesuré", 0], ["Présent", 8], ["Absent", undefined], ["Invalide", NaN]]);
    expect(html).toContain("Zéro mesuré");
    expect(html).toContain("<strong>0</strong>");
    expect(html).toContain("Échelle relative : 0 à 8 maisons.");
    expect(html).toContain("width:0%");
    expect(html).toContain("width:100%");
    expect(html).toContain("Donnée non disponible");
    expect((html.match(/class="stats-track"/g) ?? [])).toHaveLength(2);
  });
  it("does not render misleading empty bars or a fabricated metric for all missing values", () => {
    const html = build([["Absent", null], ["Inconnu", undefined]]);
    expect(html).toContain("<p class="); 
    expect(html).toContain("Donnée non disponible");
    expect(html).not.toContain("stats-track");
    expect(html).not.toContain("Échelle relative");
  });
  it("supports numeric lists without bars when the metrics cannot be compared on one scale", () => {
    const html = build([["Parcours", 12], ["Visites", 23]], false);
    expect(html).toContain("<strong>12</strong>");
    expect(html).toContain("<strong>23</strong>");
    expect(html).not.toContain("stats-track");
    expect(html).not.toContain("Échelle relative");
  });
});
