import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import StudioCollectionControls from "../components/StudioCollectionControls";

const render = (count: number, filtered: boolean) =>
  renderToStaticMarkup(
    React.createElement(
      StudioCollectionControls,
      { label: "Filtres fictifs", count, filtered, onReset: () => {} },
      React.createElement("input", { "aria-label": "Recherche" }),
    ),
  );

describe("StudioCollectionControls shared filters", () => {
  it("retains the supplied controls and a localized result count", () => {
    const html = render(1, true);
    expect(html).toContain('aria-label="Filtres fictifs"');
    expect(html).toContain('aria-label="Recherche"');
    expect(html).toContain("1 résultat");
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain("disabled");
  });
  it("shows zero results and prevents reset when no filter is active", () => {
    const html = render(0, false);
    expect(html).toContain("0 résultats");
    expect(html).toContain("Effacer les filtres");
    expect(html).toContain("disabled");
  });
});
