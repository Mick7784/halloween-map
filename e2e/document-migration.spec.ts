import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { readdir, readFile } from "node:fs/promises";

test.skip(
  !process.env.SEASON_E2E_DATABASE_URL,
  "Requires an explicitly disposable database",
);
test("PostgreSQL upgrade from 014 preserves legacy bytes, accounts, houses and genuine acceptances; 015 replays", async () => {
  const pool = new Pool({
    connectionString: process.env.SEASON_E2E_DATABASE_URL,
  });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    // The transaction is rolled back, restoring the disposable suite's schema.
    await c.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
    for (const file of (await readdir("migrations"))
      .filter((f) => f.endsWith(".sql") && f < "015")
      .sort())
      await c.query(await readFile("migrations/" + file, "utf8"));
    await c.query(`INSERT INTO instances(public_name,territory,postal_code,country,latitude,longitude) VALUES('Migration fixture','Rennes','35000','France',48.1,-1.67);
      INSERT INTO seasons(instance_id,year,name,is_test,opens_at,closes_at,registrations_open_at,purge_at) SELECT id,2026,'Existing season',false,'2026-10-31','2026-11-01','2026-10-01','2026-11-02' FROM instances;
      INSERT INTO users(instance_id,email,display_name,password_hash,kind) SELECT id,'legacy-docs@example.invalid','Existing account','KEEP_HASH','PARTICIPANT' FROM instances;
      INSERT INTO participations(instance_id,season_id,user_id,name,address,latitude,longitude,activities,starts_at,ends_at,fear,terms_version,terms_accepted_at,guidelines_version,guidelines_accepted_at) SELECT i.id,s.id,u.id,'Existing house','KEEP_ADDRESS',48.1,-1.67,ARRAY['CANDY'],'2026-10-31T17:00Z','2026-10-31T20:00Z',2,'2026.1',NULL,'2026.1','2026-10-01T12:00Z' FROM instances i,seasons s,users u;`);
    const original =
      "## Texte original\r\n\r\n**Été** · <historique>\nFin sans normalisation  ";
    await c.query(
      "INSERT INTO legal_documents(instance_id,kind,version,title,body,status,active,published_at) SELECT id,'GUIDELINES','2026.1','Original',$1,'PUBLISHED',true,'2026-10-01T10:00Z' FROM instances",
      [original],
    );
    const before = (
      await c.query(
        "SELECT id,body,title,version,published_at FROM legal_documents",
      )
    ).rows;
    const sql = await readFile("migrations/015_document_studio.sql", "utf8");
    await c.query(sql);
    await c.query(sql);
    expect(
      (
        await c.query(
          "SELECT id,body,title,version,published_at FROM legal_documents",
        )
      ).rows,
    ).toEqual(before);
    expect((await c.query("SELECT password_hash FROM users")).rows).toEqual([
      { password_hash: "KEEP_HASH" },
    ]);
    expect((await c.query("SELECT address FROM participations")).rows).toEqual([
      { address: "KEEP_ADDRESS" },
    ]);
    // An old GUIDELINES_ONLY row had a TERMS version, but no TERMS timestamp.
    expect(
      (await c.query("SELECT kind,action,version FROM legal_events")).rows,
    ).toEqual([
      { kind: "GUIDELINES", action: "ACKNOWLEDGED", version: "2026.1" },
    ]);
    expect(
      (
        await c.query(
          "SELECT format,content_json,revision FROM legal_documents",
        )
      ).rows,
    ).toEqual([{ format: "markdown", content_json: null, revision: 1 }]);
  } finally {
    await c.query("ROLLBACK");
    c.release();
    await pool.end();
  }
});
