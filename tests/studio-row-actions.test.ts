import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import StudioRowActions from "../components/StudioRowActions";

describe("StudioRowActions context grouping", () => {
  it("keeps the supplied actions visible and labels sensitive operations", () => {
    const html = renderToStaticMarkup(
      React.createElement(StudioRowActions, {
        label: "Actions de Saison test",
        actions: React.createElement("button", { type: "button" }, "Réglages"),
        sensitive: React.createElement("button", { type: "button" }, "Supprimer"),
      }),
    );
    expect(html).toContain('aria-label="Actions de Saison test"');
    expect(html).toContain('aria-label="Actions sensibles"');
    expect(html).toContain("Réglages");
    expect(html).toContain("Supprimer");
    expect(html).not.toContain("<summary");
  });

  it("does not render an empty dangerous-actions group for restricted views", () => {
    const html = renderToStaticMarkup(
      React.createElement(StudioRowActions, {
        label: "Actions de Saison test",
        actions: React.createElement("button", { type: "button" }, "Voir les statistiques"),
      }),
    );
    expect(html).not.toContain("Actions sensibles");
    expect(html).toContain("Voir les statistiques");
  });
});
