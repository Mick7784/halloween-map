import { ensureBootstrap } from "../lib/bootstrap";
import { db } from "../lib/db";
import { Pool } from "pg";
const link = await ensureBootstrap(process.argv.includes("--rotate"));
if (link) console.log("Configuration initiale (usage unique):", link);
else
  console.log(
    "Configuration déjà créée ou lien déjà généré. Avant configuration seulement : --rotate pour renouveler le lien.",
  );
await (db() as Pool).end();
