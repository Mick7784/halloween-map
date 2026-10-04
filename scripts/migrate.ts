import { readdir, readFile } from "node:fs/promises";
import { Pool } from "pg";
export async function migrate(pool: Pool) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(710032)");
    await c.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const name of (await readdir("migrations"))
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      if (
        (
          await c.query("SELECT name FROM schema_migrations WHERE name=$1", [
            name,
          ])
        ).rowCount
      )
        continue;
      await c.query(await readFile("migrations/" + name, "utf8"));
      await c.query("INSERT INTO schema_migrations(name) VALUES($1)", [name]);
      console.log("Migration:", name);
    }
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
migrate(pool)
  .then(() => pool.end())
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
