import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StudioEditorTool } from "../components/StudioEditorTool";

describe("StudioEditorTool shared formatting action", () => {
  it("exposes active formatting state to assistive technologies", () => {
    const html = renderToStaticMarkup(
      React.createElement(StudioEditorTool, {
        editor: { id: "editor" },
        label: "Gras",
        run: () => undefined,
        active: true,
      }),
    );
    expect(html).toContain('aria-label="Gras"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toContain("disabled");
    expect(html).toContain("<svg");
    expect(html).toContain('aria-hidden="true"');
  });

  it("keeps a text fallback for custom actions", () => {
    const html = renderToStaticMarkup(
      React.createElement(StudioEditorTool, {
        editor: { custom: true },
        label: "Action personnalisée",
        run: () => undefined,
      }),
    );
    expect(html).toContain("Action personnalisée");
    expect(html).not.toContain("<svg");
  });

  it("disables formatting when no editor is available", () => {
    const html = renderToStaticMarkup(
      React.createElement(StudioEditorTool, {
        editor: null,
        label: "Italique",
        run: () => undefined,
      }),
    );
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("disabled");
  });

  it("respects explicit disabled state independently of the editor implementation", () => {
    const html = renderToStaticMarkup(
      React.createElement(StudioEditorTool, {
        editor: { custom: true },
        label: "Tableau",
        run: () => undefined,
        disabled: true,
      }),
    );
    expect(html).toContain('aria-label="Tableau"');
    expect(html).toContain("disabled");
  });
});
