import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { it, expect, vi } from "vitest";
import { publicHouse, effectiveActivities, type House } from "../lib/domain";
import VisitorHouse from "../components/VisitorHouse";
vi.stubGlobal("React", React);
const base: House = {
  id: "house",
  instance_id: "instance",
  season_id: "season",
  user_id: "owner",
  name: "Maison test",
  address: "18 rue de la Picardie, 77580 Villiers-sur-Morin",
  latitude: 48.1,
  longitude: 2.9,
  activities: ["DECORATION", "CANDY"],
  fear: 4,
  adaptable: false,
  starts_at: new Date(Date.now() - 3600000).toISOString(),
  ends_at: new Date(Date.now() + 3600000).toISOString(),
  rp: "Une belle maison décorée.",
  practical: "Entrée côté jardin.",
  candy_available: true,
  status: "VISIBLE",
  activity: "ACTIVE",
};
function markup(house: House) {
  return renderToStaticMarkup(
    React.createElement(VisitorHouse, {
      house: publicHouse(house),
      timezone: "Europe/Paris",
      onClose: () => {},
    }),
  );
}
it.each([
  [true, false],
  [false, false],
  [true, true],
  [false, true],
])(
  "keeps offered activities independent of stock %s and adaptation %s",
  (candy_available, adaptable) => {
    const html = markup({ ...base, candy_available, adaptable });
    expect(html.match(/class="is-offered"/g)).toHaveLength(2);
    expect(html.match(/class="is-absent"/g)).toHaveLength(1);
    expect(html).toContain("Bonbons : proposée");
    expect(html).toContain(candy_available ? "disponibles" : "épuisés");
    expect(html).toContain("Disponible</strong>");
    expect(html.includes("S’adapte à ses visiteurs")).toBe(adaptable);
    expect(html.includes("Niveau de frayeur de référence")).toBe(adaptable);
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-valuenow="4"');
    for (const label of [
      "Très doux",
      "Familial",
      "Modéré",
      "Frissonnant",
      "Intense",
    ])
      expect(html).toContain(label);
    expect(html).not.toContain("chevron");
    expect(html).toContain("Voir sur la carte");
  },
);
it("shows absent candy in gray without a stock block", () => {
  const html = markup({ ...base, activities: ["DECORATION"] });
  expect(html).toContain("Bonbons : non proposée");
  expect(html).not.toContain('class="visitor-stock');
});
it("adds presentation metadata without changing effective business activities", () => {
  const house = { ...base, candy_available: false, adaptable: true };
  const presentation = publicHouse(house);
  expect(presentation.activities).toEqual(effectiveActivities(house));
  expect(presentation.activities).toEqual(["DECORATION"]);
  expect(presentation.offeredActivities).toEqual(["DECORATION", "CANDY"]);
  expect(presentation.fear).toBeNull();
  expect(presentation.referenceFear).toBe(4);
});
it("does not invent stock or a reference fear for legacy browser houses", () => {
  const house = publicHouse({ ...base, adaptable: true });
  delete house.offeredActivities;
  delete house.candy_available;
  delete house.referenceFear;
  const html = renderToStaticMarkup(
    React.createElement(VisitorHouse, {
      house,
      timezone: "Europe/Paris",
      onClose: () => {},
    }),
  );
  expect(html).toContain("Stock non renseigné");
  expect(html).toContain("Niveau de référence non renseigné");
  expect(html).not.toContain("aria-valuenow=");
});
