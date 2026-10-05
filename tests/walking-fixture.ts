import type { WalkingRouter } from "../lib/walking-router";
// Deterministic test provider; production never substitutes these fixtures.
export const fixtureRouter: WalkingRouter = {
  async matrix(points) {
    return points.map((_, a) =>
      points.map((_, b) => ({
        distanceMeters: a === b ? 0 : 140,
        durationSeconds: a === b ? 0 : 120,
      })),
    );
  },
  async directions(points) {
    return {
      geometry: points.map((p) => [p.longitude, p.latitude]),
      legs: points
        .slice(1)
        .map(() => ({ distanceMeters: 140, durationSeconds: 120 })),
    };
  },
};
