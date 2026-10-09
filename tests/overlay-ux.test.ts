// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement as h, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import FloatingWindow from "../components/FloatingWindow";
import AccountOverlay from "../components/AccountOverlay";
import UserMenu from "../components/UserMenu";
import InstallApp, { InstallAppProvider } from "../components/InstallApp";
import RouteSheet from "../components/RouteSheet";
import RoutePreparation from "../components/RoutePreparation";
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
  // jsdom does not reflect inert; match the native browser attribute behavior.
  Object.defineProperty(HTMLElement.prototype, "inert", {
    configurable: true,
    get() {
      return this.hasAttribute("inert");
    },
    set(value: boolean) {
      this.toggleAttribute("inert", value);
    },
  });
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
    invalidate: vi.fn(),
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
  it("does not reapply a parent lock released while a nested dialog closes", async () => {
    host.inert = true;
    host.setAttribute("aria-hidden", "true");
    await render((onClose) =>
      h(FloatingWindow, { title: "Fenêtre", onClose, children: "Contenu" }),
    );
    host.inert = false;
    host.removeAttribute("aria-hidden");
    await click(byLabel("Fermer Fenêtre"));
    expect(host.inert).toBe(false);
    expect(host.hasAttribute("aria-hidden")).toBe(false);
  });
  it("returns from inline guidelines and then closes preparation with Escape", async () => {
    await render((onClose) =>
      h(RoutePreparation, {
        state: {
          ...state,
          documents: {
            ...state.documents,
            GUIDELINES: {
              title: "Bonnes pratiques",
              version: "1",
              body: "Respectez les habitants.",
              kind: "GUIDELINES",
              status: "PUBLISHED",
              active: true,
              requires_reaccept: false,
              published_at: new Date().toISOString(),
            },
          },
        } as unknown as PublicState,
        origin: [2.8, 48.8],
        originLabel: "GPS",
        activities: ["CANDY"],
        onOrigin: vi.fn(),
        onPick: vi.fn(),
        onClose,
        onCalculate: async () => {},
        onInvalidate: vi.fn(),
        maxFear: 2,
        onFear: vi.fn(),
      }),
    );
    const prep = document.querySelector(".route-preparation") as HTMLElement;
    await click(
      Array.from(prep.querySelectorAll("button")).find(
        (b) => b.textContent === "bonnes pratiques",
      )!,
    );
    expect(prep.inert).toBe(true);
    await click(byLabel("Revenir à la préparation"));
    expect(prep.inert).toBe(false);
    await key("Escape");
    expect(document.querySelector(".route-preparation")).toBeNull();
    expect(document.activeElement?.id).toBe("trigger");
  });
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
      expect(host.inert).toBe(true);
      expect(host.getAttribute("aria-hidden")).toBe("true");
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
      expect(host.inert).toBeFalsy();
      expect(host.hasAttribute("aria-hidden")).toBe(false);
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
        h(UserMenu, {
          user,
          state: { ...state, mapAccessible: true },
          version: "V0.7.2",
          onClose,
          login: null,
        }),
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
  it("calculated route is a closable window; active collection retains top panel, bottom stop and recenter", async () => {
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
    await click(byLabel("Fermer Ma collecte Halloween"));
    expect(document.querySelector(".prepared-route-window")).toBeNull();
    expect(fixture.controller.deletePreparedRoute).not.toHaveBeenCalled();
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({
            coords: { longitude: 2.81, latitude: 48.81, accuracy: 10 },
          } as GeolocationPosition),
      },
    });
    await click(byLabel("Me localiser"));
    expect(fixture.controller.invalidate).not.toHaveBeenCalled();
    expect(fixture.controller.phase).toBe("calculated");
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
    ).toBeNull();
    expect(document.querySelector(".collection-top-panel")).not.toBeNull();
    expect(
      document.querySelector(".collection-top-panel")?.textContent,
    ).not.toContain("Arrêter");
    expect(
      document.querySelector(".collection-bottom-bar")?.textContent,
    ).toContain("Arrêter la collecte");
    expect(
      document.querySelector(".route-map-layer .route-sheet"),
    ).not.toBeNull();
    expect(byLabel("Recentrer sur ma position")).not.toBeNull();
    expect(document.querySelector(".route-account-link")).not.toBeNull();
  });
});

describe("visitor collection preparation", () => {
  it("uses cumulative fear, keeps adaptable houses and submits only the freely selected houses", async () => {
    const now = Date.now();
    const houses = [1, 2, 3].map((fear) => ({
      id: `10000000-0000-4000-8000-00000000000${fear}`,
      name: `Maison niveau ${fear}`,
      address: "Rue des maisons",
      latitude: 48.8,
      longitude: 2.8,
      fear,
      adaptable: fear === 3,
      activities: ["CANDY" as const],
      starts_at: new Date(now - 3600000).toISOString(),
      ends_at: new Date(now + 86400000).toISOString(),
      rp: "",
      practical: "",
    }));
    const calculate = vi.fn().mockResolvedValue(undefined);
    const props = {
      state: {
        ...state,
        houses,
        routeCandidates: [
          ...houses,
          ...Array.from({ length: 240 }, (_, index) => ({
            ...houses[0],
            id: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
            fear: 5,
            adaptable: false,
          })),
        ],
        documents: {
          GUIDELINES: {
            version: "2026.1",
            title: "Bonnes pratiques",
            body: "Respecter les maisons.",
          },
        },
      } as PublicState,
      origin: [2.8, 48.8] as [number, number],
      originLabel: "Point choisi",
      activities: [],
      onOrigin: vi.fn(),
      onPick: vi.fn(),
      onClose: vi.fn(),
      onCalculate: calculate,
      onInvalidate: vi.fn(),
      onFear: vi.fn(),
      maxFear: 1,
    };
    await act(async () => root.render(h(RoutePreparation, props)));
    expect(document.querySelectorAll(".collection-choice")).toHaveLength(2);
    expect(document.querySelector(".route-preparation")?.textContent).toContain(
      "Le niveau choisi inclut également toutes les maisons de niveau inférieur.",
    );
    expect(
      document.querySelector(".route-fear input[type=checkbox]"),
    ).toBeNull();
    await act(async () =>
      root.render(h(RoutePreparation, { ...props, maxFear: 2 })),
    );
    expect(document.querySelectorAll(".collection-choice")).toHaveLength(3);
    await click(document.querySelectorAll(".collection-choice input")[1]);
    await click(document.querySelector(".route-acceptance input")!);
    await click(document.querySelector(".route-submit")!);
    expect(calculate).toHaveBeenCalledOnce();
    expect(calculate.mock.calls[0][0]).toMatchObject({
      maxFear: 2,
      excludedHouseIds: [],
      selectedHouseIds: [houses[0].id, houses[2].id],
      acceptance: { guidelines: true },
    });
  });
});

it("expands the top panel by dragging down and by keyboard, without moving the stop action into it", async () => {
  Object.defineProperty(window, "innerWidth", {
    value: 390,
    configurable: true,
  });
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
    value: vi.fn(),
    configurable: true,
  });
  const onPosition = vi.fn();
  const props = {
    result: {
      stops: [],
      geometry: [],
      distanceMeters: 0,
      durationMinutes: 0,
      disclaimer: "",
    } as unknown as import("../lib/routing").RouteResult,
    phase: "active" as const,
    position: "collapsed" as const,
    onPosition,
    onHouse: vi.fn(),
    onEnd: vi.fn(),
    onStart: vi.fn(),
    onSave: vi.fn(),
    visitedIds: [],
    remaining: 0,
    elapsedSeconds: 0,
    onHeight: vi.fn(),
    selectedStepId: null,
    onAdd: vi.fn(),
    onRemove: vi.fn(),
  };
  await act(async () => root.render(h(RouteSheet, props)));
  const handle = byLabel("Déplier ou replier ma sélection");
  const panel = document.querySelector(".collection-top-panel")!;
  vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({
    height: 78,
  } as DOMRect);
  await act(async () => {
    handle.dispatchEvent(
      new MouseEvent("pointerdown", { clientY: 40, button: 0, bubbles: true }),
    );
    handle.dispatchEvent(
      new MouseEvent("pointermove", { clientY: 220, button: 0, bubbles: true }),
    );
    handle.dispatchEvent(
      new MouseEvent("pointerup", { clientY: 220, button: 0, bubbles: true }),
    );
  });
  expect(onPosition).toHaveBeenLastCalledWith("intermediate");
  await act(async () =>
    root.render(h(RouteSheet, { ...props, position: "intermediate" })),
  );
  await act(async () =>
    handle.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    ),
  );
  expect(onPosition).toHaveBeenLastCalledWith("expanded");
  expect(panel.textContent).not.toContain("Arrêter");
});
