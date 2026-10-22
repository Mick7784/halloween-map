import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import StudioMailPreview from "../components/StudioMailPreview";

describe("StudioMailPreview safe HTML/text presentation", () => {
  it("isolates rendered HTML in a sandboxed iframe and keeps plain text available", () => {
    const html = renderToStaticMarkup(
      React.createElement(StudioMailPreview, {
        title: "Aperçu test",
        frameTitle: "Document HTML de test",
        html: '<p>Texte vérifié</p><img src=x onerror=alert(1)>',
        text: "Version texte\nLigne suivante",
        textLabel: "Texte brut",
        collapsibleHtml: true,
        htmlLabel: "Aperçu du véritable email envoyé",
      }),
    );
    expect(html).toContain('sandbox=""');
    expect(html).toContain("srcDoc=");
    expect(html).toContain('title="Document HTML de test"');
    expect(html).toContain("Aperçu du véritable email envoyé");
    expect(html).toContain("Texte brut");
    expect(html).toContain("Version texte");
    expect(html).not.toContain("<img src=x onerror=");
  });
  it("displays an invalid-document warning without injecting a preview iframe", () => {
    const html = renderToStaticMarkup(
      React.createElement(StudioMailPreview, {
        title: "Aperçu test",
        frameTitle: "Document HTML",
        error: "Balise manquante",
      }),
    );
    expect(html).toContain("Document HTML invalide :");
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("<iframe");
  });
});
