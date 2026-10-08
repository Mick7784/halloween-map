// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement as h, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import FloatingWindow from "../components/FloatingWindow";
import AccountOverlay from "../components/AccountOverlay";
import UserMenu from "../components/UserMenu";
import InstallApp, { InstallAppProvider } from "../components/InstallApp";
import MapExperience from "../components/MapExperience";
import { useDialogFocus } from "../components/useDialogFocus";
import type { User } from "../lib/domain";
import type { PublicState } from "../components/common";

const fixture = vi.hoisted(() => ({
  controller: {} as Record<string, unknown>,
}));
vi.mock("../components/useActiveRoute", () => ({
  default: () => fixture.controller,
}));
vi.mock("../components/Map", () => ({
  default: () => h("div", { "data-testid": "map" }, "Zoom et géolocalisation"),
}));
const user = {
  id: "user",
  instance_id: "instance",
  display_name: "Mickaël",
  email: "user@example.invalid",
  email_status: "VERIFIED",
  role_name: "ADMIN",
  permissions: ["admin.access"],
} as User;
const state = {
  state: "MAP_OPEN",
  instance: {
    id: "instance",
    timezone: "Europe/Paris",
    longitude: 2.8,
    latitude: 48.8,
    zoom: 14,
    territory: "Commune",
  },
  season: {
    id: "season",
    closes_at: new Date(Date.now() + 86400000).toISOString(),
  },
  houses: [],
  documents: {},
} as unknown as PublicState;
let root: Root;
let host: HTMLDivElement;
function Harness({ children }: { children: (close: () => void) => ReactNode }) {
  useDialogFocus();
  const [open, setOpen] = useState(false);
  return h(
    "div",
    null,
    h("button", { id: "trigger", onClick: () => setOpen(true) }, "Ouvrir"),
    open && children(() => setOpen(false)),
  );
}
async function render(children: (close: () => void) => ReactNode) {
  await act(async () => root.render(h(Harness, { children })));
  await click(document.querySelector("#trigger")!);
}
async function click(el: Element) {
  await act(async () => {
    (el as HTMLElement).focus();
    (el as HTMLElement).click();
  });
}
function byLabel(label: string) {
  return document.querySelector(`[aria-label="${label}"]`)!;
}
async function key(value: string, shiftKey = false) {
  await act(async () =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: value,
        shiftKey,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(
    function (this: HTMLElement) {
      return this.closest("[hidden],[inert]")
        ? ([] as unknown as DOMRectList)
        : ([{}] as unknown as DOMRectList);
    },
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }));
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: globalThis.matchMedia,
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  fixture.controller = {
    ready: true,
    phase: "preparation",
    result: null,
    selectedHouse: null,
    parameters: null,
    unavailable: [],
    collection: {
      startedAt: null,
      endedAt: null,
      distanceMeters: 0,
      visitedIds: [],
    },
    sheet: "collapsed",
    gpsState: "tracking",
    verified: true,
    remaining: 1,
    deletePreparedRoute: vi.fn(),
    setSheet: vi.fn(),
    setCamera: vi.fn(),
    selectHouse: vi.fn(),
    recenterCurrentPosition: vi.fn(),
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("shared floating windows", () => {
  for (const way of ["X", "backdrop", "Escape"])
    it(`${way} closes and restores trigger focus; inside clicks remain open`, async () => {
      await render((onClose) =>
        h(FloatingWindow, {
          title: "Fenêtre",
          onClose,
          children: h("button", { id: "inside" }, "Intérieur"),
        }),
      );
      expect(document.activeElement).toBe(byLabel("Fermer Fenêtre"));
      await click(document.querySelector("#inside")!);
      expect(document.querySelector('[role="dialog"]')).not.toBeNull();
      await key("Tab");
      expect(document.activeElement).toBe(byLabel("Fermer Fenêtre"));
      if (way === "X") await click(byLabel("Fermer Fenêtre"));
      else if (way === "backdrop")
        await click(document.querySelector(".floating-overlay")!);
      else await key("Escape");
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(document.activeElement?.id).toBe("trigger");
    });
  for (const className of [
    "beta-overlay",
    "participation-overlay",
    "route-overlay",
    "modal-backdrop",
  ])
    it(`existing ${className} shares backdrop and Escape handling`, async () => {
      await render((onClose) =>
        h(
          "div",
          { className },
          h(
            "section",
            { role: "dialog", onClick: (e) => e.stopPropagation() },
            h(
              "button",
              { className: "close", "aria-label": "Fermer", onClick: onClose },
              "X",
            ),
            h("p", { id: "content" }, "Contenu"),
          ),
        ),
      );
      await click(document.querySelector("#content")!);
      expect(document.querySelector('[role="dialog"]')).not.toBeNull();
      await click(document.querySelector("." + className)!);
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      await click(document.querySelector("#trigger")!);
      await key("Escape");
      expect(document.querySelector('[role="dialog"]')).toBeNull();
    });
  it("nested installation help closes independently and returns focus to its parent action", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("iPhone Safari");
    window.matchMedia = vi.fn(
      () =>
        ({
          matches: false,
          addEventListener() {},
          removeEventListener() {},
        }) as unknown as MediaQueryList,
    );
    await render((onClose) =>
      h(InstallAppProvider, {
        children: h(FloatingWindow, {
          title: "Parent",
          onClose,
          children: h(InstallApp),
        }),
      }),
    );
    const install = document.querySelector(".install-cta")!;
    await click(install);
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2);
    await key("Escape");
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(document.activeElement).toBe(install);
    await key("Escape");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement?.id).toBe("trigger");
  });
  it("has no back action on a root view; back changes only its subview", async () => {
    function Views({ onClose }: { onClose: () => void }) {
      const [sub, setSub] = useState(false);
      return h(FloatingWindow, {
        title: sub ? "Sous-vue" : "Racine",
        onClose,
        onBack: sub ? () => setSub(false) : undefined,
        children: h(
          "button",
          { id: "next", onClick: () => setSub(true) },
          "Suite",
        ),
      });
    }
    await render((onClose) => h(Views, { onClose }));
    expect(byLabel("Revenir à la vue précédente")).toBeNull();
    await click(document.querySelector("#next")!);
    await click(byLabel("Revenir à la vue précédente"));
    expect(
      document.querySelector('[role="dialog"]')?.getAttribute("aria-label"),
    ).toBe("Racine");
    expect(byLabel("Revenir à la vue précédente")).toBeNull();
  });
  it("Mon compte back returns within its window and X closes from a subview", async () => {
    await render((onClose) =>
      h(AccountOverlay, { user, state, refresh: async () => {}, onClose }),
    );
    const privacy = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Confidentialité et données"),
    )!;
    await click(privacy);
    await click(byLabel("Revenir à Mon compte"));
    expect(document.querySelector(".account-dialog")).not.toBeNull();
    await click(
      Array.from(document.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Confidentialité et données"),
      )!,
    );
    expect(document.querySelector(".account-view-privacy")).not.toBeNull();
    await click(byLabel("Fermer Mon compte"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    expect(document.querySelector(".account-dialog")).toBeNull();
  });
  for (const width of [390, 1440])
    it(`same menu actions and no legal links at ${width}px`, async () => {
      Object.defineProperty(window, "innerWidth", {
        value: width,
        configurable: true,
      });
      await render((onClose) =>
        h(UserMenu, { user, state, version: "V0.7.2", onClose, login: null }),
      );
      const dialog = document.querySelector('[role="dialog"]')!;
      for (const href of [
        "/map",
        "/participant",
        "/map#parcours",
        "/admin",
        "/account",
      ])
        expect(dialog.querySelector(`a[href="${href}"]`)).not.toBeNull();
      expect(
        dialog.querySelector(
          'a[href="/legal"],a[href="/privacy"],a[href="/terms"]',
        ),
      ).toBeNull();
      expect(dialog.textContent).toContain("Se déconnecter");
      expect(dialog.textContent).toContain("Signaler un bug");
      await key("Escape");
      expect(document.querySelector('[role="dialog"]')).toBeNull();
    });
});

describe("map navigation surfaces", () => {
  it("inactive map has no internal user toolbar or permanent discovery panel; filters remain reachable", async () => {
    await render(() =>
      h(MapExperience, { state, user, mapStyle: "", refresh: async () => {} }),
    );
    expect(
      document.querySelector(
        ".route-map-toolbar,.route-map-discovery,.route-house-list",
      ),
    ).toBeNull();
    expect(document.querySelector('[data-testid="map"]')).not.toBeNull();
    await act(async () => window.dispatchEvent(new Event("map-options")));
    expect(byLabel("Maisons et filtres")).not.toBeNull();
    expect(
      document.querySelectorAll(".route-discovery-filters button"),
    ).toHaveLength(3);
    await click(byLabel("Fermer Maisons et filtres"));
    expect(byLabel("Maisons et filtres")).toBeNull();
  });
  it("calculated route is a closable window; active route retains toolbar, sheet and recenter", async () => {
    fixture.controller.phase = "calculated";
    fixture.controller.result = {
      stops: [
        {
          house: {
            id: "house",
            name: "Maison",
            activities: ["CANDY"],
            fear: 1,
            starts_at: state.season!.closes_at,
            ends_at: state.season!.closes_at,
          },
        },
      ],
      distanceMeters: 300,
      durationSeconds: 300,
      disclaimer: "À pied",
    };
    await render(() =>
      h(MapExperience, { state, user, mapStyle: "", refresh: async () => {} }),
    );
    expect(
      document.querySelector(".route-experience.is-focused,.route-map-toolbar"),
    ).toBeNull();
    expect(
      document.querySelector(".prepared-route-window .route-sheet"),
    ).not.toBeNull();
    await click(byLabel("Fermer Mon parcours Halloween"));
    expect(document.querySelector(".prepared-route-window")).toBeNull();
    expect(fixture.controller.deletePreparedRoute).not.toHaveBeenCalled();
    fixture.controller.phase = "active";
    await act(async () =>
      root.render(
        h(Harness, {
          children: () =>
            h(MapExperience, {
              state,
              user,
              mapStyle: "",
              refresh: async () => {},
            }),
        }),
      ),
    );
    expect(
      document.querySelector(".route-experience.is-focused .route-map-toolbar"),
    ).not.toBeNull();
    expect(
      document.querySelector(".route-map-layer .route-sheet"),
    ).not.toBeNull();
    expect(byLabel("Recentrer sur ma position")).not.toBeNull();
    expect(document.querySelector(".route-account-link")).not.toBeNull();
  });
});
