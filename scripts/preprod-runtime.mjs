import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

export function preprodEnvironment(environment, password) {
  if (environment.HALLOWEEN_PREPROD !== "true")
    throw new Error("Runtime réservé à la préproduction");
  const origin = new URL(environment.APP_ORIGIN);
  if (
    origin.protocol !== "https:" ||
    origin.origin !== environment.APP_ORIGIN ||
    origin.username ||
    origin.password
  )
    throw new Error(
      "APP_ORIGIN doit être une origine HTTPS exacte, sans chemin",
    );
  if (!password || password.length < 24)
    throw new Error("Secret PostgreSQL préproduction absent ou trop court");
  const result = {
    ...environment,
    DATABASE_URL: `postgresql://halloween_ux_preprod:${encodeURIComponent(password)}@db:5432/halloween_ux_preprod`,
    COOKIE_SECURE: "true",
    SETUP_TOKEN: "",
  };
  for (const key of Object.keys(result))
    if (
      key.startsWith("SMTP_") ||
      key.startsWith("PREPROD_ADMIN_PASSWORD") ||
      key.startsWith("PREPROD_USER_PASSWORD")
    )
      delete result[key];
  result.SMTP_HOST = "";
  result.SMTP_FROM = "";
  return result;
}
function secret(name) {
  return readFileSync(`/run/secrets/${name}`, "utf8").trim();
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const env = preprodEnvironment(process.env, secret("preprod_db_password"));
    const [command, ...args] = process.argv.slice(2);
    if (!command) throw new Error("Commande préproduction absente");
    if (args.includes("scripts/preprod-seed.ts")) {
      env.PREPROD_ADMIN_PASSWORD = secret("preprod_admin_password");
      env.PREPROD_USER_PASSWORD = secret("preprod_user_password");
    }
    const child = spawn(command, args, { env, stdio: "inherit" });
    for (const signal of ["SIGTERM", "SIGINT"])
      process.on(signal, () => child.kill(signal));
    child.on("error", () => {
      console.error("Démarrage préproduction impossible");
      process.exitCode = 1;
    });
    child.on("exit", (code, signal) => {
      for (const forwarded of ["SIGTERM", "SIGINT"])
        process.removeAllListeners(forwarded);
      if (signal) process.kill(process.pid, signal);
      else process.exitCode = code ?? 1;
    });
  } catch {
    console.error(
      "Configuration préproduction invalide : vérifier origine HTTPS et secrets",
    );
    process.exitCode = 1;
  }
}
