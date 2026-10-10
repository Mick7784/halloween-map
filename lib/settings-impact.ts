import { createHash } from "node:crypto";
import type { Instance } from "./domain";
import { instanceSchema } from "./validation";
import type { z } from "zod";
const fields = {
  territory: "commune / territoire",
  postal_code: "code postal",
  country: "pays",
  timezone: "fuseau horaire",
  latitude: "latitude du centre",
  longitude: "longitude du centre",
} as const;
export function locationImpact(
  current: Instance,
  next: z.infer<typeof instanceSchema>,
) {
  const values = Object.keys(fields).map(
    (key) => current[key as keyof typeof fields],
  );
  return {
    changes: Object.entries(fields)
      .filter(
        ([key]) =>
          current[key as keyof typeof fields] !==
          next[key as keyof typeof fields],
      )
      .map(([, label]) => label),
    fingerprint: createHash("sha256")
      .update(JSON.stringify(values))
      .digest("hex"),
  };
}
