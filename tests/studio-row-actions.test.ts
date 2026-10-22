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

  it("allows existing domain row layout classes without changing permissions", () => {
    const html = renderToStaticMarkup(
      React.createElement(StudioRowActions, {
        label: "Actions de Maison",
        className: "row-actions house-row-actions",
        actions: React.createElement("button", { type: "button" }, "Voir"),
      }),
    );
    expect(html).toContain('class="studio-row-actions row-actions house-row-actions"');
    expect(html).toContain('aria-label="Actions de Maison"');
    expect(html).not.toContain("Actions sensibles");
    expect(html).toContain(">Voir</button>");
  });
});
