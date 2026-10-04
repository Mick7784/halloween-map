// Local browser verification only. Production always uses PostgreSQL via Compose.
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { readdir, readFile } from "node:fs/promises";
const db = await PGlite.create();
for (const file of (await readdir("migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort()) {
  await db.exec(await readFile("migrations/" + file, "utf8"));
  await db.query("INSERT INTO schema_migrations(name) VALUES($1)", [file]);
}
const server = new PGLiteSocketServer({
  db,
  host: "127.0.0.1",
  port: 54329,
  maxConnections: 30,
});
await server.start();
console.log("Disposable test database listening on 127.0.0.1:54329");
process.on("SIGINT", async () => {
  await server.stop();
  await db.close();
  process.exit(0);
});
