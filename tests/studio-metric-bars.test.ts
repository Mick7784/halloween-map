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
    expect(html).toContain('data-measurement="measured"');
    expect(html).toContain('data-measurement="unavailable"');
    expect(html).toContain("Certaines valeurs ne sont pas disponibles.");
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

describe("StudioMetricBars zero and invalid quantity semantics", () => {
  it("uses a truthful all-zero note instead of inventing a maximum of one", () => {
    const html = build([["Validées", 0], ["En attente", 0]]);
    expect(html).toContain("Toutes les valeurs mesurées sont à 0.");
    expect(html).not.toContain("Échelle relative : 0 à 1");
    expect((html.match(/width:0%/g) ?? [])).toHaveLength(2);
    expect(html).not.toContain("Certaines valeurs ne sont pas disponibles.");
  });

  it("excludes negative and nonfinite quantities from bar-scale comparisons", () => {
    const html = build([["Valide", 4], ["Invalide", -2], ["Infini", Infinity]]);
    expect(html).toContain("Échelle relative : 0 à 4 maisons.");
    expect((html.match(/class="stats-track"/g) ?? [])).toHaveLength(1);
    expect(html).not.toContain("<strong>-2</strong>");
    expect(html).toContain("Certaines valeurs ne sont pas disponibles.");
  });
});
