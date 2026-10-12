// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import UserMenu from "../components/UserMenu";
import CollectionProgress from "../components/CollectionProgress";
import { HouseFearFields } from "../components/HouseFields";
import { selectedCollectionStats, emptyCollection } from "../lib/collection";
import type { User } from "../lib/domain";
import type { PublicState } from "../components/common";
import type { RouteResult } from "../lib/routing";
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => [{ year: 2025 }, { year: 2026 }, { year: 2025 }],
      }),
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const user = {
  id: "user",
  display_name: "Camille",
  email: "user@example.invalid",
  email_status: "VERIFIED",
  permissions: [],
  role_name: "USER",
} as unknown as User;
const state = {
  mapAccessible: false,
  collectionAccessible: false,
  projectLinks: { contactEnabled: false, bugEnabled: false },
} as PublicState;
it.each([
  ["USER", [], false],
  ["ADMIN", [], false],
  ["USER", ["admin.access"], true],
  ["SUPER_ADMIN", ["admin.access"], true],
])(
  "gates administration by actual permissions for %s, preserving account actions",
  async (role, permissions, admin) => {
    await act(async () =>
      root.render(
        h(UserMenu, {
          user: {
            ...user,
            role_name: role as string,
            permissions: permissions as string[],
          },
          state,
          version: "V0.8.7",
          login: null,
          onClose: vi.fn(),
        }),
      ),
    );
    expect(!!host.querySelector('a[href="/admin"]')).toBe(admin);
    expect(host.querySelector('a[href="/map"]')).toBeNull();
    expect(host.querySelector('a[href="/map#parcours"]')).toBeNull();
    for (const label of [
      "Ma participation",
      "Mes informations",
      "Mot de passe",
      "Mes années de participation",
      "Confidentialité et données",
      "Se déconnecter",
      "Supprimer mon compte",
    ])
      expect(host.textContent).toContain(label);
    expect(
      host.querySelector("form,details,.account-row-copy small"),
    ).toBeNull();
    const dialog = host.querySelector('[role="dialog"]');
    const years = [...host.querySelectorAll("button")].find(
      (b) => b.textContent === "Mes années de participation",
    )!;
    await act(async () => years.click());
    expect(host.querySelector('[role="dialog"]')).toBe(dialog);
    expect(
      [...host.querySelectorAll("li")].map((el) => el.textContent),
    ).toEqual([
      "Halloween 2026 — Participation validée",
      "Halloween 2025 — Participation validée",
    ]);
    expect(host.querySelectorAll(".account-back")).toHaveLength(1);
    expect(host.querySelectorAll(".account-close")).toHaveLength(1);
  },
);
it("preserves map and collection gates independently and honours disabled project links", async () => {
  await act(async () =>
    root.render(
      h(UserMenu, {
        user,
        state: { ...state, mapAccessible: true, collectionAccessible: false },
        version: "V0.8.7",
        login: null,
        onClose: vi.fn(),
      }),
    ),
  );
  expect(host.querySelector('a[href="/map"]')).not.toBeNull();
  expect(host.querySelector('a[href="/map#parcours"]')).toBeNull();
  expect(host.textContent).not.toContain("Signaler un bug");
  expect(host.textContent).not.toContain("Contacter l’organisateur");
  await act(async () =>
    root.render(
      h(UserMenu, {
        user,
        state: { ...state, mapAccessible: false, collectionAccessible: true },
        version: "V0.8.7",
        login: null,
        onClose: vi.fn(),
      }),
    ),
  );
  expect(host.querySelector('a[href="/map"]')).toBeNull();
  expect(host.querySelector('a[href="/map#parcours"]')).not.toBeNull();
});
it("shows 0, 50 and 100 immediately, pulses only on completion and resets when selection grows", async () => {
  vi.useFakeTimers();
  try {
    for (const [visited, selected, percent] of [
      [0, 0, 0],
      [0, 2, 0],
      [1, 2, 50],
      [2, 2, 100],
      [2, 4, 50],
    ]) {
      await act(async () =>
        root.render(h(CollectionProgress, { visited, selected })),
      );
      expect(
        host
          .querySelector('[role="progressbar"]')
          ?.getAttribute("aria-valuenow"),
      ).toBe(String(percent));
      expect(
        (host.querySelector(".collection-potion-fill") as HTMLElement).style
          .width,
      ).toBe(`${percent}%`);
      expect(!!host.querySelector(".is-complete")).toBe(percent === 100);
    }
    await act(async () =>
      root.render(h(CollectionProgress, { visited: 4, selected: 4 })),
    );
    await act(async () => vi.advanceTimersByTime(650));
    expect(host.querySelector(".is-complete")).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});
it("counts only unique selected and validated houses, including selected unavailable houses", () => {
  const stops = ["a", "b", "a"].map((id) => ({
    house: { id },
    unavailable: id === "b",
  })) as RouteResult["stops"];
  expect(
    selectedCollectionStats(
      { ...emptyCollection(), visitedIds: ["a", "a", "outside"] },
      stops,
    ),
  ).toMatchObject({ selected: 2, visited: 1, completion: 50 });
  expect(
    selectedCollectionStats(
      { ...emptyCollection(), visitedIds: ["a", "b"] },
      stops,
    ).completion,
  ).toBe(100);
  expect(
    selectedCollectionStats({ ...emptyCollection(), visitedIds: ["a"] }, [])
      .completion,
  ).toBe(0);
});
it("removes the complete gauge in adaptive mode and restores the preserved standard fear", async () => {
  const props = { fear: 4, adapt: false, onFear: vi.fn(), onAdapt: vi.fn() };
  await act(async () => root.render(h(HouseFearFields, props)));
  expect(
    (host.querySelector('input[type="range"]') as HTMLInputElement).value,
  ).toBe("4");
  await act(async () =>
    root.render(h(HouseFearFields, { ...props, adapt: true })),
  );
  expect(
    host.querySelector(
      '.house-fear-gauge,input[type="range"],.house-fear-labels',
    ),
  ).toBeNull();
  expect(host.querySelector(".participation-adapt")?.textContent).toContain(
    "à l’âge et à la sensibilité",
  );
  expect(host.querySelector(".lucide-heart-handshake")).not.toBeNull();
  expect(host.querySelector(".lucide-drama")).toBeNull();
  await act(async () => root.render(h(HouseFearFields, props)));
  expect(
    (host.querySelector('input[type="range"]') as HTMLInputElement).value,
  ).toBe("4");
});
