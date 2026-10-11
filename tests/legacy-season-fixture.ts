import { db } from "../lib/db";

// Historical TEST data belongs in fixtures, never in the season creation API.
export async function legacyTestSeason(instanceId: string, name: string) {
  return (await db().query(
    "INSERT INTO seasons(instance_id,year,name,is_test,registrations_open,registrations_open_at,opens_at,closes_at,purge_at) VALUES($1,2026,$2,true,true,'2000-01-01T00:00Z','2000-01-01T00:00Z','2201-01-01T00:00Z','2201-01-02T00:00Z') RETURNING *",
    [instanceId, name],
  )).rows[0];
}
