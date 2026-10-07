import { describe, it, expect } from "vitest";
import { initialHouseLocation, validateHouseForm } from "../lib/house-form";
import { participationDefaults } from "../lib/participation-settings";
const context = {
  zone: "Europe/Paris",
  opens: "2026-10-31T16:00:00Z",
  closes: "2026-11-01T01:00:00Z",
};
const house = {
  name: "Maison des lanternes",
  address: "12 bis rue des Lanternes, 35000 Rennes",
  address_parts: {
    number: "12 bis",
    street: "rue des Lanternes",
    postalCode: "35000",
    city: "Rennes",
    cityCode: "35238",
  },
  latitude: 48.11,
  longitude: -1.67,
  position_confirmed: true,
  activities: ["DECORATION", "CANDY"],
  starts_at: "2026-10-31T18:00",
  ends_at: "2026-10-31T22:00",
  fear: 3,
  adaptable: false,
  rp: "Un jardin illuminé",
  practical: "Entrée par le portail",
};
describe("common public / BO house validation", () => {
  it("keeps the same normalized payload for public creation, BO creation and editing", () => {
    const publicCreation = validateHouseForm(house, context);
    expect(validateHouseForm(house, { ...context, adminEdit: true })).toEqual(
      publicCreation,
    );
    expect(publicCreation).not.toHaveProperty("review_status");
    expect(publicCreation).not.toHaveProperty("userId");
  });
  it.each([
    { name: "" },
    { activities: [] },
    { latitude: 91 },
    { longitude: -181 },
    { position_confirmed: false },
    { fear: 6 },
    { ends_at: "2026-10-31T17:00" },
    { address_parts: { ...house.address_parts, postalCode: "3500" } },
    { address_parts: { ...house.address_parts, number: "n'importe quoi" } },
  ])(
    "rejects the same invalid common fields in every context: %j",
    (invalid) => {
      for (const adminEdit of [false, true])
        expect(() =>
          validateHouseForm(
            { ...house, ...invalid },
            { ...context, adminEdit },
          ),
        ).toThrow();
    },
  );
  it("preserves the administrative exception for historical text and communes", () => {
    const settings = {
      ...participationDefaults,
      allowedCommuneCodes: ["75056"],
      descriptionLimit: 80,
    };
    expect(() => validateHouseForm(house, { ...context, settings })).toThrow(
      "commune",
    );
    const long = { ...house, rp: "a".repeat(200) };
    expect(() => validateHouseForm(long, context)).toThrow("description");
    expect(
      validateHouseForm(long, { ...context, settings, adminEdit: true }).rp,
    ).toHaveLength(200);
    expect(() =>
      validateHouseForm(
        { ...house, rp: "a".repeat(301) },
        { ...context, adminEdit: true },
      ),
    ).toThrow();
  });
  it("respects entered TEST hours without changing REAL bounds", () => {
    const test = {
      ...house,
      starts_at: "2026-10-07T18:00",
      ends_at: "2026-10-07T20:00",
    };
    expect(validateHouseForm(test, { ...context, isTest: true }).ends_at).toBe(
      test.ends_at,
    );
    expect(() => validateHouseForm(test, context)).toThrow("saison");
  });
  it("does not invent an address or confirm an empty creation point", () => {
    const initial = initialHouseLocation();
    expect(initial.point).toBeNull();
    expect(initial.confirmed).toBe(false);
    expect(initial.address.cityCode).toBe("");
  });
});
