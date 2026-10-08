import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
export function checkPreprodModel(config) {
  assert.equal(config.name, "halloween-map-ux-preprod");
  assert.equal(config.networks.database.internal, true);
  assert.equal(config.networks.proxy.external, true);
  assert.ok(
    config.networks.proxy.name && !config.networks.proxy.name.includes("${"),
  );
  assert.ok(!config.volumes.postgres_data.external);
  assert.equal(
    config.volumes.postgres_data.name,
    "halloween-map-ux-preprod-postgres",
  );
  for (const [name, service] of Object.entries(config.services)) {
    assert.ok(
      !service.ports?.length && !service.container_name && !service.build,
      name,
    );
    assert.ok(
      !service.network_mode && !service.privileged && service.pid !== "host",
      name,
    );
    if (name === "db") {
      assert.equal(service.volumes.length, 1);
      assert.equal(service.volumes[0].type, "volume");
      assert.equal(service.volumes[0].source, "postgres_data");
      assert.equal(service.volumes[0].target, "/var/lib/postgresql/data");
    } else assert.ok(!service.volumes?.length, name);
    assert.deepEqual(
      Object.keys(service.networks).sort(),
      name === "app" ? ["database", "proxy"] : ["database"],
    );
    if (name === "db") {
      assert.equal(service.environment.POSTGRES_DB, "halloween_ux_preprod");
      assert.equal(service.environment.POSTGRES_USER, "halloween_ux_preprod");
      assert.equal(
        service.environment.POSTGRES_PASSWORD_FILE,
        "/run/secrets/preprod_db_password",
      );
    } else {
      assert.match(service.image, /:ux-preprod-[a-f0-9]{40}$/);
      assert.deepEqual(service.entrypoint, [
        "node",
        "scripts/preprod-runtime.mjs",
      ]);
      assert.equal(service.environment.HALLOWEEN_PREPROD, "true");
      assert.equal(service.environment.COOKIE_SECURE, "true");
      assert.equal(service.environment.SMTP_HOST, "");
      assert.equal(service.environment.SMTP_FROM, "");
      assert.ok(
        !service.environment.DATABASE_URL && !service.environment.SETUP_TOKEN,
      );
      const origin = new URL(service.environment.APP_ORIGIN);
      assert.equal(origin.protocol, "https:");
      assert.equal(origin.origin, service.environment.APP_ORIGIN);
    }
  }
  assert.deepEqual(Object.keys(config.services).sort(), [
    "app",
    "db",
    "migrate",
    "seed",
    "worker",
  ]);
  assert.equal(config.services.app.labels["traefik.enable"], "false");
  for (const name of ["app", "worker"])
    assert.equal(
      config.services[name].depends_on.seed.condition,
      "service_completed_successfully",
    );
  for (const [name, secret] of Object.entries(config.secrets))
    assert.equal(secret.environment, name.toUpperCase());
  assert.deepEqual(Object.keys(config.secrets).sort(), [
    "preprod_admin_password",
    "preprod_db_password",
    "preprod_user_password",
  ]);
  for (const name of ["app", "worker", "migrate", "seed"])
    assert.equal(config.services[name].image, config.services.app.image);
  assert.equal(config.services.app.secrets.length, 1);
  assert.equal(config.services.worker.secrets.length, 1);
  assert.equal(config.services.seed.secrets.length, 3);
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const model =
    process.argv[2] === "--model"
      ? JSON.parse(readFileSync(process.argv[3], "utf8"))
      : JSON.parse(
          execFileSync(
            "docker",
            [
              "compose",
              "--env-file",
              process.argv[2] ?? "deploy/preprod/.env",
              "-f",
              "deploy/preprod/compose.yaml",
              "config",
              "--format",
              "json",
            ],
            { encoding: "utf8" },
          ),
        );
  checkPreprodModel(model);
  console.log(
    "Configuration préproduction : isolation, secrets, HTTPS et tag spécifique OK",
  );
}
