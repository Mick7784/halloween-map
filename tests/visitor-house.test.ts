import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { it, expect, vi } from "vitest";
import { publicHouse, effectiveActivities, type House } from "../lib/domain";
import VisitorHouse from "../components/VisitorHouse";
import FearBadge, {
  fearDescription,
  adaptedFearExplanation,
} from "../components/FearBadge";
vi.stubGlobal("React", React);
it("explains adapted fright with a distinct helping-hand icon and preserves fixed fear labels", () => {
  const label = fearDescription(5, true);
  expect(label).toBe(`Frissons adaptés — ${adaptedFearExplanation}`);
  expect(label).toContain("à l’âge et à la sensibilité");
  const html = renderToStaticMarkup(
    React.createElement(FearBadge, { fear: 5, adaptable: true }),
  );
  expect(html).toContain('aria-label="Frissons adaptés');
  expect(html).toContain("lucide-heart-handshake");
  expect(html).not.toContain("lucide-drama");
  expect(html).not.toContain("5/5");
  expect(fearDescription(4, false)).toBe("Frayeur : Frissonnant (4/5)");
});
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
    expect(html.includes("Frissons adaptés")).toBe(adaptable);
    expect(html).not.toContain("Niveau de frayeur de référence");
    expect(html.includes('role="meter"')).toBe(!adaptable);
    expect(html.includes('aria-valuenow="4"')).toBe(!adaptable);
    for (const label of [
      "Très doux",
      "Familial",
      "Modéré",
      "Frissonnant",
      "Intense",
    ])
      expect(html.includes(label)).toBe(!adaptable);
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
  expect(html).not.toContain("Niveau de référence non renseigné");
  expect(html).not.toContain("house-fear-gauge");
  expect(html).not.toContain("aria-valuenow=");
});
