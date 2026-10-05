import type { House, Instance, Season } from "./domain";
import { DateTime } from "luxon";
export function demoSeason(s: Season): Season {
  return { ...s, activated: true, archived: false, purged_at: null };
}
export function demoTime(i: Instance, s: Season, houses: House[]) {
  const start = +new Date(s.opens_at),
    end = +new Date(s.closes_at);
  const evening = +DateTime.fromObject(
    { year: s.year, month: 10, day: 31, hour: 18 },
    { zone: i.timezone },
  );
  const candidates = [
    evening >= start && evening <= end - 30 * 60000 ? evening : start,
    ...houses.map((h) => +new Date(h.starts_at)),
  ];
  return new Date(
    candidates
      .filter((t) => t >= start && t < end)
      .sort(
        (a, b) =>
          houses.filter(
            (h) => +new Date(h.starts_at) <= b && +new Date(h.ends_at) > b,
          ).length -
          houses.filter(
            (h) => +new Date(h.starts_at) <= a && +new Date(h.ends_at) > a,
          ).length,
      )[0] ?? start,
  );
}
export function fictionalHouses(i: Instance, s: Season): House[] {
  const names = [
    "Les petits fantômes",
    "Le jardin des brumes",
    "Le manoir de minuit",
    "Les lanternes oubliées",
    "Le refuge des sorcières",
  ];
  return names.map((name, n) => ({
    id: `demo-${n}`,
    instance_id: i.id,
    season_id: s.id,
    user_id: "",
    name,
    address: `${n + 1} allée fictive · ${i.territory}`,
    latitude: i.latitude + (n - 2) * 0.001,
    longitude: i.longitude + (n % 2 ? 0.0015 : -0.0015),
    activities: n % 2 ? ["DECORATION", "ACTING"] : ["DECORATION", "CANDY"],
    starts_at: s.opens_at,
    ends_at: s.closes_at,
    fear: n + 1,
    adaptable: n === 0,
    rp: "Une ambiance de démonstration et quelques surprises.",
    practical: "Maison fictive, adresse inexistante.",
    candy_available: true,
    status: "VISIBLE",
    activity: "ACTIVE",
    demo: true,
  }));
}
