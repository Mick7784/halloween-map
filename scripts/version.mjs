import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
export function nextVersion(current, override) {
  const pattern = /^V(\d+)\.([1-9])(\d{2,})?(?:\.([1-9]\d*))?$/;
  const match = pattern.exec(current);
  if (!match) throw new Error("Invalid version: " + current);
  if (override) {
    if (!pattern.test(override)) throw new Error("Invalid override");
    if (override === current) throw new Error("Version unchanged");
    return override;
  }
  if (match[4]) return `V${match[1]}.${match[2]}.${Number(match[4]) + 1}`;
  return `V${match[1]}.${match[2]}${String(Number(match[3] ?? 0) + 1).padStart(2, "0")}`;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const current = readFileSync("VERSION", "utf8").trim(),
    version = nextVersion(current, process.argv[2]);
  writeFileSync("VERSION", version + "\n");
  const changelog = readFileSync("CHANGELOG.md", "utf8");
  writeFileSync(
    "CHANGELOG.md",
    changelog.replace(
      "# Changelog\n",
      `# Changelog\n\n## ${version}\n\n- Mise à jour de maintenance (compléter avant publication).\n`,
    ),
  );
  console.log(version);
}
