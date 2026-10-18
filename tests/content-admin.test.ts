// @vitest-environment jsdom
import { act, createElement as h, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { it, expect, vi } from "vitest";
import ContentAdmin from "../components/ContentAdmin";
import { contentDefaults, legalDefaults, type LegalDocument } from "../lib/content";
it("separates application texts, document cards and preserved contact controls", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"), root = createRoot(host);
  document.body.append(host);
  const active = Object.fromEntries(Object.entries(legalDefaults).map(([kind, d]) => [kind, { ...d, kind, version: "2026.1", status: "PUBLISHED", active: true, requires_reaccept: false, published_at: null }])) as ComponentProps<typeof ContentAdmin>["data"]["active"];
  const data = { catalog: contentDefaults, values: Object.fromEntries(Object.entries(contentDefaults).map(([k, d]) => [k, d.value])), active, documents: [] as LegalDocument[] };
  async function click(text: string) { const button = [...host.querySelectorAll("button")].find(b => b.textContent?.startsWith(text)); expect(button).toBeTruthy(); await act(async () => button!.click()); }
  try {
    await act(async () => root.render(h(ContentAdmin, { data, reload: async () => {} })));
    expect(host.querySelector('textarea')).toBeTruthy();
    expect(host.querySelector('[role="toolbar"]')).toBeNull();
    expect(host.querySelector('[aria-label="Sections des contenus"]')?.querySelectorAll('button')).toHaveLength(3);
    await click("Documents officiels");
    expect(host.querySelectorAll(".studio-document-grid .studio-panel")).toHaveLength(4);
    expect(host.querySelector(".document-editor")).toBeNull();
    await click("Liens & contact");
    expect(host.querySelector('[name="bugEmail"]')).toBeTruthy();
    expect(host.querySelector('[name="supportUrl"]')).toBeTruthy();
    expect(host.querySelector('[name="contactEnabled"]')).toBeTruthy();
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
