import { describe, expect, it } from "vitest";
import { halloweenAdminNavigation } from "../lib/halloween-admin-navigation";
import { visibleStudioNavigation } from "../lib/studio-navigation";

const allSections = [
  "dashboard", "houses", "users", "seasons", "statistics",
  "activity", "communications", "content", "settings",
];
const ids = (permissions: readonly string[]) =>
  visibleStudioNavigation(halloweenAdminNavigation, (p) =>
    permissions.includes(p),
  ).flatMap((group) => group.items.map((item) => item.id));

describe("DomotiK Studio independent back-office navigation", () => {
  it("retains all nine Halloween Map modules in their existing order", () => {
    const grants = halloweenAdminNavigation.flatMap((g) =>
      g.items.map((item) => item.permission),
    );
    expect(ids(grants)).toEqual(allSections);
    expect(new Set(ids(grants)).size).toBe(allSections.length);
  });

  it("does not import any LinKs-specific business menu", () => {
    expect(ids(halloweenAdminNavigation.flatMap((g) =>
      g.items.map((item) => item.permission),
    ))).not.toEqual(expect.arrayContaining([
      "promotions", "tracked-links", "stories", "shortcuts",
    ]));
  });

  it("hides empty groups and preserves the actual permission boundary", () => {
    const groups = visibleStudioNavigation(halloweenAdminNavigation, (p) =>
      ["participants.read", "content.manage"].includes(p),
    );
    expect(groups.map((g) => g.title)).toEqual(["Gestion", "Configuration"]);
    expect(groups.flatMap((g) => g.items.map((i) => i.id))).toEqual([
      "houses", "content",
    ]);
  });

  it("renders no menu for a user without any grants", () => {
    expect(visibleStudioNavigation(halloweenAdminNavigation, () => false))
      .toEqual([]);
  });

  it("never mutates the shared product navigation definition", () => {
    const original = halloweenAdminNavigation.map((group) =>
      group.items.map((item) => item.id),
    );
    ids(["users.read"]);
    ids(["stats.read", "communications.read"]);
    expect(halloweenAdminNavigation.map((group) =>
      group.items.map((item) => item.id),
    )).toEqual(original);
  });
});
