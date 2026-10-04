import { Pool } from "pg";
export interface Database {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
}
const globalDb = globalThis as unknown as {
  halloweenPool?: Pool;
  testDb?: Database;
};
export function db(): Database {
  if (globalDb.testDb) return globalDb.testDb;
  globalDb.halloweenPool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  });
  return globalDb.halloweenPool;
}
export async function transaction<T>(
  fn: (client: Database) => Promise<T>,
): Promise<T> {
  if (globalDb.testDb) {
    await db().query("BEGIN");
    try {
      const result = await fn(db());
      await db().query("COMMIT");
      return result;
    } catch (e) {
      await db().query("ROLLBACK");
      throw e;
    }
  }
  db();
  const client = await globalDb.halloweenPool!.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
